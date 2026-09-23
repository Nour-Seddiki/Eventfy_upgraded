"""Registration Service — business logic for the Dynamic Event Registration Form.

Handles: form question management, registration submission, organizer review
(approve / reject), and ticket generation upon approval.

Business rules (confirmed by user):
  • Payment happens AFTER approval (not before).
  • Rejection is final — users cannot re-submit after being rejected.
  • In-app notifications are sent for every status change.
"""

import json
import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.event_question import EventQuestion
from app.models.form_answer import FormAnswer
from app.models.registration import Registration
from app.models.ticket import Ticket
from app.models.user import User
from app.schemas.notification import CreateNotification, NotificationType
from app.schemas.registration import (
    AnswerDetail,
    QuestionCreate,
    QuestionResponse,
    RegistrationDetail,
    RegistrationResponse,
    VALID_PROFILE_FIELD_KEYS,
    VALID_QUESTION_TYPES,
)
from app.services.notification_service import NotificationService
from app.utils.qr_generator import generate_qr_code

logger = logging.getLogger(__name__)


class RegistrationService:
    """Stateless service — all methods are static or class methods."""

    # ─── helpers ────────────────────────────────────────────

    @staticmethod
    def _get_authenticated_user(user_dict: dict, db: Session) -> User:
        if user_dict is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        user_model = db.query(User).filter(User.id == user_dict.get("user_id")).first()
        if user_model is None or user_model.is_deleted:
            raise HTTPException(status_code=401, detail="Authentication required")
        return user_model

    @staticmethod
    def _get_event_or_404(db: Session, event_id: int) -> Event:
        event = db.query(Event).filter(Event.id == event_id, Event.is_deleted.is_(False)).first()
        if event is None:
            raise HTTPException(status_code=404, detail="Event not found")
        return event

    @staticmethod
    def _require_organizer(user_dict: dict, event: Event):
        """Ensure the caller owns this event (or is an admin)."""
        role = (user_dict.get("user_role") or "").lower()
        if role == "admin":
            return
        if event.organizer_id != user_dict.get("user_id"):
            raise HTTPException(status_code=403, detail="Only the event organizer can perform this action")

    # ═══════════════════════════════════════════════════════
    #  QUESTIONS  (Form Builder)
    # ═══════════════════════════════════════════════════════

    @staticmethod
    def bulk_save_questions(user_dict: dict, db: Session, event_id: int, questions: list[QuestionCreate]) -> list[QuestionResponse]:
        """Replace ALL questions for an event with the provided list.

        This is an idempotent operation: existing questions are deleted and
        replaced.  Used by the organizer's Form Builder "Save" action.
        """
        event = RegistrationService._get_event_or_404(db, event_id)
        RegistrationService._require_organizer(user_dict, event)

        # Validate question data
        for q in questions:
            if q.question_type not in VALID_QUESTION_TYPES:
                raise HTTPException(status_code=400, detail=f"Invalid question type: {q.question_type}")
            if q.profile_field_key and q.profile_field_key not in VALID_PROFILE_FIELD_KEYS:
                raise HTTPException(status_code=400, detail=f"Invalid profile_field_key: {q.profile_field_key}")
            if q.question_type == "multiple_choice":
                if not q.options_json:
                    raise HTTPException(status_code=400, detail="multiple_choice questions must have options_json")
                try:
                    opts = json.loads(q.options_json)
                    if not isinstance(opts, list) or len(opts) < 2:
                        raise ValueError()
                except (json.JSONDecodeError, ValueError):
                    raise HTTPException(status_code=400, detail="options_json must be a JSON array with at least 2 items")

        # Delete existing questions (cascades to form_answers for any existing registrations)
        db.query(EventQuestion).filter(EventQuestion.event_id == event_id).delete()

        # Insert new questions
        new_questions = []
        for idx, q in enumerate(questions):
            eq = EventQuestion(
                event_id=event_id,
                question_type=q.question_type,
                label=q.label,
                options_json=q.options_json,
                is_required=q.is_required,
                profile_field_key=q.profile_field_key,
                display_order=q.display_order if q.display_order else idx,
            )
            db.add(eq)
            new_questions.append(eq)

        # Auto-enable requires_approval when questions are saved
        if not event.requires_approval and len(questions) > 0:
            event.requires_approval = True

        db.commit()
        for eq in new_questions:
            db.refresh(eq)

        return [
            QuestionResponse(
                id=eq.id,
                event_id=eq.event_id,
                question_type=eq.question_type,
                label=eq.label,
                options_json=eq.options_json,
                is_required=eq.is_required,
                profile_field_key=eq.profile_field_key,
                display_order=eq.display_order,
            )
            for eq in new_questions
        ]

    @staticmethod
    def get_questions(db: Session, event_id: int) -> list[QuestionResponse]:
        """Fetch all questions for an event, ordered by display_order."""
        # Validate event exists
        RegistrationService._get_event_or_404(db, event_id)

        questions = (
            db.query(EventQuestion)
            .filter(EventQuestion.event_id == event_id)
            .order_by(EventQuestion.display_order, EventQuestion.id)
            .all()
        )

        return [
            QuestionResponse(
                id=q.id,
                event_id=q.event_id,
                question_type=q.question_type,
                label=q.label,
                options_json=q.options_json,
                is_required=q.is_required,
                profile_field_key=q.profile_field_key,
                display_order=q.display_order,
            )
            for q in questions
        ]

    @staticmethod
    def delete_question(user_dict: dict, db: Session, question_id: int):
        """Delete a single question."""
        question = db.query(EventQuestion).filter(EventQuestion.id == question_id).first()
        if question is None:
            raise HTTPException(status_code=404, detail="Question not found")

        event = RegistrationService._get_event_or_404(db, question.event_id)
        RegistrationService._require_organizer(user_dict, event)

        db.delete(question)
        db.commit()
        return {"message": "Question deleted"}

    # ═══════════════════════════════════════════════════════
    #  REGISTRATION  (User Submission)
    # ═══════════════════════════════════════════════════════

    @staticmethod
    def submit_registration(user_dict: dict, db: Session, event_id: int, answers: list) -> RegistrationResponse:
        """Submit a registration form for an event.

        Creates a Registration with status 'in_processing' and saves all
        form answers.  Notifies the organizer.
        """
        user_model = RegistrationService._get_authenticated_user(user_dict, db)
        event = RegistrationService._get_event_or_404(db, event_id)

        # Restriction check
        if user_dict.get('is_restricted'):
            raise HTTPException(
                status_code=403,
                detail="Your account is restricted. You cannot register for events."
            )

        if not event.requires_approval:
            raise HTTPException(status_code=400, detail="This event does not require a registration form")

        # Check ticket availability
        if event.available_tickets <= 0:
            raise HTTPException(status_code=400, detail="No seats available for this event")

        # Check registration deadline
        if event.registration_deadline:
            dl = event.registration_deadline
            if dl.tzinfo is None:
                dl = dl.replace(tzinfo=timezone.utc)
            if dl < datetime.now(timezone.utc):
                raise HTTPException(status_code=400, detail="Registration deadline has passed")

        # Prevent duplicate registration — allow re-registration after rejection (up to 3 attempts)
        existing = db.query(Registration).filter(
            and_(
                Registration.user_id == user_model.id,
                Registration.event_id == event_id,
            )
        ).first()

        new_attempt_count = 1
        if existing:
            if existing.status == "rejected":
                if existing.attempt_count >= 3:
                    raise HTTPException(
                        status_code=403,
                        detail="You have exhausted all 3 registration attempts for this event."
                    )
                # Allow re-registration: delete old record (CASCADE deletes form_answers)
                new_attempt_count = existing.attempt_count + 1
                db.delete(existing)
                db.flush()
            else:
                raise HTTPException(
                    status_code=409,
                    detail=f"You have already registered for this event (status: {existing.status})"
                )

        # Validate required questions are answered
        questions = (
            db.query(EventQuestion)
            .filter(EventQuestion.event_id == event_id)
            .all()
        )
        question_map = {q.id: q for q in questions}
        answered_ids = {a.question_id for a in answers}

        for q in questions:
            if q.is_required and q.id not in answered_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"Required question not answered: '{q.label}'"
                )

        # Validate answer question_ids belong to this event
        for a in answers:
            if a.question_id not in question_map:
                raise HTTPException(
                    status_code=400,
                    detail=f"Question ID {a.question_id} does not belong to this event"
                )

        # Create registration
        registration = Registration(
            user_id=user_model.id,
            event_id=event_id,
            status="in_processing",
            attempt_count=new_attempt_count,
        )
        db.add(registration)
        db.flush()  # Get the registration.id before committing

        # Create form answers
        for a in answers:
            fa = FormAnswer(
                registration_id=registration.id,
                question_id=a.question_id,
                answer_value=a.answer_value,
            )
            db.add(fa)

        db.commit()
        db.refresh(registration)

        # Notify the organizer
        try:
            notif_data = CreateNotification(
                user_id=event.organizer_id,
                type=NotificationType.REGISTRATION_RECEIVED,
                title="New Registration",
                message=f"'{user_model.username}' has submitted a registration for '{event.title}' (attempt {new_attempt_count}/3).",
                related_object_id=str(registration.id),
                related_object_type="registration",
            )
            NotificationService.create_notification(db, notif_data)
        except Exception as exc:
            logger.warning("Failed to create organizer notification: %s", exc)


        return RegistrationResponse(
            id=registration.id,
            user_id=registration.user_id,
            event_id=registration.event_id,
            status=registration.status,
            created_at=registration.created_at,
            user_name=user_model.username,
            user_email=user_model.email,
            attempt_count=registration.attempt_count,
        )

    # ═══════════════════════════════════════════════════════
    #  ORGANIZER DASHBOARD  (List & Review)
    # ═══════════════════════════════════════════════════════

    @staticmethod
    def list_event_registrations(
        user_dict: dict, db: Session, event_id: int, status_filter: str | None = None
    ) -> list[RegistrationResponse]:
        """List all registrations for an event (organizer only)."""
        event = RegistrationService._get_event_or_404(db, event_id)
        RegistrationService._require_organizer(user_dict, event)

        query = (
            db.query(Registration, User)
            .join(User, Registration.user_id == User.id)
            .filter(Registration.event_id == event_id)
        )
        if status_filter:
            if status_filter == "pending":
                query = query.filter(Registration.status.in_(["in_processing", "payment_required"]))
            elif status_filter == "approved":
                query = query.filter(Registration.status == "confirmed")
            else:
                query = query.filter(Registration.status == status_filter)

        query = query.order_by(Registration.created_at.desc())
        rows = query.all()

        return [
            RegistrationResponse(
                id=reg.id,
                user_id=reg.user_id,
                event_id=reg.event_id,
                status=reg.status,
                created_at=reg.created_at,
                user_name=u.username,
                user_email=u.email,
                attempt_count=reg.attempt_count or 1,
            )
            for reg, u in rows
        ]

    @staticmethod
    def get_registration_detail(user_dict: dict, db: Session, registration_id: int) -> RegistrationDetail:
        """Get a single registration with all submitted answers (organizer only)."""
        registration = db.query(Registration).filter(Registration.id == registration_id).first()
        if registration is None:
            raise HTTPException(status_code=404, detail="Registration not found")

        event = RegistrationService._get_event_or_404(db, registration.event_id)
        RegistrationService._require_organizer(user_dict, event)

        user = db.query(User).filter(User.id == registration.user_id).first()

        # Get answers with question details
        answers_raw = (
            db.query(FormAnswer, EventQuestion)
            .join(EventQuestion, FormAnswer.question_id == EventQuestion.id)
            .filter(FormAnswer.registration_id == registration_id)
            .order_by(EventQuestion.display_order, EventQuestion.id)
            .all()
        )

        answers = [
            AnswerDetail(
                question_id=eq.id,
                question_label=eq.label,
                question_type=eq.question_type,
                answer_value=fa.answer_value,
            )
            for fa, eq in answers_raw
        ]

        return RegistrationDetail(
            id=registration.id,
            user_id=registration.user_id,
            event_id=registration.event_id,
            status=registration.status,
            created_at=registration.created_at,
            user_name=user.username if user else None,
            user_email=user.email if user else None,
            answers=answers,
            reviewed_by=registration.reviewed_by,
            reviewed_at=registration.reviewed_at,
            attempt_count=registration.attempt_count or 1,
        )

    @staticmethod
    def review_registration(user_dict: dict, db: Session, registration_id: int, action: str) -> dict:
        """Approve or reject a registration.

        On approval:
          1. Status → 'confirmed' (if free) or 'payment_required' (if paid)
          2. A ticket is generated (if free)
          3. Available seats decremented (if free)
          4. Attendee notified

        On rejection:
          1. Status → 'rejected' (final — user cannot re-submit)
          2. Attendee notified
        """
        user_model = RegistrationService._get_authenticated_user(user_dict, db)

        registration = db.query(Registration).filter(Registration.id == registration_id).first()
        if registration is None:
            raise HTTPException(status_code=404, detail="Registration not found")

        if registration.status != "in_processing":
            raise HTTPException(
                status_code=400,
                detail=f"Registration has already been reviewed (status: {registration.status})"
            )

        event = RegistrationService._get_event_or_404(db, registration.event_id)
        RegistrationService._require_organizer(user_dict, event)

        now = datetime.now(timezone.utc)
        registration.reviewed_by = user_model.id
        registration.reviewed_at = now
        registration.updated_at = now

        if action == "approve":
            # Check seat availability before approving
            if event.available_tickets <= 0:
                raise HTTPException(status_code=400, detail="No seats available to approve this registration")

            is_paid_event = bool(event.price and event.price > 0)
            new_ticket = None

            if is_paid_event:
                registration.status = "payment_required"
                db.commit()

                try:
                    notif_data = CreateNotification(
                        user_id=registration.user_id,
                        type=NotificationType.REGISTRATION_APPROVED,
                        title="Registration Approved! Action Required 💳",
                        message=(
                            f"Great news! Your registration for '{event.title}' was approved. "
                            f"Please complete your payment of {event.price} {event.currency or 'DZD'} to secure your ticket."
                        ),
                        related_object_id=str(registration.id),
                        related_object_type="registration"
                    )
                    NotificationService.create_notification(db, notif_data)
                except Exception as exc:
                    logger.warning("Failed to create notification: %s", exc)


                return {
                    "message": "Registration approved — payment required",
                    "registration_id": registration.id,
                    "status": "payment_required",
                }

            else:
                registration.status = "confirmed"

                # Generate ticket
                unique_id, qr_bytes = generate_qr_code()
                new_ticket = Ticket(
                    user_id=registration.user_id,
                    event_id=registration.event_id,
                    qr_code=unique_id,
                    qr_image=qr_bytes,
                    status="active",
                    purchased_at=now,
                )
                db.add(new_ticket)
                event.available_tickets -= 1

                db.commit()
                db.refresh(new_ticket)

                try:
                    notif_data = CreateNotification(
                        user_id=registration.user_id,
                        type=NotificationType.REGISTRATION_APPROVED,
                        title="Registration Approved! 🎉",
                        message=(
                            f"Congratulations! Your registration for '{event.title}' has been approved "
                            "and your ticket is ready."
                        ),
                        related_object_id=str(new_ticket.id),
                        related_object_type="ticket"
                    )
                    NotificationService.create_notification(db, notif_data)
                except Exception as exc:
                    logger.warning("Failed to create approval notification: %s", exc)


                return {
                    "message": "Registration approved — ticket generated",
                    "registration_id": registration.id,
                    "ticket_id": str(new_ticket.id),
                    "status": "confirmed",
                }

        elif action == "reject":
            registration.status = "rejected"
            db.commit()

            # Build rejection message with remaining attempts info
            attempts_used = registration.attempt_count or 1
            remaining = 3 - attempts_used
            if remaining > 0:
                reject_msg = (
                    f"Your registration for '{event.title}' was not approved. "
                    f"You have {remaining} attempt(s) remaining to re-apply."
                )
            else:
                reject_msg = (
                    f"Your registration for '{event.title}' was not approved. "
                    f"No more attempts remaining."
                )

            # Notify attendee — rejection
            try:
                notif_data = CreateNotification(
                    user_id=registration.user_id,
                    type=NotificationType.REGISTRATION_REJECTED,
                    title="Registration Not Approved",
                    message=reject_msg,
                    related_object_id=str(registration.id),
                    related_object_type="registration",
                )
                NotificationService.create_notification(db, notif_data)
            except Exception as exc:
                logger.warning("Failed to create rejection notification: %s", exc)


            return {
                "message": "Registration rejected",
                "registration_id": registration.id,
                "status": "rejected",
                "attempt_count": attempts_used,
                "remaining_attempts": remaining,
            }

        else:
            raise HTTPException(status_code=400, detail="Invalid action — must be 'approve' or 'reject'")

    # ═══════════════════════════════════════════════════════
    #  USER — My Registrations
    # ═══════════════════════════════════════════════════════

    @staticmethod
    def get_my_registrations(user_dict: dict, db: Session) -> list[RegistrationResponse]:
        """List all registrations for the current user across all events."""
        user_model = RegistrationService._get_authenticated_user(user_dict, db)

        rows = (
            db.query(Registration)
            .filter(Registration.user_id == user_model.id)
            .order_by(Registration.created_at.desc())
            .all()
        )

        return [
            RegistrationResponse(
                id=reg.id,
                user_id=reg.user_id,
                event_id=reg.event_id,
                status=reg.status,
                created_at=reg.created_at,
                user_name=user_model.username,
                user_email=user_model.email,
                attempt_count=reg.attempt_count or 1,
            )
            for reg in rows
        ]
