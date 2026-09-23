from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.models.event import Event
from app.models.review import Review
from app.models.ticket import Ticket
from app.models.user import User
from app.schemas.review import ReviewRequest, UpdateReview
from app.schemas.ticket import TicketStatus
from app.services.review_sevice import ReviewService


def _create_user(db, username: str, email: str) -> User:
    user = User(
        username=username,
        email=email,
        hashed_password="hashed",
        role="attendee",
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_event(db, organizer_id: int) -> Event:
    event = Event(
        title="Test Event",
        description="Test Description",
        category="music",
        location="algiers",
        price=50.0,
        available_tickets=10,
        start_date=datetime.now(timezone.utc) + timedelta(days=1),
        organizer_id=organizer_id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def _create_ticket(db, user_id: int, event_id: int, status: TicketStatus) -> Ticket:
    ticket = Ticket(
        user_id=user_id,
        event_id=event_id,
        qr_code="qr-1",
        qr_image=b"",
        status=status,
        purchased_at=datetime.now(timezone.utc),
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


def test_create_review_requires_target(db_session):
    service = ReviewService()
    with pytest.raises(HTTPException) as exc:
        service.create_review({"user_id": 1}, db_session, ReviewRequest(rating=5))
    assert exc.value.status_code == 400


def test_create_review_requires_used_ticket(db_session):
    user = _create_user(db_session, "user1", "user1@example.com")
    organizer = _create_user(db_session, "org1", "org1@example.com")
    event = _create_event(db_session, organizer.id)

    service = ReviewService()
    with pytest.raises(HTTPException) as exc:
        service.create_review(
            {"user_id": user.id},
            db_session,
            ReviewRequest(rating=4, event_id=event.id),
        )
    assert exc.value.status_code == 403


def test_create_review_success_for_used_ticket(db_session):
    user = _create_user(db_session, "user2", "user2@example.com")
    organizer = _create_user(db_session, "org2", "org2@example.com")
    event = _create_event(db_session, organizer.id)
    _create_ticket(db_session, user.id, event.id, TicketStatus.used)

    service = ReviewService()
    review = service.create_review(
        {"user_id": user.id},
        db_session,
        ReviewRequest(rating=5, comment="Great", event_id=event.id),
    )

    assert isinstance(review, Review)
    assert review.reviewer_id == user.id
    assert review.event_id == event.id
    assert review.is_verified_purchase is True


def test_update_review_only_author(db_session):
    author = _create_user(db_session, "author", "author@example.com")
    other = _create_user(db_session, "other", "other@example.com")
    organizer = _create_user(db_session, "org3", "org3@example.com")
    event = _create_event(db_session, organizer.id)

    review = Review(
        rating=3,
        comment="ok",
        reviewer_id=author.id,
        event_id=event.id,
        organizer_id=None,
        is_verified_purchase=False,
    )
    db_session.add(review)
    db_session.commit()
    db_session.refresh(review)

    service = ReviewService()
    with pytest.raises(HTTPException) as exc:
        service.update_review(
            {"user_id": other.id},
            db_session,
            review.id,
            UpdateReview(rating=4),
        )
    assert exc.value.status_code == 404
