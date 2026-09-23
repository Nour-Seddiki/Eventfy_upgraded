from fastapi import APIRouter, Path
from starlette import status

from app.db.session import db_dependency
from app.schemas.chat import AnnouncementIn, MessageIn, SupportStart
from app.services.auth_service import user_dependency
from app.services.chat_service import ChatService

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/conversations", status_code=status.HTTP_200_OK)
def list_conversations(user: user_dependency, db: db_dependency):
    """Everything the user can see: their own threads, their events' threads,
    and (admins) every support thread — newest activity first."""
    return ChatService.list_conversations(user, db)


@router.get("/unread-count", status_code=status.HTTP_200_OK)
def unread_count(user: user_dependency, db: db_dependency):
    return ChatService.unread_count(user, db)


@router.post("/support", status_code=status.HTTP_201_CREATED)
def contact_support(user: user_dependency, db: db_dependency, data: SupportStart):
    """Message the admin team (organizer access, a problem, anything else)."""
    return ChatService.start_support(user, db, data.topic, data.body)


@router.post("/events/{event_id}", status_code=status.HTTP_201_CREATED)
def message_organizer(user: user_dependency, db: db_dependency, data: MessageIn, event_id: int = Path(gt=0)):
    """Attendee → the event's organizer."""
    return ChatService.start_event_chat(user, db, event_id, data.body)


@router.post("/events/{event_id}/announce", status_code=status.HTTP_201_CREATED)
def announce(user: user_dependency, db: db_dependency, data: AnnouncementIn, event_id: int = Path(gt=0)):
    """Organizer → every ticket holder of the event."""
    return ChatService.announce(user, db, event_id, data.body)


@router.get("/conversations/{conversation_id}", status_code=status.HTTP_200_OK)
def get_conversation(user: user_dependency, db: db_dependency, conversation_id: int = Path(gt=0)):
    """Messages of one thread; marks it as read for the viewer."""
    return ChatService.get_conversation(user, db, conversation_id)


@router.post("/conversations/{conversation_id}/messages", status_code=status.HTTP_201_CREATED)
def post_message(user: user_dependency, db: db_dependency, data: MessageIn, conversation_id: int = Path(gt=0)):
    return ChatService.post_message(user, db, conversation_id, data.body)


@router.post("/conversations/{conversation_id}/close", status_code=status.HTTP_200_OK)
def close_conversation(user: user_dependency, db: db_dependency, conversation_id: int = Path(gt=0)):
    """Mark resolved; any new message reopens it."""
    return ChatService.close(user, db, conversation_id)
