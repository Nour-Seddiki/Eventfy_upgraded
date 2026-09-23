"""Messaging: support threads with the admin team, and attendee ↔ organizer threads per event.

Sides: every conversation has a "user" side (conversation.user_id) and a
"staff" side — any admin for kind='support', the event's organizer for
kind='event'.
"""
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import or_

from app.models.chat import Conversation, Message
from app.models.event import Event
from app.models.notification import Notification
from app.models.ticket import Ticket
from app.models.user import User

TOPIC_LABELS = {"organizer_access": "Become an organizer", "problem": "Report a problem", "other": "Question for the team"}
NEW_MESSAGE = "new_message"


def _utcnow() -> datetime:
    # Naive UTC, like the other created_at columns
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _name(u: User | None) -> str:
    return (u.full_name or u.username) if u else "Deleted user"


def _me(user: dict, db) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication failed")
    me = db.query(User).filter(User.id == user.get("user_id"), User.is_deleted.is_(False)).first()
    if me is None:
        raise HTTPException(status_code=401, detail="Authentication failed")
    return me


def _is_staff(conv: Conversation, me: User) -> bool:
    if conv.kind == "support":
        return me.role == "admin"
    return conv.organizer_id == me.id


def _can_view(conv: Conversation, me: User) -> bool:
    return conv.user_id == me.id or _is_staff(conv, me)


def _get(db, conv_id: int, me: User) -> Conversation:
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if conv is None or not _can_view(conv, me):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


def _unread(db, conv: Conversation, staff_side: bool) -> int:
    last_read = conv.staff_last_read_at if staff_side else conv.user_last_read_at
    q = db.query(Message).filter(Message.conversation_id == conv.id, Message.from_staff.is_(not staff_side))
    if last_read is not None:
        q = q.filter(Message.created_at > last_read)
    return q.count()


def _notify(db, user_ids, title: str, message: str, conv: Conversation):
    for uid in set(user_ids):
        db.add(Notification(user_id=uid, type=NEW_MESSAGE, title=title[:200], message=message[:1000],
                            related_object_id=str(conv.id), related_object_type="conversation"))


def _add_message(db, conv: Conversation, sender: User | None, body: str, from_staff: bool,
                 announcement: bool = False, notify: bool = True) -> Message:
    """Append a message, keep read markers and status in step, and tell the other side
    — only when they had nothing unread yet, so a burst of messages is one notification."""
    had_unread = _unread(db, conv, staff_side=not from_staff) > 0
    now = _utcnow()
    msg = Message(conversation_id=conv.id, sender_id=sender.id if sender else None, from_staff=from_staff,
                  is_announcement=announcement, body=body, created_at=now)
    db.add(msg)
    conv.last_message_at = now
    conv.status = "open"
    if from_staff:
        conv.staff_last_read_at = now
    else:
        conv.user_last_read_at = now

    if notify and not had_unread:
        preview = body if len(body) <= 120 else body[:117] + "…"
        if from_staff:
            who = "Eventfy team" if conv.kind == "support" else _name(sender)
            _notify(db, [conv.user_id], f"New message from {who}", preview, conv)
        elif conv.kind == "support":
            admins = [a.id for a in db.query(User).filter(User.role == "admin", User.is_deleted.is_(False)).all()]
            _notify(db, admins, f"{_name(sender)}: {TOPIC_LABELS.get(conv.topic, 'Support')}", preview, conv)
        else:
            _notify(db, [conv.organizer_id], f"{_name(sender)} about your event", preview, conv)
    return msg


