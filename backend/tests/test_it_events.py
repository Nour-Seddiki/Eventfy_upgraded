from datetime import datetime, timedelta, timezone

from app.models.event import Event
from app.models.ticket import Ticket
from app.models.user import User
from app.routes import events as event_routes
from app.schemas.event import eventRequest
from app.schemas.ticket import TicketStatus
from app.services.event_service import EventService
from app.services.recommendation_service import Recommendation_Servies


def _organizer(db) -> dict:
    user = User(username="org", email="org@example.com", hashed_password="x", role="organizer")
    db.add(user)
    db.commit()
    return {"username": user.username, "user_id": user.id, "user_role": user.role}


def _event(db, organizer_id, title, location, days_ahead):
    event = Event(
        title=title,
        description="",
        location=location,
        price=0.0,
        available_tickets=10,
        start_date=datetime.now(timezone.utc) + timedelta(days=days_ahead),
        organizer_id=organizer_id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def test_created_events_are_it_events(db_session):
    organizer = _organizer(db_session)
    # Old clients may still send a category; it is ignored
    data = eventRequest(
        title="PyCon Algiers",
        description="Python conference",
        category="music",
        location="Algiers",
        price=0,
        available_tickets=100,
        start_date=datetime.now(timezone.utc) + timedelta(days=10),
    )

    created = EventService().create_event(organizer, db_session, data)

    assert "category" not in created
    assert db_session.get(Event, created["id"]).category == "IT"


def test_similar_events_prefer_same_city(db_session):
    org_id = _organizer(db_session)["user_id"]
    base = _event(db_session, org_id, "DevFest Oran", "Oran", 5)
    far_soon = _event(db_session, org_id, "Cloud Day Algiers", "Algiers", 1)
    near_later = _event(db_session, org_id, "Rust Meetup Oran", "Oran", 20)

    result = event_routes.similar_events(db_session, base.id, 5)

    assert [e["id"] for e in result] == [near_later.id, far_soon.id]


def test_recommendations_skip_attended_and_prefer_same_city(db_session):
    org_id = _organizer(db_session)["user_id"]
    attendee = User(username="dev", email="dev@example.com", hashed_password="x", role="attendee")
    db_session.add(attendee)
    db_session.commit()
    attended = _event(db_session, org_id, "Hackathon Oran", "Oran", 2)
    other_city = _event(db_session, org_id, "AI Summit Algiers", "Algiers", 3)
    same_city = _event(db_session, org_id, "Security Night Oran", "Oran", 9)
    db_session.add(Ticket(user_id=attendee.id, event_id=attended.id, qr_code="q1", status=TicketStatus.active))
    db_session.commit()

    result = Recommendation_Servies().recommendation(
        {"username": "dev", "user_id": attendee.id, "user_role": "attendee"}, db_session
    )

    assert [e["id"] for e in result] == [same_city.id, other_city.id]
