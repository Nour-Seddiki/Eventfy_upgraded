from sqlalchemy import Column, Integer, LargeBinary, String, ForeignKey, DateTime
from app.db.base import Base
from datetime import datetime, timezone
import uuid


class Ticket(Base):
    __tablename__ = "tickets"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"))
    event_id = Column(Integer, ForeignKey("events.id"))
    qr_code = Column(String, unique=True)
    qr_image = Column(LargeBinary)
    status = Column(String)
    purchased_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
