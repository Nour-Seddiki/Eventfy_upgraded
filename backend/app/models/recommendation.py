from sqlalchemy import Column, Integer, ForeignKey, DateTime
from app.db.base import Base
from datetime import datetime, timezone


class Recommendation(Base):
    __tablename__ = "recommendations"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    event_id = Column(Integer, ForeignKey("events.id"))
    score = Column(Integer)
    generated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
