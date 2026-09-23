from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text
from app.db.base import Base
from datetime import datetime, timezone


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    type = Column(String)  # e.g., "event_reminder", "booking_confirmed", "review_posted"
    title = Column(String)
    message = Column(Text)
    read = Column(Boolean, default=False)
    related_object_id = Column(String, nullable=True)  # Reference to event/ticket/review
    related_object_type = Column(String, nullable=True)  # Type: "event", "ticket", "review"
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
