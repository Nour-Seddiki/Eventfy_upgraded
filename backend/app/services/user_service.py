from datetime import datetime, timezone

from fastapi import HTTPException
from app.models.event import Event
from app.models.ticket import Ticket
from app.schemas.user import update_password, UpdateUser, UpdateProfile
from app.models.user import User
from app.models.notification import Notification
from app.schemas.notification import CreateNotification, NotificationType
from app.services.auth_service import verifying_password, hashing_password, find_user_by_email
from app.utils.email_rules import email_problem, normalize_email


class userServices:
    @staticmethod
    def _get_active_user(user, db) -> User:
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        user_model = (
            db.query(User)
            .filter(User.id == user.get("user_id"), User.is_deleted.is_(False))
            .first()
        )
        if user_model is None:
            raise HTTPException(status_code=404, detail="user not found")
        return user_model

    @staticmethod
    def change_password(user, db, data: update_password):
        user_model = userServices._get_active_user(user, db)

        if not verifying_password(data.current_password, user_model.hashed_password):
            # 400, not 401: the session is fine, only the typed password is wrong
            raise HTTPException(status_code=400, detail="Your current password is incorrect")
        user_model.hashed_password = hashing_password(data.new_password)

        db.add(user_model)
        db.commit()
        db.refresh(user_model)
        return {"message": "the password has been changed successfully"}

    @staticmethod
    def update_user(user, db, data: UpdateUser):
        user_model = userServices._get_active_user(user, db)

        email = normalize_email(data.email)
        if email != normalize_email(user_model.email):
            problem = email_problem(email)
            if problem:
                raise HTTPException(status_code=422, detail={"field": "email", "message": problem})
            if find_user_by_email(db, email) is not None:
                raise HTTPException(status_code=409, detail={"field": "email", "message": "Another account already uses this email."})
        if data.user_name != user_model.username and db.query(User).filter(User.username == data.user_name).first():
            raise HTTPException(status_code=409, detail="Username already taken")

        user_model.username = data.user_name
        user_model.email = email

        db.add(user_model)
        db.commit()
        db.refresh(user_model)
        return {"message": "the user has been updated successfully"}


    @staticmethod
    def _organizer_request_pending(db, user_model: User) -> bool:
        if user_model.role != "attendee":
            return False
        return db.query(Notification).filter(
            Notification.type == NotificationType.ORGANIZER_REQUEST.value,
            Notification.related_object_type == "user",
            Notification.related_object_id == str(user_model.id),
        ).first() is not None

    @staticmethod
    def request_organizer_access(user, db):
        """Ask the admins to promote this attendee to organizer.

        The request is recorded as notifications (to every admin, plus a
        confirmation to the requester); PUT /admin/change_role resolves it.
        """
        from app.services.notification_service import NotificationService

        user_model = userServices._get_active_user(user, db)
        if user_model.role != "attendee":
            raise HTTPException(status_code=400, detail="Your account already has organizer access")
        if userServices._organizer_request_pending(db, user_model):
            return {"status": "pending"}

        name = user_model.full_name or user_model.username
        admins = db.query(User).filter(User.role == "admin", User.is_deleted.is_(False)).all()
        recipients = [(a.id, "Organizer access requested",
                       f"{name} ({user_model.email}) wants to publish events. Promote them from the admin panel.")
                      for a in admins]
        recipients.append((user_model.id, "Organizer request sent",
                           "An admin will review your request and upgrade your account."))
        from app.services.chat_service import ChatService
        ChatService.open_support(
            db, user_model, "organizer_access",
            "Hi! I'd like organizer access so I can publish IT events on Eventfy.",
            notify=False,  # the admins get the organizer-request notification below
        )
        for recipient_id, title, message in recipients:
            NotificationService.create_notification(db, CreateNotification(
                user_id=recipient_id,
                type=NotificationType.ORGANIZER_REQUEST,
                title=title,
                message=message,
                related_object_id=str(user_model.id),
                related_object_type="user",
            ))
        return {"status": "pending"}

    def get_my_profile(self ,user,db):
        user_model = self._get_active_user(user, db)
        return {
            "id": user_model.id,
            "organizer_request_pending": self._organizer_request_pending(db, user_model),
            "username": user_model.username,
            "email": user_model.email,
            "role": user_model.role,
            "is_verified": user_model.is_verified,
            "created_at": user_model.created_at,
            "full_name": user_model.full_name,
            "bio": user_model.bio,
            "phone": user_model.phone,
            "location": user_model.location,
            "website": user_model.website,
            "avatar_url": user_model.avatar_url,
            "preferred_currency": user_model.preferred_currency or "DZD",
            # Global Profile fields (1-Click Autofill)
            "university": user_model.university,
            "major": user_model.major,
            "dietary_restrictions": user_model.dietary_restrictions,
            "date_of_birth": user_model.date_of_birth,
            "gender": user_model.gender,
        }

    def update_profile(self, user, db, data: UpdateProfile):
        """Partial update for extended profile fields only."""
        user_model = self._get_active_user(user, db)

        update_data = data.dict(exclude_unset=True)
        for field, value in update_data.items():
            if value is not None:
                setattr(user_model, field, value)

        db.add(user_model)
        db.commit()
        db.refresh(user_model)
        return self.get_my_profile(user, db)

    def update_avatar(self, user, db, avatar_url: str):
        """Save a new avatar URL for the current user."""
        user_model = self._get_active_user(user, db)
        user_model.avatar_url = avatar_url
        db.add(user_model)
        db.commit()
        db.refresh(user_model)
        return self.get_my_profile(user, db)
    


    def delete_my_account(self,user,db):
        user_model = self._get_active_user(user, db)

        if user_model.is_deleted:
            return {"message": "user account already deleted"}

        # Cancel tickets for events that haven't happened yet and give the
        # seats back; past tickets stay as history.
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        upcoming = (
            db.query(Ticket, Event)
            .join(Event, Ticket.event_id == Event.id)
            .filter(Ticket.user_id == user_model.id, Ticket.status == "active", Event.start_date >= now)
            .all()
        )
        for ticket, event in upcoming:
            ticket.status = "cancelled"
            event.available_tickets = (event.available_tickets or 0) + 1

        # Soft delete keeps historical data for tickets/events.
        user_model.is_deleted = True
        user_model.deleted_at = datetime.now(timezone.utc)
        user_model.is_verified = False
        db.add(user_model)
        db.commit()
        return {"message": "user has been soft deleted successfully"}

    def get_my_activity(self ,user,db):
        user_model = self._get_active_user(user, db)

        tickets = db.query(Ticket).filter(Ticket.user_id == user_model.id).all()
        events = []
        if user_model.role == "organizer":
            events = db.query(Event).filter(Event.organizer_id == user_model.id, Event.is_deleted.is_(False)).all()

        return {
            "user": {
                "id": user_model.id,
                "username": user_model.username,
                "email": user_model.email,
                "role": user_model.role,
            },
            "tickets": [
                {
                    "ticket_id": str(ticket.id),
                    "event_id": ticket.event_id,
                    "qr_code": ticket.qr_code,
                    "status": ticket.status,
                    "purchased_at": ticket.purchased_at,
                }
                for ticket in tickets
            ],
            "organized_events": [
                {
                    "event_id": event.id,
                    "title": event.title,
                    "start_date": event.start_date,
                    "available_tickets": event.available_tickets,
                }
                for event in events
            ],
        }

         
