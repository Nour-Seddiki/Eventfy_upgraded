from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, UniqueConstraint
from app.db.base import Base
from datetime import datetime, timezone


class Registration(Base):
    """A user's registration (form submission) for an event that requires approval.

    Lifecycle:  in_processing  →  confirmed  (ticket generated)
                               →  rejected   (user may re-register up to 3 total attempts)
    After 3 rejected attempts the user is permanently blocked for that event.
    """

    __tablename__ = "registrations"
    __table_args__ = (
        UniqueConstraint("user_id", "event_id", name="uq_registration_user_event"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)

    # Status: 'in_processing' | 'confirmed' | 'rejected'
    status = Column(String, default="in_processing", nullable=False)

    # How many times this user has submitted a registration for this event (max 3)
    attempt_count = Column(Integer, default=1, nullable=False)

    # Review metadata
    reviewed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
