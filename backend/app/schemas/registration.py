"""Pydantic schemas for the Dynamic Event Registration Form feature.

Covers: event questions (form builder), registration submissions,
form answers, and organizer review actions.
"""

from datetime import datetime
from typing import Optional, Literal

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════
# Event Question Schemas (Form Builder)
# ═══════════════════════════════════════════

VALID_QUESTION_TYPES = ("short_text", "long_text", "multiple_choice", "yes_no")

VALID_PROFILE_FIELD_KEYS = (
    "phone", "full_name", "location", "bio",
    "university", "major", "dietary_restrictions",
    "date_of_birth", "gender",
)


class QuestionCreate(BaseModel):
    """Schema for creating a single event question."""

    question_type: Literal["short_text", "long_text", "multiple_choice", "yes_no"]
    label: str = Field(min_length=1, max_length=500)
    options_json: Optional[str] = None      # JSON array string, e.g. '["Option A","Option B"]'
    is_required: bool = True
    profile_field_key: Optional[str] = None  # Maps to a user profile field for autofill
    display_order: int = 0


class QuestionResponse(BaseModel):
    """Schema returned when fetching event questions."""

    id: int
    event_id: int
    question_type: str
    label: str
    options_json: Optional[str] = None
    is_required: bool
    profile_field_key: Optional[str] = None
    display_order: int

    class Config:
        from_attributes = True


class QuestionBulkSave(BaseModel):
    """Bulk-save: replaces ALL questions for an event at once (used by form builder)."""

    questions: list[QuestionCreate]


# ═══════════════════════════════════════════
# Registration Schemas (User Submissions)
# ═══════════════════════════════════════════

class AnswerSubmit(BaseModel):
    """A single answer submitted by the user."""

    question_id: int
    answer_value: str = Field(min_length=0, max_length=5000)


class RegistrationSubmit(BaseModel):
    """Payload for submitting a registration form."""

    answers: list[AnswerSubmit]


class RegistrationResponse(BaseModel):
    """Summary of a registration — used in lists/tables."""

    id: int
    user_id: int
    event_id: int
    status: str
    created_at: datetime
    user_name: Optional[str] = None     # Joined from users table
    user_email: Optional[str] = None    # Joined from users table
    attempt_count: int = 1              # Current attempt number (max 3)

    class Config:
        from_attributes = True


class AnswerDetail(BaseModel):
    """A single Q&A pair for display in the registration detail view."""

    question_id: int
    question_label: str
    question_type: str
    answer_value: str


class RegistrationDetail(RegistrationResponse):
    """Full registration detail — includes all submitted answers."""

    answers: list[AnswerDetail] = []
    reviewed_by: Optional[int] = None
    reviewed_at: Optional[datetime] = None


# ═══════════════════════════════════════════
# Organizer Review Schemas
# ═══════════════════════════════════════════

class ReviewAction(BaseModel):
    """Payload for approving or rejecting a registration."""

    action: Literal["approve", "reject"]
