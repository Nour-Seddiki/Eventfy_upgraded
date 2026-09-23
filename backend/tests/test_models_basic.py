from datetime import datetime, timedelta, timezone

from app.models.event import Event
from app.models.recommendation import Recommendation
from app.models.review import Review
from app.models.ticket import Ticket
from app.models.user import User
from app.schemas.ticket import TicketStatus


def test_models_can_persist(db_session):
    user = User(
        username="user_basic",
        email="user_basic@example.com",
        hashed_password="hashed",
        role="attendee",
        is_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    event = Event(
        title="Basic Event",
        description="Basic Description",
        category="music",
        location="algiers",
        price=20.0,
        available_tickets=5,
        start_date=datetime.now(timezone.utc) + timedelta(days=2),
        organizer_id=user.id,
    )
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)

    ticket = Ticket(
        user_id=user.id,
        event_id=event.id,
        qr_code="basic-qr-1",
        qr_image=b"",
        status=TicketStatus.active,
        purchased_at=datetime.now(timezone.utc),
    )
    db_session.add(ticket)
    db_session.commit()
    db_session.refresh(ticket)

    recommendation = Recommendation(
        user_id=user.id,
        event_id=event.id,
        score=5,
    )
    db_session.add(recommendation)
    db_session.commit()
    db_session.refresh(recommendation)

    review = Review(
        rating=4,
        comment="Solid",
        reviewer_id=user.id,
        event_id=event.id,
        organizer_id=None,
        is_verified_purchase=False,
    )
    db_session.add(review)
    db_session.commit()
    db_session.refresh(review)

    assert user.id is not None
    assert event.id is not None
    assert ticket.id is not None
    assert recommendation.id is not None
    assert review.id is not None
