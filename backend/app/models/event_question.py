from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime
from app.db.base import Base
from datetime import datetime, timezone


class EventQuestion(Base):
    """A custom question attached to an event's registration form.

    Organizers create these via the Form Builder.  Each question can
    optionally map to a standard user-profile field (``profile_field_key``)
    so the frontend can offer "1-Click Autofill" from the user's
    global profile.
    """

    __tablename__ = "event_questions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)

    # Question configuration
    question_type = Column(String, nullable=False)          # 'short_text' | 'long_text' | 'multiple_choice' | 'yes_no'
    label = Column(String, nullable=False)                  # The question text shown to attendees
    options_json = Column(Text, nullable=True)              # JSON array string for multiple_choice, e.g. '["CS","EE","ME"]'
    is_required = Column(Boolean, default=True)
    display_order = Column(Integer, default=0)              # Controls rendering order in the form

    # Autofill mapping — links this question to a user profile field
    # Valid keys: 'phone', 'full_name', 'location', 'bio', 'university',
    #             'major', 'dietary_restrictions', 'date_of_birth', 'gender'
    profile_field_key = Column(String, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
