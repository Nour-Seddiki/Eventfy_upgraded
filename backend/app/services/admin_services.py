from datetime import datetime, timezone, timedelta
from calendar import monthrange
from app.models.event import Event
from app.models.ticket import Ticket
from app.models.payment import Payment
from app.models.review import Review
from app.schemas.ticket import TicketStatus
from fastapi import HTTPException, status
from app.models.user import User
from sqlalchemy import func, extract, case
from app.services.notification_service import NotificationService
from app.schemas.notification import CreateNotification, NotificationType
import logging

logger = logging.getLogger(__name__)


def _require_admin(user):
    """Raise if the caller is not authenticated or not an admin."""
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication failed")
    if user.get("user_role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )


class Admin:
    # ──────────────────────────────────────────
    # USERS
    # ──────────────────────────────────────────

    def view_all_users(self, user, db):
        _require_admin(user)
        users_model = db.query(User).all()
        if not users_model:
            raise HTTPException(status_code=404, detail="Users not found")
        return users_model

    def deactivate_user(self, user, db, user_to_deactivate):
        _require_admin(user)
        user_model = (
            db.query(User)
            .filter(User.id == user_to_deactivate, User.is_deleted.is_(False))
            .first()
        )
        if user_model is None:
            raise HTTPException(status_code=404, detail="User not found")

        user_model.is_deleted = True
        user_model.deleted_at = datetime.now(timezone.utc)
        user_model.is_verified = False
        db.add(user_model)
        db.commit()
        db.refresh(user_model)
        return {"message": "User has been deactivated successfully"}

    def ban_user(self, user, db, user_to_ban):
        """Ban a user permanently — they cannot log in."""
        _require_admin(user)
        user_model = (
            db.query(User)
            .filter(User.id == user_to_ban)
            .first()
        )
        if user_model is None:
            raise HTTPException(status_code=404, detail="User not found")
        if user_model.role == "admin":
            raise HTTPException(status_code=403, detail="Cannot ban an admin user")

        user_model.is_banned = True
        user_model.ban_reason = "Banned by administrator"
        db.add(user_model)
        db.commit()
        db.refresh(user_model)

        # Notify the banned user
        try:
            notif_data = CreateNotification(
                user_id=user_model.id,
                type=NotificationType.EVENT_CANCELLED,
                title="Account Banned",
                message="Your account has been banned by an administrator. Contact support for assistance.",
            )
            NotificationService.create_notification(db, notif_data)
        except Exception as exc:
            logger.warning("Failed to create ban notification: %s", exc)

        return {"message": "User has been banned successfully"}

    def restrict_user(self, user, db, user_to_restrict):
        """Restrict a user — they can browse but cannot buy tickets or register."""
        _require_admin(user)
        user_model = (
            db.query(User)
            .filter(User.id == user_to_restrict)
            .first()
        )
        if user_model is None:
            raise HTTPException(status_code=404, detail="User not found")
        if user_model.role == "admin":
            raise HTTPException(status_code=403, detail="Cannot restrict an admin user")

        user_model.is_restricted = True
        user_model.ban_reason = "Restricted by administrator"
        db.add(user_model)
        db.commit()
        db.refresh(user_model)

        # Notify the restricted user
        try:
            notif_data = CreateNotification(
                user_id=user_model.id,
                type=NotificationType.EVENT_UPDATED,
                title="Account Restricted",
                message="Your account has been restricted. You can browse events but cannot purchase tickets or register.",
            )
            NotificationService.create_notification(db, notif_data)
        except Exception as exc:
            logger.warning("Failed to create restriction notification: %s", exc)

        return {"message": "User has been restricted successfully"}

    def unrestrict_user(self, user, db, user_to_unrestrict):
        """Remove restrictions from a user."""
        _require_admin(user)
        user_model = (
            db.query(User)
            .filter(User.id == user_to_unrestrict)
            .first()
        )
        if user_model is None:
            raise HTTPException(status_code=404, detail="User not found")

        user_model.is_restricted = False
        user_model.ban_reason = None
        db.add(user_model)
        db.commit()
        db.refresh(user_model)

        # Notify the user
        try:
            notif_data = CreateNotification(
                user_id=user_model.id,
                type=NotificationType.EVENT_UPDATED,
                title="Restriction Lifted",
                message="Your account restrictions have been removed. You can now register for events and purchase tickets.",
            )
            NotificationService.create_notification(db, notif_data)
        except Exception as exc:
            logger.warning("Failed to create unrestrict notification: %s", exc)

        return {"message": "User restrictions have been removed"}

    def delete_user(self, user, db, user_to_delete):
        return self.deactivate_user(user, db, user_to_delete)

    def reactive_user(self, user, db, user_to_reactive):
        _require_admin(user)
        user_model = (
            db.query(User)
            .filter(User.id == user_to_reactive)
            .first()
        )
        if user_model is None:
            raise HTTPException(status_code=404, detail="User not found")

        user_model.is_deleted = False
        user_model.deleted_at = None
        user_model.is_verified = True
        user_model.is_banned = False
        user_model.is_restricted = False
        user_model.ban_reason = None
        db.add(user_model)
        db.commit()
        db.refresh(user_model)

        # Notify the user
        try:
            notif_data = CreateNotification(
                user_id=user_model.id,
                type=NotificationType.EVENT_UPDATED,
                title="Account Reactivated",
                message="Your account has been reactivated. Welcome back to Eventfy!",
            )
            NotificationService.create_notification(db, notif_data)
        except Exception as exc:
            logger.warning("Failed to create reactivation notification: %s", exc)

        return {"message": "User has been reactivated successfully"}

    def change_user_role(self, user, db, user_id, new_role):
        _require_admin(user)
        valid_roles = {"attendee", "organizer"}
        if new_role not in valid_roles:
            raise HTTPException(
                status_code=400,
                detail=f"Role must be one of: {', '.join(valid_roles)}",
            )

        user_model = db.query(User).filter(User.id == user_id).first()
        if user_model is None:
            raise HTTPException(status_code=404, detail="User not found")
        if user_model.role == "admin":
            raise HTTPException(status_code=403, detail="Cannot change admin role")

        from app.models.notification import Notification
        from app.schemas.notification import CreateNotification, NotificationType
        from app.services.notification_service import NotificationService

        user_model.role = new_role
        db.add(user_model)
        # Any organizer-access request from this user is now resolved
        db.query(Notification).filter(
            Notification.type == NotificationType.ORGANIZER_REQUEST.value,
            Notification.related_object_type == "user",
            Notification.related_object_id == str(user_model.id),
        ).delete(synchronize_session=False)
        db.commit()
        db.refresh(user_model)

        promoted = new_role == "organizer"
        NotificationService.create_notification(db, CreateNotification(
            user_id=user_model.id,
            type=NotificationType.ROLE_CHANGED,
            title="You are now an organizer" if promoted else "Your account is now an attendee",
            message=("You can publish events, sell tickets and scan QR codes at the door."
                     if promoted else "An admin changed your account back to attendee."),
            related_object_id=str(user_model.id),
            related_object_type="user",
        ))
        return {"message": f"User role changed to {new_role}"}

    def get_user_details(self, user, db, user_id):
        _require_admin(user)
        u = db.query(User).filter(User.id == user_id).first()
        if u is None:
            raise HTTPException(status_code=404, detail="User not found")

        # User's events (if organizer)
        events = []
        if u.role == "organizer":
            events = [
                {
                    "id": ev.id,
                    "title": ev.title,
                    "start_date": str(ev.start_date) if ev.start_date else None,
                    "is_deleted": ev.is_deleted if hasattr(ev, 'is_deleted') else False,
                }
                for ev in db.query(Event).filter(Event.organizer_id == u.id).all()
            ]

        # User's tickets
        tickets = [
            {
                "id": t.id,
                "event_id": t.event_id,
                "status": t.status,
                "purchased_at": str(t.purchased_at) if t.purchased_at else None,
            }
            for t in db.query(Ticket).filter(Ticket.user_id == u.id).all()
        ]

        # User's payments
        payments = [
            {
                "id": p.id,
                "amount": p.amount,
                "currency": p.currency,
                "status": p.status,
                "created_at": str(p.created_at) if p.created_at else None,
            }
            for p in db.query(Payment).filter(Payment.user_id == u.id).all()
        ]

        return {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "bio": u.bio,
            "phone": u.phone,
            "location": u.location,
            "website": u.website,
            "avatar_url": u.avatar_url,
            "is_verified": u.is_verified,
            "is_deleted": u.is_deleted,
            "created_at": str(u.created_at) if u.created_at else None,
            "events": events,
            "tickets": tickets,
            "payments": payments,
        }

    # ──────────────────────────────────────────
    # EVENTS
    # ──────────────────────────────────────────

    def view_all_events(self, user, db):
        _require_admin(user)
        # Joined query — fixes N+1 problem
        rows = (
            db.query(Event, User.username)
            .outerjoin(User, User.id == Event.organizer_id)
            .all()
        )
        result = []
        for ev, organizer_name in rows:
            result.append({
                "id": ev.id,
                "title": ev.title,
                "description": ev.description,
                "location": ev.location,
                "price": ev.price,
                "currency": ev.currency or "DZD",
                "date": str(ev.start_date) if ev.start_date else None,
                "start_date": str(ev.start_date) if ev.start_date else None,
                "end_date": str(ev.end_date) if ev.end_date else None,
                "available_tickets": ev.available_tickets,
                "image": ev.image,
                "organizer_id": ev.organizer_id,
                "organizer_name": organizer_name or "Unknown",
                "is_deleted": ev.is_deleted if hasattr(ev, 'is_deleted') else False,
                "created_at": str(ev.created_at) if ev.created_at else None,
            })
        return result

    def delete_event(self, user, db, event_id):
        _require_admin(user)
        event_model = (
            db.query(Event)
            .filter(Event.id == event_id, Event.is_deleted.is_(False))
            .first()
        )
        if event_model is None:
            raise HTTPException(status_code=404, detail="Event not found")

        event_model.is_deleted = True
        event_model.deleted_at = datetime.now(timezone.utc)
        db.add(event_model)
        db.commit()
        db.refresh(event_model)
        return {"message": "Event has been deleted successfully"}

    # ──────────────────────────────────────────
    # DASHBOARD
    # ──────────────────────────────────────────

    def DashBoard(self, user, db):
        _require_admin(user)

        active_users = db.query(User).filter(User.is_deleted.is_(False)).count()
        deleted_users = db.query(User).filter(User.is_deleted.is_(True)).count()
        organizer_count = db.query(User).filter(User.role == "organizer").count()

        total_events = db.query(Event).count()
        active_events = db.query(Event).filter(Event.is_deleted.is_(False)).count()

        total_tickets = db.query(Ticket).count()
        active_tickets = db.query(Ticket).filter(Ticket.status == TicketStatus.active).count()
        used_tickets = db.query(Ticket).filter(Ticket.status == TicketStatus.used).count()
        cancelled_tickets = db.query(Ticket).filter(Ticket.status == TicketStatus.cancelled).count()

        total_revenue = (
            db.query(func.coalesce(func.sum(Payment.amount), 0.0))
            .filter(Payment.status == "succeeded")
            .scalar()
        )

        total_payments = db.query(Payment).count()
        total_reviews = db.query(Review).count()

        return {
            "users": {
                "active": active_users,
                "deleted": deleted_users,
                "total": active_users + deleted_users,
                "organizers": organizer_count,
            },
            "events": {
                "total": total_events,
                "active": active_events,
            },
            "tickets": {
                "total": total_tickets,
                "active": active_tickets,
                "used": used_tickets,
                "cancelled": cancelled_tickets,
            },
            "payments": {
                "total": total_payments,
            },
            "reviews": {
                "total": total_reviews,
            },
            "revenue": float(total_revenue or 0.0),
        }

    # ──────────────────────────────────────────
    # ANALYTICS (time-series for charts)
    # ──────────────────────────────────────────

    def get_analytics(self, user, db):
        _require_admin(user)
        now = datetime.now(timezone.utc)
        twelve_months_ago = now - timedelta(days=365)

        # Users registered per month
        user_monthly = (
            db.query(
                extract("year", User.created_at).label("year"),
                extract("month", User.created_at).label("month"),
                func.count(User.id).label("count"),
            )
            .filter(User.created_at >= twelve_months_ago)
            .group_by("year", "month")
            .order_by("year", "month")
            .all()
        )

        # Revenue per month (from successful payments)
        revenue_monthly = (
            db.query(
                extract("year", Payment.created_at).label("year"),
                extract("month", Payment.created_at).label("month"),
                func.coalesce(func.sum(Payment.amount), 0.0).label("total"),
            )
            .filter(
                Payment.created_at >= twelve_months_ago,
                Payment.status == "succeeded",
            )
            .group_by("year", "month")
            .order_by("year", "month")
            .all()
        )

        # Tickets sold per month
        tickets_monthly = (
            db.query(
                extract("year", Ticket.purchased_at).label("year"),
                extract("month", Ticket.purchased_at).label("month"),
                func.count(Ticket.id).label("count"),
            )
            .filter(Ticket.purchased_at >= twelve_months_ago)
            .group_by("year", "month")
            .order_by("year", "month")
            .all()
        )

        # Events created per month
        events_monthly = (
            db.query(
                extract("year", Event.created_at).label("year"),
                extract("month", Event.created_at).label("month"),
                func.count(Event.id).label("count"),
            )
            .filter(Event.created_at >= twelve_months_ago)
            .group_by("year", "month")
            .order_by("year", "month")
            .all()
        )

        def _to_series(rows, value_key="count"):
            months = [
                "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
            ]
            result = []
            for r in rows:
                y = int(r.year) if r.year else 0
                m = int(r.month) if r.month else 0
                val = float(getattr(r, value_key, 0) or 0)
                label = f"{months[m - 1]} {y}" if 1 <= m <= 12 else f"? {y}"
                result.append({"label": label, "value": val})
            return result

        return {
            "users_monthly": _to_series(user_monthly),
            "revenue_monthly": _to_series(revenue_monthly, "total"),
            "tickets_monthly": _to_series(tickets_monthly),
            "events_monthly": _to_series(events_monthly),
        }

    # ──────────────────────────────────────────
    # PAYMENTS
    # ──────────────────────────────────────────

    def view_all_payments(self, user, db):
        _require_admin(user)
        rows = (
            db.query(Payment, User.username, User.email, Event.title)
            .outerjoin(User, User.id == Payment.user_id)
            .outerjoin(Event, Event.id == Payment.event_id)
            .order_by(Payment.created_at.desc())
            .all()
        )
        return [
            {
                "id": p.id,
                "user_id": p.user_id,
                "username": uname or "Unknown",
                "email": email or "",
                "event_id": p.event_id,
                "event_title": etitle or "Unknown Event",
                "amount": p.amount,
                "currency": p.currency,
                "payment_method": p.payment_method,
                "status": p.status,
                "created_at": str(p.created_at) if p.created_at else None,
            }
            for p, uname, email, etitle in rows
        ]

    # ──────────────────────────────────────────
    # REVIEWS
    # ──────────────────────────────────────────

    def view_all_reviews(self, user, db):
        _require_admin(user)
        ReviewerAlias = db.query(User).subquery()
        rows = (
            db.query(Review, User.username, Event.title)
            .outerjoin(User, User.id == Review.reviewer_id)
            .outerjoin(Event, Event.id == Review.event_id)
            .order_by(Review.created_at.desc())
            .all()
        )
        return [
            {
                "id": r.id,
                "rating": r.rating,
                "comment": r.comment,
                "reviewer_id": r.reviewer_id,
                "reviewer_name": uname or "Unknown",
                "event_id": r.event_id,
                "event_title": etitle or "Unknown Event",
                "is_verified_purchase": r.is_verified_purchase,
                "created_at": str(r.created_at) if r.created_at else None,
            }
            for r, uname, etitle in rows
        ]

    def delete_review(self, user, db, review_id):
        _require_admin(user)
        review = db.query(Review).filter(Review.id == review_id).first()
        if review is None:
            raise HTTPException(status_code=404, detail="Review not found")

        db.delete(review)
        db.commit()
        return {"message": "Review has been deleted successfully"}
