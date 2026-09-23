from sqlalchemy import Column, Integer, ForeignKey, DateTime, Boolean
from app.db.base import Base
from datetime import datetime, timezone


class SavingEvent(Base):
    __tablename__ = "saving_events"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    event_id = Column(Integer, ForeignKey("events.id"))
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
