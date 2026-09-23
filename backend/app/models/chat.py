from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from app.db.base import Base

# Naive UTC: read markers are compared with message times in Python
_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


class Conversation(Base):
    """A private thread between a user and a "staff" side.

    kind='support': the user (attendee or organizer) and the admin team.
                    topic: 'organizer_access' | 'problem' | 'other'
    kind='event':   an attendee and the organizer of event_id.

    Unread state is tracked per side: a message is unread for a side when it
    is newer than that side's *_last_read_at and was sent by the other side.
    """

    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String, nullable=False)                     # 'support' | 'event'
    topic = Column(String, nullable=True)                     # support only
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=True, index=True)
    organizer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    status = Column(String, default="open", nullable=False)   # 'open' | 'closed'
    user_last_read_at = Column(DateTime, nullable=True)
    staff_last_read_at = Column(DateTime, nullable=True)
    last_message_at = Column(DateTime, default=_now)
    created_at = Column(DateTime, default=_now)


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    from_staff = Column(Boolean, default=False, nullable=False)   # admin (support) or organizer (event)
    is_announcement = Column(Boolean, default=False, nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=_now, index=True)
