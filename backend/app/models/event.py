from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, FLOAT
from app.db.base import Base
from datetime import datetime, timezone


class Event(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, unique=True)
    description = Column(String)
    # Eventfy only hosts IT events; the column is kept for existing rows
    category = Column(String, default="IT")
    location = Column(String)
    price = Column(FLOAT)
    currency = Column(String, default="DZD")
    available_tickets = Column(Integer)
    start_date = Column(DateTime)
    end_date = Column(DateTime, nullable=True)
    registration_deadline = Column(DateTime, nullable=True)
    image = Column(String)
    organizer_id = Column(Integer, ForeignKey("users.id"))
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # When True, attendees must submit a registration form and be approved
    # by the organizer before receiving a ticket (instead of instant purchase).
    requires_approval = Column(Boolean, default=False)
