from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.event import Event
from app.models.user import User
from app.schemas.event import eventRequest, eventUpdate, now_local
from app.services.event_service import EventService

SOON = now_local() + timedelta(days=10)


def _req(**overrides):
    data = dict(title="Flutter Study Jam", description="Hands-on", location="Salle 3, Alger",
                price=0, currency="DZD", available_tickets=60, start_date=SOON)
    data.update(overrides)
    return eventRequest(**data)


def test_utc_times_are_stored_as_local_algeria_time():
    # The old create page sent toISOString(): 14:00 in Algiers arrived as 13:00Z
    utc = datetime(2030, 10, 20, 13, 0, tzinfo=timezone.utc)
    assert _req(start_date=utc).start_date == datetime(2030, 10, 20, 14, 0)
    assert _req(start_date=datetime(2030, 10, 20, 14, 0)).start_date == datetime(2030, 10, 20, 14, 0)


@pytest.mark.parametrize("overrides, message", [
    ({"start_date": datetime(2020, 1, 1, 10)}, "in the past"),
    ({"price": -5}, "greater than or equal"),
    ({"available_tickets": 0}, "greater than or equal"),
    ({"price": 10}, "at least 50 DZD"),
    ({"end_date": SOON - timedelta(hours=1)}, "end date must be after"),
    ({"registration_deadline": SOON + timedelta(days=1)}, "deadline must be before"),
    ({"currency": "JPY"}, "Currency must be one of"),
    ({"title": "x" * 51}, "at most 50"),
])
def test_invalid_events_are_rejected(overrides, message):
    with pytest.raises(ValidationError) as exc:
        _req(**overrides)
    assert message in str(exc.value)


def test_foreign_prices_use_the_dzd_minimum():
    assert _req(price=1, currency="usd").currency == "USD"   # 230 DZD, fine
    with pytest.raises(ValidationError):
        _req(price=0.1, currency="EUR")                      # 28 DZD, too cheap


def _event(db):
    org = User(username="org", email="org@example.com", hashed_password="x", role="organizer")
    db.add(org)
    db.commit()
    ev = Event(title="Meetup", description="d", location="Alger", price=0, currency="DZD", available_tickets=10,
               start_date=SOON, image="/uploads/event-images/cover.png", organizer_id=org.id)
    db.add(ev)
    db.commit()
    return {"username": "org", "user_id": org.id, "user_role": "organizer"}, ev


def test_editing_keeps_the_cover_image(db_session):
    auth, ev = _event(db_session)
    EventService().update_event(auth, db_session, eventUpdate(title="Meetup #2", image=None), ev.id)
    db_session.refresh(ev)
    assert (ev.title, ev.image) == ("Meetup #2", "/uploads/event-images/cover.png")


def test_edits_are_checked_against_stored_dates(db_session):
    auth, ev = _event(db_session)
    with pytest.raises(HTTPException) as exc:
        EventService().update_event(auth, db_session, eventUpdate(end_date=SOON - timedelta(hours=2)), ev.id)
    assert exc.value.status_code == 422 and "end date" in exc.value.detail
    with pytest.raises(HTTPException):
        EventService().update_event(auth, db_session, eventUpdate(price=20), ev.id)


@pytest.mark.parametrize("role", ["admin", "attendee"])
def test_only_organizers_create_events(db_session, role):
    user = User(username=role, email=f"{role}@example.com", hashed_password="x", role=role)
    db_session.add(user)
    db_session.commit()
    with pytest.raises(HTTPException) as exc:
        EventService().create_event({"username": role, "user_id": user.id, "user_role": role}, db_session, _req())
    assert exc.value.status_code == 403
