from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.models.chat import Conversation, Message  # noqa: F401  (create the tables)
from app.models.event import Event
from app.models.notification import Notification
from app.models.ticket import Ticket
from app.models.user import User
from app.services.admin_services import Admin
from app.services.chat_service import ChatService
from app.services.user_service import userServices


def _user(db, name, role="attendee"):
    u = User(username=name, email=f"{name}@example.com", hashed_password="x", role=role, full_name=name.title())
    db.add(u)
    db.commit()
    return u


def _auth(u):
    return {"username": u.username, "user_id": u.id, "user_role": u.role}


@pytest.fixture()
def world(db_session):
    db = db_session
    w = {
        "admin": _user(db, "boss", "admin"),
        "org": _user(db, "org", "organizer"),
        "amina": _user(db, "amina"),
        "karim": _user(db, "karim"),
    }
    ev = Event(title="DevFest", description="d", location="CIC, Alger", price=0, available_tickets=10,
               start_date=datetime.now(timezone.utc) + timedelta(days=5), organizer_id=w["org"].id)
    db.add(ev)
    db.commit()
    w["event"] = ev
    return w


def _notes(db, user):
    return db.query(Notification).filter(Notification.user_id == user.id, Notification.type == "new_message").count()


def test_support_thread_between_user_and_admins(db_session, world):
    db, amina, admin = db_session, world["amina"], world["admin"]
    conv = ChatService.start_support(_auth(amina), db, "problem", "My QR code doesn't load")
    assert conv["title"] == "Report a problem" and conv["counterpart"]["name"] == "Eventfy team"
    assert _notes(db, admin) == 1

    # Admin inbox: unread until opened, then read
    inbox = ChatService.list_conversations(_auth(admin), db)
    assert [(c["id"], c["unread"]) for c in inbox] == [(conv["id"], 1)]
    detail = ChatService.get_conversation(_auth(admin), db, conv["id"])
    assert detail["requester"]["email"] == "amina@example.com"
    assert ChatService.list_conversations(_auth(admin), db)[0]["unread"] == 0

    reply = ChatService.post_message(_auth(admin), db, conv["id"], "Try reloading My tickets")
    assert reply["messages"][-1]["from_staff"] and _notes(db, amina) == 1
    seen_by_amina = ChatService.get_conversation(_auth(amina), db, conv["id"])
    assert seen_by_amina["messages"][-1]["sender_name"] == "Eventfy team"

    # Other users can't see it
    with pytest.raises(HTTPException) as exc:
        ChatService.get_conversation(_auth(world["karim"]), db, conv["id"])
    assert exc.value.status_code == 404
    assert ChatService.list_conversations(_auth(world["org"]), db) == []


def test_one_notification_per_burst_of_messages(db_session, world):
    db, amina, admin = db_session, world["amina"], world["admin"]
    conv = ChatService.start_support(_auth(amina), db, "other", "Hello")
    ChatService.post_message(_auth(amina), db, conv["id"], "Are you there?")
    assert _notes(db, admin) == 1                        # still unread: no second notification
    ChatService.get_conversation(_auth(admin), db, conv["id"])
    ChatService.post_message(_auth(amina), db, conv["id"], "Thanks!")
    assert _notes(db, admin) == 2


def test_attendee_messages_organizer_and_organizer_replies(db_session, world):
    db, amina, org, ev = db_session, world["amina"], world["org"], world["event"]
    conv = ChatService.start_event_chat(_auth(amina), db, ev.id, "Is there parking at CIC?")
    assert conv["title"] == "DevFest" and conv["counterpart"]["name"] == "Org"
    assert _notes(db, org) == 1

    org_inbox = ChatService.list_conversations(_auth(org), db)
    assert org_inbox[0]["viewer_is_staff"] and org_inbox[0]["counterpart"]["name"] == "Amina"
    ChatService.post_message(_auth(org), db, conv["id"], "Yes, level -1")
    assert ChatService.unread_count(_auth(amina), db) == {"unread": 1}

    # A second message from the same attendee reuses the thread
    again = ChatService.start_event_chat(_auth(amina), db, ev.id, "Great, thanks")
    assert again["id"] == conv["id"] and len(again["messages"]) == 3

    with pytest.raises(HTTPException):          # organizers can't open a thread with their own event
        ChatService.start_event_chat(_auth(org), db, ev.id, "hi")
    with pytest.raises(HTTPException):          # admins answer support, they don't open it
        ChatService.start_support(_auth(world["admin"]), db, "other", "hi")


def test_announcement_reaches_every_ticket_holder(db_session, world):
    db, org, ev = db_session, world["org"], world["event"]
    with pytest.raises(HTTPException) as exc:
        ChatService.announce(_auth(org), db, ev.id, "Doors open at 8")
    assert exc.value.status_code == 400         # nobody has a ticket yet

    for i, who in enumerate(["amina", "karim"]):
        db.add(Ticket(user_id=world[who].id, event_id=ev.id, qr_code=f"q{i}", status="active"))
    db.commit()
    ChatService.start_event_chat(_auth(world["amina"]), db, ev.id, "Hi!")   # existing thread is reused

    assert ChatService.announce(_auth(org), db, ev.id, "Doors open at 8") == {"sent_to": 2}
    for who in ["amina", "karim"]:
        thread = ChatService.list_conversations(_auth(world[who]), db)[0]
        assert thread["last_message"]["is_announcement"] and thread["unread"] == 1
    assert db.query(Conversation).filter(Conversation.event_id == ev.id).count() == 2

    with pytest.raises(HTTPException) as exc:   # only the event's own organizer
        ChatService.announce(_auth(world["admin"]), db, ev.id, "hi")
    assert exc.value.status_code == 403


def test_organizer_request_opens_a_thread_that_promotion_closes(db_session, world):
    db, amina, admin = db_session, world["amina"], world["admin"]
    userServices.request_organizer_access(_auth(amina), db)
    thread = ChatService.list_conversations(_auth(admin), db)[0]
    assert thread["topic"] == "organizer_access" and thread["status"] == "open"
    assert ChatService.get_conversation(_auth(admin), db, thread["id"])["requester"]["organizer_request_pending"]

    Admin().change_user_role(_auth(admin), db, amina.id, "organizer")

    done = ChatService.get_conversation(_auth(amina), db, thread["id"])
    assert done["status"] == "closed" and "now an organizer" in done["messages"][-1]["body"]
