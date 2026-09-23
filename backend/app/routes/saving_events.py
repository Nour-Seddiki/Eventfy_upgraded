from fastapi import APIRouter, Path, Query
from starlette import status
from app.db.session import db_dependency
from app.services.auth_service import user_dependency
from app.services.saving_event_service import SavingEventService
from app.schemas.saving_event import SavingEventCreate

router = APIRouter(prefix="/saving-events", tags=["saving-events"])


@router.post("/save", status_code=status.HTTP_201_CREATED)
def save_event(user: user_dependency, db: db_dependency, data: SavingEventCreate):
    """Save an event for the user"""
    return SavingEventService().save_event(user, db, data)


@router.get("/my-saved-events", status_code=status.HTTP_200_OK)
def get_my_saved_events(user: user_dependency, db: db_dependency):
    """Get all saved events for the authenticated user"""
    return SavingEventService().get_user_saved_events(user, db)


@router.delete("/remove/{saving_event_id}", status_code=status.HTTP_202_ACCEPTED)
def remove_saved_event(user: user_dependency, db: db_dependency, saving_event_id: int = Path(gt=0)):
    """Remove a saved event"""
    return SavingEventService().remove_saved_event(user, db, saving_event_id)


@router.get("/check/{event_id}", status_code=status.HTTP_200_OK)
def check_if_saved(user: user_dependency, db: db_dependency, event_id: int = Path(gt=0)):
    """Check if an event is saved by the user"""
    return SavingEventService().check_if_event_saved(user, db, event_id)


@router.get("/count/{event_id}", status_code=status.HTTP_200_OK)
def get_saved_count(user: user_dependency, db: db_dependency, event_id: int = Path(gt=0)):
    """Get count of users who saved this event"""
    return SavingEventService().get_saved_events_count(user, db, event_id)
