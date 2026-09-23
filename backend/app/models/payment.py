from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from app.db.base import Base
from datetime import datetime, timezone
import uuid


class Payment(Base):
    __tablename__ = "payments"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    ticket_id = Column(String(36), ForeignKey("tickets.id"), nullable=True)
    amount = Column(Float, nullable=False)
    currency = Column(String, default="dzd")
    payment_method = Column(String, nullable=False)
    payment_intent_id = Column(String, unique=True)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, onupdate=lambda: datetime.now(timezone.utc))
