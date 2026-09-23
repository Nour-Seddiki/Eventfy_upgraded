from sqlalchemy import Column, Integer, Text, ForeignKey
from app.db.base import Base


class FormAnswer(Base):
    """A single answer to an event question, submitted as part of a Registration.

    One Registration has many FormAnswers (one per question answered).
    """

    __tablename__ = "form_answers"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    registration_id = Column(Integer, ForeignKey("registrations.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("event_questions.id", ondelete="CASCADE"), nullable=False, index=True)

    # The user's answer — stored as text regardless of question type.
    # Multiple-choice answers store the selected option label as-is.
    # Yes/No answers store "Yes" or "No".
    answer_value = Column(Text, nullable=False)
