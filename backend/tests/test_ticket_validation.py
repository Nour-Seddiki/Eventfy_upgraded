from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.models.event import Event
from app.models.notification import Notification  # noqa: F401  (table needed by check-in notification)
from app.models.ticket import Ticket
from app.models.user import User
from app.schemas.ticket import TicketStatus
from app.services.ticket_service import TickectService


def _create_user(db, username: str, role: str = "attendee") -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        hashed_password="hashed",
        role=role,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _setup(db):
    organizer = _create_user(db, "organizer", role="organizer")
    attendee = _create_user(db, "attendee")
    event = Event(
        title="Check-in Event",
        description="",
        category="music",
        location="algiers",
        price=0.0,
        available_tickets=10,
        start_date=datetime.now(timezone.utc) + timedelta(hours=1),
        organizer_id=organizer.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    ticket = Ticket(
        user_id=attendee.id,
        event_id=event.id,
        qr_code="qr-123",
        status=TicketStatus.active,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return organizer, attendee, ticket


def _as_auth(user: User) -> dict:
    return {"username": user.username, "user_id": user.id, "user_role": user.role}


def test_non_organizer_cannot_validate_ticket(db_session):
    _, attendee, ticket = _setup(db_session)
    outsider = _create_user(db_session, "outsider", role="organizer")

    for caller in (attendee, outsider):
        with pytest.raises(HTTPException) as exc:
            TickectService().validate_ticket(_as_auth(caller), db_session, "qr-123")
        assert exc.value.status_code == 403

    db_session.refresh(ticket)
    assert ticket.status == TicketStatus.active


def test_organizer_can_validate_ticket_once(db_session):
    organizer, _, ticket = _setup(db_session)

    TickectService().validate_ticket(_as_auth(organizer), db_session, "qr-123")
    db_session.refresh(ticket)
    assert ticket.status == TicketStatus.used

    with pytest.raises(HTTPException) as exc:
        TickectService().validate_ticket(_as_auth(organizer), db_session, "qr-123")
    assert exc.value.status_code == 409


def test_admin_can_validate_ticket(db_session):
    _, _, ticket = _setup(db_session)
    admin = _create_user(db_session, "admin", role="admin")

    TickectService().validate_ticket(_as_auth(admin), db_session, "qr-123")
    db_session.refresh(ticket)
    assert ticket.status == TicketStatus.used
