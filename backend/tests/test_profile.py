from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.models.event import Event
from app.models.ticket import Ticket
from app.models.user import User
from app.schemas.user import update_password
from app.services.auth_service import hashing_password, verifying_password
from app.services.user_service import userServices
from app.utils import supabase_storage


def _user(db, password="secret123") -> User:
    user = User(username="dev", email="dev@example.com", hashed_password=hashing_password(password), role="attendee")
    db.add(user)
    db.commit()
    return user


def _auth(user: User) -> dict:
    return {"username": user.username, "user_id": user.id, "user_role": user.role}


def test_wrong_current_password_is_a_400_not_a_401(db_session):
    # A 401 would make the frontend treat the session as expired and sign out
    user = _user(db_session)
    with pytest.raises(HTTPException) as exc:
        userServices.change_password(_auth(user), db_session, update_password(current_password="nope", new_password="N3w-password"))
    assert exc.value.status_code == 400

    userServices.change_password(_auth(user), db_session, update_password(current_password="secret123", new_password="N3w-password"))
    db_session.refresh(user)
    assert verifying_password("N3w-password", user.hashed_password)


def test_deleting_account_releases_upcoming_seats(db_session):
    user = _user(db_session)
    now = datetime.now(timezone.utc)
    upcoming = Event(title="Upcoming", description="", location="Alger", price=0, available_tickets=9,
                     start_date=now + timedelta(days=3), organizer_id=user.id)
    past = Event(title="Past", description="", location="Alger", price=0, available_tickets=0,
                 start_date=now - timedelta(days=30), organizer_id=user.id)
    db_session.add_all([upcoming, past])
    db_session.commit()
    t_up = Ticket(user_id=user.id, event_id=upcoming.id, qr_code="a", status="active")
    t_past = Ticket(user_id=user.id, event_id=past.id, qr_code="b", status="used")
    db_session.add_all([t_up, t_past])
    db_session.commit()

    userServices().delete_my_account(_auth(user), db_session)

    for obj in (user, upcoming, t_up, t_past):
        db_session.refresh(obj)
    assert user.is_deleted
    assert (t_up.status, upcoming.available_tickets) == ("cancelled", 10)
    assert t_past.status == "used"


def test_uploads_fall_back_to_local_disk_without_supabase_key(monkeypatch, tmp_path):
    monkeypatch.setattr(supabase_storage, "SUPABASE_SERVICE_KEY", "")
    monkeypatch.setattr(supabase_storage, "LOCAL_UPLOAD_DIR", tmp_path)

    url = supabase_storage.upload_file("avatars", b"\x89PNG fake", "me.png")

    assert url.startswith("/uploads/avatars/") and url.endswith(".png")
    assert (tmp_path / "avatars" / url.rsplit("/", 1)[1]).read_bytes() == b"\x89PNG fake"
    with pytest.raises(ValueError):
        supabase_storage.upload_file("avatars", b"x" * (supabase_storage.MAX_UPLOAD_BYTES + 1), "big.png")
