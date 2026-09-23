from fastapi import HTTPException
from starlette import status
from app.models.saving_event import SavingEvent
from app.models.event import Event
from app.models.user import User
from app.schemas.saving_event import SavingEventCreate
from datetime import datetime, timezone


class SavingEventService:

    def save_event(self, user: dict, db, data: SavingEventCreate):
        """Save an event for the user"""
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication failed"
            )

        # Verify event exists
        event = db.query(Event).filter(Event.id == data.event_id).first()
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found."
            )

        # Check if already saved
        existing = db.query(SavingEvent).filter(
            SavingEvent.user_id == user.get("user_id"),
            SavingEvent.event_id == data.event_id,
            SavingEvent.is_deleted == False
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You have already saved this event."
            )

        saving_event = SavingEvent(
            user_id=user.get("user_id"),
            event_id=data.event_id
        )
        db.add(saving_event)
        db.commit()
        db.refresh(saving_event)
        return saving_event

    def get_user_saved_events(self, user: dict, db):
        """Get all saved events for the user"""
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication failed"
            )

        results = db.query(SavingEvent, Event).join(Event, SavingEvent.event_id == Event.id).filter(
            SavingEvent.user_id == user.get("user_id"),
            SavingEvent.is_deleted == False
        ).all()
        
        response = []
        for saving, event in results:
            response.append({
                "saving_id": saving.id,
                "id": saving.id,
                "user_id": saving.user_id,
                "event_id": saving.event_id,
                "created_at": saving.created_at,
                "event": event
            })
            
        return response

    def remove_saved_event(self, user: dict, db, saving_event_id: int):
        """Soft delete a saved event"""
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication failed"
            )

        saving_event = db.query(SavingEvent).filter(
            SavingEvent.id == saving_event_id,
            SavingEvent.user_id == user.get("user_id")
        ).first()
        if not saving_event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Saved event not found or you don't have permission to delete it."
            )

        saving_event.is_deleted = True
        saving_event.deleted_at = datetime.now(timezone.utc)
        db.commit()
        return {"message": "Saved event removed successfully."}

    def check_if_event_saved(self, user: dict, db, event_id: int):
        """Check if event is saved by user"""
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication failed"
            )

        saving_event = db.query(SavingEvent).filter(
            SavingEvent.user_id == user.get("user_id"),
            SavingEvent.event_id == event_id,
            SavingEvent.is_deleted == False
        ).first()

        return {"is_saved": saving_event is not None}

    def get_saved_events_count(self, user: dict, db, event_id: int):
        """Get count of users who saved this event - only for admin and event organizer"""
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication failed"
            )

        # Verify event exists
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found."
            )

        # Check if user is admin or event organizer
        is_admin = user.get("user_role") == "admin"
        is_organizer = event.organizer_id == user.get("user_id")

        if not (is_admin or is_organizer):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admin and event organizer can view saved count."
            )

        count = db.query(SavingEvent).filter(
            SavingEvent.event_id == event_id,
            SavingEvent.is_deleted == False
        ).count()
        return {"event_id": event_id, "saved_count": count}
