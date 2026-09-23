from fastapi import HTTPException, status
from datetime import datetime, timezone
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.models.event import Event
from app.models.ticket import Ticket
from app.models.notification import Notification


def _event_to_dict(event):
    """Standard event serializer with id and organizer_id."""
    return {
        "id": event.id,
        "title": event.title,
        "description": event.description,
        "location": event.location,
        "price": event.price,
        "currency": event.currency or "DZD",
        "start_date": event.start_date.isoformat() if event.start_date else None,
        "end_date": event.end_date.isoformat() if event.end_date else None,
        "registration_deadline": event.registration_deadline.isoformat() if event.registration_deadline else None,
        "available_tickets": event.available_tickets,
        "image": event.image,
        "organizer_id": event.organizer_id,
        "requires_approval": event.requires_approval or False,
    }


class EventService:

    def create_event(self, user, db, event_data):
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        if user.get("user_role") != "organizer":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only organizers can create events",
            )

        existing_title = db.query(Event).filter(Event.title == event_data.title).first()
        if existing_title:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Event title already exists",
            )

        event = Event(
            title=event_data.title,
            description=event_data.description,
            location=event_data.location,
            price=event_data.price,
            currency=event_data.currency or "DZD",
            available_tickets=event_data.available_tickets,
            start_date=event_data.start_date,
            end_date=event_data.end_date,
            registration_deadline=event_data.registration_deadline,
            image=event_data.image,
            organizer_id=user.get("user_id"),
            requires_approval=event_data.requires_approval if hasattr(event_data, 'requires_approval') else False,
        )

        db.add(event)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Event title already exists",
            )
        db.refresh(event)

        return _event_to_dict(event)

    def update_event(self, user, db, updated_event, event_id: int):
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        event_model = db.query(Event).filter(Event.id == event_id, Event.is_deleted.is_(False)).first()
        if event_model is None:
            raise HTTPException(status_code=404, detail="Event not found")

        # Ownership check: only the event organizer or an admin may update
        is_owner = event_model.organizer_id == user.get("user_id")
        is_admin = user.get("user_role") == "admin"
        if not (is_owner or is_admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to update this event",
            )

        updates = updated_event.model_dump(exclude_unset=True)
        # Prevent duplicate title collisions
        if "title" in updates and updates["title"] != event_model.title:
            existing_title = (
                db.query(Event)
                .filter(Event.title == updates["title"], Event.id != event_id)
                .first()
            )
            if existing_title:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Event title already exists",
                )

        for field, value in updates.items():
            setattr(event_model, field, value)

        db.add(event_model)
        db.commit()
        db.refresh(event_model)
        return {"message": "Event has been updated"}

    def delete_event(self, user, db, event_id):
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        event_model = db.query(Event).filter(Event.id == event_id).first()
        if event_model is None:
            raise HTTPException(status_code=404, detail="Event not found")

        # Ownership check: only the event organizer or an admin may delete
        is_owner = event_model.organizer_id == user.get("user_id")
        is_admin = user.get("user_role") == "admin"
        if not (is_owner or is_admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to delete this event",
            )

        # Send notifications to enrolled users
        tickets = db.query(Ticket).filter(Ticket.event_id == event_id).all()
        user_ids = {t.user_id for t in tickets}
        
        is_free = event_model.is_free or (event_model.price == 0)
        if is_free:
            msg = f"Sorry, this event {event_model.title} no longer exists. Explore other events."
        else:
            msg = f"Sorry, this event {event_model.title} no longer exists. You will receive a refund with {event_model.price} amount as soon as possible."

        for uid in user_ids:
            notification = Notification(
                user_id=uid,
                type="event_deleted",
                title="Event Cancelled",
                message=msg,
                related_object_id=str(event_id),
                related_object_type="event"
            )
            db.add(notification)

        # Soft-delete: mark as deleted instead of removing the row
        event_model.is_deleted = True
        event_model.deleted_at = datetime.now(timezone.utc)
        db.commit()
        return {"message": "Event has been deleted successfully"}

    def get_event_by_id(self, user, db, event_id):
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        event_model = db.query(Event).filter(Event.id == event_id, Event.is_deleted.is_(False)).first()
        if event_model is None:
            raise HTTPException(status_code=404, detail="Event not found")
        return _event_to_dict(event_model)

    def list_events(self, user, db):
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        if user.get("user_role") == "organizer":
            rows = (
                db.query(Event, func.count(Ticket.id).label("tickets_sold"))
                .outerjoin(Ticket, (Ticket.event_id == Event.id) & (Ticket.status != "cancelled"))
                .filter(Event.organizer_id == user.get("user_id"), Event.is_deleted.is_(False))
                .group_by(Event.id)
                .order_by(Event.start_date.desc())
                .all()
            )
            return [
                {
                    **_event_to_dict(e),
                    "tickets_sold": tickets_sold,
                    "revenue": tickets_sold * e.price if e.price else 0.0,
                }
                for e, tickets_sold in rows
            ]
        else:
            rows = (
                db.query(Event, func.count(Ticket.id).label("tickets_sold"))
                .outerjoin(Ticket, (Ticket.event_id == Event.id) & (Ticket.status != "cancelled"))
                .filter(Event.is_deleted.is_(False))
                .group_by(Event.id)
                .order_by(Event.start_date.desc())
                .all()
            )
            return [
                {
                    **_event_to_dict(e),
                    "tickets_sold": tickets_sold,
                    "revenue": tickets_sold * e.price if e.price else 0.0,
                }
                for e, tickets_sold in rows
            ]

    def search_events_by_title(self, user, db, keyword):
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        event_models = db.query(Event).filter(Event.title.ilike(f"%{keyword}%"), Event.is_deleted.is_(False)).all()
        if not event_models:
            return []
        return [_event_to_dict(e) for e in event_models]

    def search_events_by_location(self, user, db, keyword):
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        event_models = db.query(Event).filter(Event.location.ilike(f"%{keyword}%"), Event.is_deleted.is_(False)).all()
        if not event_models:
            return []
        return [_event_to_dict(e) for e in event_models]

    def trending_events(self, user, db, limit: int = 5):
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        current_time = datetime.now(timezone.utc)
        safe_limit = max(1, min(limit, 50))

        trending_rows = (
            db.query(
                Event,
                func.count(Ticket.id).label("tickets_sold"),
            )
            .outerjoin(
                Ticket,
                (Ticket.event_id == Event.id) & (Ticket.status != "cancelled"),
            )
            .filter(Event.start_date >= current_time, Event.available_tickets > 0)
            .group_by(Event.id)
            .order_by(func.count(Ticket.id).desc(), Event.start_date.asc())
            .limit(safe_limit)
            .all()
        )

        if not trending_rows:
            return []

        return [
            {
                **_event_to_dict(event),
                "tickets_sold": tickets_sold,
            }
            for event, tickets_sold in trending_rows
        ]

    def upload_event_image(self, user, db, event_id: int, image_path: str):
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        if user.get("user_role") != "organizer":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only organizers can update events",
            )

        event_model = db.query(Event).filter(Event.id == event_id).first()
        if event_model is None:
            raise HTTPException(status_code=404, detail="Event not found")

        event_model.image = image_path
        db.add(event_model)
        db.commit()
        db.refresh(event_model)
        return {"message": "Event image has been updated", "image": image_path}