def _summary(db, conv: Conversation, me: User) -> dict:
    staff = _is_staff(conv, me)
    user = db.query(User).filter(User.id == conv.user_id).first()
    event = db.query(Event).filter(Event.id == conv.event_id).first() if conv.event_id else None
    organizer = db.query(User).filter(User.id == conv.organizer_id).first() if conv.organizer_id else None
    last = (db.query(Message).filter(Message.conversation_id == conv.id)
            .order_by(Message.created_at.desc(), Message.id.desc()).first())

    if staff:
        counterpart = {"id": user.id if user else None, "name": _name(user), "email": user.email if user else None,
                       "role": user.role if user else None, "avatar_url": user.avatar_url if user else None}
    elif conv.kind == "support":
        counterpart = {"id": None, "name": "Eventfy team", "role": "admin", "avatar_url": None}
    else:
        counterpart = {"id": organizer.id if organizer else None, "name": _name(organizer), "role": "organizer",
                       "avatar_url": organizer.avatar_url if organizer else None}

    return {
        "id": conv.id, "kind": conv.kind, "topic": conv.topic,
        "topic_label": TOPIC_LABELS.get(conv.topic) if conv.kind == "support" else None,
        "title": TOPIC_LABELS.get(conv.topic, "Support") if conv.kind == "support" else (event.title if event else "Event"),
        "event_id": conv.event_id, "status": conv.status, "viewer_is_staff": staff,
        "counterpart": counterpart,
        "last_message": {"body": last.body, "created_at": last.created_at, "from_staff": last.from_staff,
                         "is_announcement": last.is_announcement} if last else None,
        "last_message_at": conv.last_message_at,
        "unread": _unread(db, conv, staff_side=staff),
    }


def _visible(db, me: User):
    rules = [Conversation.user_id == me.id, Conversation.organizer_id == me.id]
    if me.role == "admin":
        rules.append(Conversation.kind == "support")
    return db.query(Conversation).filter(or_(*rules))


