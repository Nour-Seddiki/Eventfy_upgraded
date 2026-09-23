"""API routes for the Dynamic Event Registration Form feature.

Prefix: /registrations

Endpoints:
  POST   /events/{event_id}/questions       — Bulk-save questions (organizer)
  GET    /events/{event_id}/questions       — Fetch form questions (public)
  DELETE /questions/{question_id}           — Delete a question (organizer)
  POST   /events/{event_id}/register        — Submit registration (attendee)
  GET    /my-registrations                  — My registrations (attendee)
  GET    /events/{event_id}/registrations   — List registrations (organizer)
  GET    /{registration_id}                 — Get registration detail (organizer)
  PUT    /{registration_id}/review          — Approve/reject (organizer)
"""

from fastapi import APIRouter, Path, Query
from starlette import status

from app.db.session import db_dependency
from app.services.auth_service import user_dependency
from app.services.registration_service import RegistrationService
from app.schemas.registration import (
    QuestionBulkSave,
    QuestionResponse,
    RegistrationDetail,
    RegistrationResponse,
    RegistrationSubmit,
    ReviewAction,
)

router = APIRouter(prefix="/registrations", tags=["registrations"])


# ═══════════════════════════════════════════════════════
#  QUESTIONS  (Form Builder)
# ═══════════════════════════════════════════════════════

@router.post(
    "/events/{event_id}/questions",
    status_code=status.HTTP_200_OK,
    response_model=list[QuestionResponse],
)
def bulk_save_questions(
    user: user_dependency,
    db: db_dependency,
    payload: QuestionBulkSave,
    event_id: int = Path(gt=0),
):
    """Replace ALL questions for an event (form builder save).

    Only the event organizer (or admin) can call this.
    """
    return RegistrationService.bulk_save_questions(user, db, event_id, payload.questions)


@router.get(
    "/events/{event_id}/questions",
    status_code=status.HTTP_200_OK,
    response_model=list[QuestionResponse],
)
def get_event_questions(
    db: db_dependency,
    event_id: int = Path(gt=0),
):
    """Fetch all questions for an event's registration form.

    Public endpoint — no auth required (the form itself is public,
    but submitting answers requires login).
    """
    return RegistrationService.get_questions(db, event_id)


@router.delete(
    "/questions/{question_id}",
    status_code=status.HTTP_200_OK,
)
def delete_question(
    user: user_dependency,
    db: db_dependency,
    question_id: int = Path(gt=0),
):
    """Delete a single question.  Organizer only."""
    return RegistrationService.delete_question(user, db, question_id)


# ═══════════════════════════════════════════════════════
#  REGISTRATION  (User Submission)
# ═══════════════════════════════════════════════════════

@router.post(
    "/events/{event_id}/register",
    status_code=status.HTTP_201_CREATED,
    response_model=RegistrationResponse,
)
def submit_registration(
    user: user_dependency,
    db: db_dependency,
    payload: RegistrationSubmit,
    event_id: int = Path(gt=0),
):
    """Submit the registration form for an event.

    Creates a Registration with status 'in_processing'.
    The organizer must approve it before a ticket is generated.
    """
    return RegistrationService.submit_registration(user, db, event_id, payload.answers)


# ═══════════════════════════════════════════════════════
#  USER — My Registrations  (MUST be before /{registration_id})
# ═══════════════════════════════════════════════════════

@router.get(
    "/my-registrations",
    status_code=status.HTTP_200_OK,
    response_model=list[RegistrationResponse],
)
def get_my_registrations(
    user: user_dependency,
    db: db_dependency,
):
    """List the current user's registrations across all events."""
    return RegistrationService.get_my_registrations(user, db)


# ═══════════════════════════════════════════════════════
#  ORGANIZER DASHBOARD  (List & Review)
# ═══════════════════════════════════════════════════════

@router.get(
    "/events/{event_id}/registrations",
    status_code=status.HTTP_200_OK,
    response_model=list[RegistrationResponse],
)
def list_event_registrations(
    user: user_dependency,
    db: db_dependency,
    event_id: int = Path(gt=0),
    status_filter: str | None = Query(default=None, alias="status"),
):
    """List all registrations for an event.  Organizer only.

    Optional query param: ?status=in_processing|confirmed|rejected
    """
    return RegistrationService.list_event_registrations(user, db, event_id, status_filter)


@router.get(
    "/{registration_id}",
    status_code=status.HTTP_200_OK,
    response_model=RegistrationDetail,
)
def get_registration_detail(
    user: user_dependency,
    db: db_dependency,
    registration_id: int = Path(gt=0),
):
    """Get full registration detail with all answers.  Organizer only."""
    return RegistrationService.get_registration_detail(user, db, registration_id)


@router.put(
    "/{registration_id}/review",
    status_code=status.HTTP_200_OK,
)
def review_registration(
    user: user_dependency,
    db: db_dependency,
    payload: ReviewAction,
    registration_id: int = Path(gt=0),
):
    """Approve or reject a registration.

    On 'approve': status → 'confirmed', ticket generated, attendee notified.
    On 'reject':  status → 'rejected' (final), attendee notified.
    """
    return RegistrationService.review_registration(user, db, registration_id, payload.action)