class ChatService:

    @staticmethod
    def list_conversations(user, db) -> list[dict]:
        me = _me(user, db)
        convs = _visible(db, me).order_by(Conversation.last_message_at.desc()).all()
        return [_summary(db, c, me) for c in convs]

    @staticmethod
    def unread_count(user, db) -> dict:
        me = _me(user, db)
        return {"unread": sum(1 for c in _visible(db, me).all() if _unread(db, c, staff_side=_is_staff(c, me)) > 0)}

    @staticmethod
    def open_support(db, me: User, topic: str, body: str, notify: bool = True) -> Conversation:
        """Reuse the user's open thread for this topic, or start one."""
        conv = (db.query(Conversation)
                .filter(Conversation.kind == "support", Conversation.user_id == me.id,
                        Conversation.topic == topic, Conversation.status == "open")
                .first())
        if conv is None:
            conv = Conversation(kind="support", topic=topic, user_id=me.id, last_message_at=_utcnow())
            db.add(conv)
            db.flush()
        _add_message(db, conv, me, body, from_staff=False, notify=notify)
        return conv

    @staticmethod
    def start_support(user, db, topic: str, body: str) -> dict:
        me = _me(user, db)
        if me.role == "admin":
            raise HTTPException(status_code=400, detail="Admins answer support conversations from Messages")
        conv = ChatService.open_support(db, me, topic, body)
        db.commit()
        return ChatService.get_conversation(user, db, conv.id)

    @staticmethod
    def start_event_chat(user, db, event_id: int, body: str) -> dict:
        me = _me(user, db)
        if user.get("is_restricted"):
            raise HTTPException(status_code=403, detail="Your account is restricted. You can still contact support.")
        event = db.query(Event).filter(Event.id == event_id, Event.is_deleted.is_(False)).first()
        if event is None:
            raise HTTPException(status_code=404, detail="Event not found")
        if event.organizer_id == me.id:
            raise HTTPException(status_code=400, detail="This is your event. Attendees' messages appear in your inbox.")
        conv = (db.query(Conversation)
                .filter(Conversation.kind == "event", Conversation.event_id == event.id, Conversation.user_id == me.id)
                .first())
        if conv is None:
            conv = Conversation(kind="event", user_id=me.id, event_id=event.id, organizer_id=event.organizer_id,
                                last_message_at=_utcnow())
            db.add(conv)
            db.flush()
        _add_message(db, conv, me, body, from_staff=False)
        db.commit()
        return ChatService.get_conversation(user, db, conv.id)

    @staticmethod
    def get_conversation(user, db, conv_id: int) -> dict:
        me = _me(user, db)
        conv = _get(db, conv_id, me)
        staff = _is_staff(conv, me)
        # Mark as read before summarising, so the unread count reflects this visit
        if staff:
            conv.staff_last_read_at = _utcnow()
        if conv.user_id == me.id:
            conv.user_last_read_at = _utcnow()
        db.commit()

        messages = (db.query(Message).filter(Message.conversation_id == conv.id)
                    .order_by(Message.created_at.asc(), Message.id.asc()).all())
        senders = {u.id: u for u in db.query(User).filter(User.id.in_({m.sender_id for m in messages if m.sender_id})).all()}
        data = _summary(db, conv, me)
        data["messages"] = [{
            "id": m.id, "body": m.body, "created_at": m.created_at, "from_staff": m.from_staff,
            "is_announcement": m.is_announcement, "mine": m.sender_id == me.id,
            "sender_name": ("Eventfy team" if conv.kind == "support" and m.from_staff and not staff
                            else _name(senders.get(m.sender_id))),
        } for m in messages]
        if staff and conv.kind == "support":
            from app.services.user_service import userServices
            requester = db.query(User).filter(User.id == conv.user_id).first()
            data["requester"] = {
                "id": requester.id, "name": _name(requester), "email": requester.email, "role": requester.role,
                "organizer_request_pending": bool(requester and userServices._organizer_request_pending(db, requester)),
            } if requester else None
        return data

    @staticmethod
    def post_message(user, db, conv_id: int, body: str) -> dict:
        me = _me(user, db)
        conv = _get(db, conv_id, me)
        staff = _is_staff(conv, me)
        if conv.kind == "event" and not staff and user.get("is_restricted"):
            raise HTTPException(status_code=403, detail="Your account is restricted. You can still contact support.")
        _add_message(db, conv, me, body, from_staff=staff)
        db.commit()
        return ChatService.get_conversation(user, db, conv.id)

    @staticmethod
    def close(user, db, conv_id: int) -> dict:
        me = _me(user, db)
        conv = _get(db, conv_id, me)
        conv.status = "closed"
        db.commit()
        return ChatService.get_conversation(user, db, conv.id)

    @staticmethod
    def announce(user, db, event_id: int, body: str) -> dict:
        """Organizer → every ticket holder of the event, in each attendee's event thread."""
        me = _me(user, db)
        event = db.query(Event).filter(Event.id == event_id, Event.is_deleted.is_(False)).first()
        if event is None:
            raise HTTPException(status_code=404, detail="Event not found")
        if event.organizer_id != me.id:
            raise HTTPException(status_code=403, detail="Only the event's organizer can send announcements")
        holders = {t.user_id for t in db.query(Ticket).filter(Ticket.event_id == event.id, Ticket.status == "active").all()}
        holders.discard(me.id)
        if not holders:
            raise HTTPException(status_code=400, detail="Nobody has a ticket for this event yet")

        existing = {c.user_id: c for c in db.query(Conversation)
                    .filter(Conversation.kind == "event", Conversation.event_id == event.id).all()}
        preview = body if len(body) <= 120 else body[:117] + "…"
        for uid in holders:
            conv = existing.get(uid)
            if conv is None:
                conv = Conversation(kind="event", user_id=uid, event_id=event.id, organizer_id=me.id,
                                    last_message_at=_utcnow())
                db.add(conv)
                db.flush()
            _add_message(db, conv, me, body, from_staff=True, announcement=True, notify=False)
            _notify(db, [uid], f"📣 {event.title}", preview, conv)
        db.commit()
        return {"sent_to": len(holders)}
