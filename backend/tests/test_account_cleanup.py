"""Real emails at signup, and the admin tool that removes fake accounts."""
import dataclasses
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.chat import Conversation, Message
from app.models.event import Event
from app.models.event_question import EventQuestion
from app.models.form_answer import FormAnswer
from app.models.notification import Notification
from app.models.payment import Payment
from app.models.registration import Registration
from app.models.review import Review
from app.models.saving_event import SavingEvent
from app.models.ticket import Ticket
from app.models.user import User
from app.schemas.user import CreateUser
from app.services import account_cleanup, auth_service
from app.services.admin_services import Admin
from app.utils import email_rules


@pytest.fixture()
def strict_emails(monkeypatch):
    """Domain checks on, with DNS answered locally."""
    monkeypatch.setattr(email_rules, "settings", dataclasses.replace(email_rules.settings, email_domain_checks=True))
    monkeypatch.setattr(email_rules, "_dns_problem",
                        lambda domain: None if domain in {"gmail.com", "esi.dz"} else f"{domain} can't receive email.")


@pytest.mark.parametrize("email, expected", [
    ("yacine@gmail.com", None),
    ("Yacine.Salhi@esi.dz", None),
    ("user@example.com", "placeholder"),
    ("organizer@test.com", "placeholder"),
    ("amira.b@demo.com", "placeholder"),
    ("dev@eventfy.local", "Enter a valid email"),
    ("me@mailinator.com", "Disposable"),
    ("me@sub.yopmail.com", "Disposable"),
    ("karim@gmial.com", "Did you mean karim@gmail.com"),
    ("someone@no-mail-server-here.dz", "can't receive email"),
    ("not-an-email", "Enter a valid email"),
])
def test_email_problems(strict_emails, email, expected):
    problem = email_rules.email_problem(email)
    if expected is None:
        assert problem is None
    else:
        assert expected in problem


def test_domain_checks_can_be_switched_off():
    # conftest turns them off: only syntax is checked
    assert email_rules.email_problem("user@example.com") is None
    assert email_rules.email_problem("nope") is not None


def test_signup_rejects_fake_emails_and_stores_them_lowercase(db_session, strict_emails):
    with pytest.raises(HTTPException) as exc:
        auth_service.create_user(CreateUser(user_name="fake", email="fake@example.com", password="secret123"), db_session)
    assert exc.value.status_code == 422 and exc.value.detail["field"] == "email"

    user_id = auth_service.create_user(
        CreateUser(user_name="yacine", email="Yacine@Gmail.com", password="secret123", full_name="Yacine Salhi"),
        db_session)["user_id"]
    user = db_session.get(User, user_id)
    assert user.email == "yacine@gmail.com" and user.full_name == "Yacine Salhi"

    # Same address in other capitals is the same account
    with pytest.raises(HTTPException) as exc:
        auth_service.create_user(CreateUser(user_name="other", email="YACINE@gmail.com", password="secret123"), db_session)
    assert exc.value.status_code == 409 and exc.value.detail["field"] == "email"

    # ...and signs in whatever capitals are typed
    assert auth_service.Authentication_user("YaCiNe@gmail.com", "secret123", db_session).id == user_id


def test_admin_user_list_has_no_password_hashes(db_session):
    db_session.add_all([User(username="boss", email="boss@gmail.com", hashed_password="$2b$secret", role="admin"),
                        User(username="amina", email="amina@gmail.com", hashed_password="$2b$secret")])
    db_session.commit()
    rows = Admin().view_all_users({"user_id": 1, "user_role": "admin"}, db_session)
    assert len(rows) == 2 and all("hashed_password" not in r for r in rows)


# ── Purge ────────────────────────────────────────────────

@pytest.fixture()
def db():
    """Like db_session, but SQLite enforces foreign keys, so a missed child row fails the delete."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    sa_event.listen(engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    yield session
    session.close()


def _user(db, name, email, role="attendee", **kw):
    u = User(username=name, email=email, hashed_password="x", role=role, **kw)
    db.add(u)
    db.commit()
    return u


def _event(db, organizer, days=5, seats=10):
    ev = Event(title=f"Event by {organizer.username}", description="d", location="CIC, Alger", price=0,
               available_tickets=seats, start_date=datetime.now() + timedelta(days=days), organizer_id=organizer.id)
    db.add(ev)
    db.commit()
    return ev


def test_purge_removes_a_fake_organizer_and_everything_attached(db, strict_emails):
    admin = _user(db, "boss", "boss@gmail.com", role="admin")
    real = _user(db, "yacine", "yacine@gmail.com")
    real_org = _user(db, "gdg", "gdg@esi.dz", role="organizer")
    fake = _user(db, "fake_org", "organizer@test.com", role="organizer")

    fake_event = _event(db, fake)
    real_event = _event(db, real_org, seats=9)
    # The fake account holds a seat at a real event, the real user one at the fake event
    t_fake = Ticket(user_id=fake.id, event_id=real_event.id, qr_code="q1", status="active")
    t_real = Ticket(user_id=real.id, event_id=fake_event.id, qr_code="q2", status="active")
    db.add_all([t_fake, t_real])
    db.commit()
    q = EventQuestion(event_id=fake_event.id, label="Why?", question_type="short_text")
    reg = Registration(user_id=real.id, event_id=fake_event.id, status="pending")
    db.add_all([q, reg])
    db.commit()
    db.add(FormAnswer(registration_id=reg.id, question_id=q.id, answer_value="because"))
    conv = Conversation(kind="event", user_id=real.id, event_id=fake_event.id, organizer_id=fake.id, status="open")
    db.add(conv)
    db.commit()
    db.add_all([
        Message(conversation_id=conv.id, sender_id=fake.id, body="hi"),
        Payment(user_id=fake.id, event_id=real_event.id, amount=1000, currency="DZD", payment_method="cib", status="pending"),
        Review(reviewer_id=real.id, event_id=fake_event.id, organizer_id=fake.id, rating=5),
        SavingEvent(user_id=real.id, event_id=fake_event.id),
        Notification(user_id=fake.id, type="x", title="t", message="m"),
        Notification(user_id=real.id, type="x", title="t", message="m", related_object_type="ticket",
                     related_object_id=str(t_real.id)),
    ])
    db.commit()

    review = {r["id"]: r for r in account_cleanup.review_accounts({"user_id": admin.id, "user_role": "admin"}, db)}
    assert admin.id not in review
    assert review[fake.id]["flagged"] and "placeholder" in review[fake.id]["reasons"][0]
    assert not review[real.id]["flagged"] and not review[real_org.id]["flagged"]

    fake_id, fake_event_id, real_event_id = fake.id, fake_event.id, real_event.id
    keep = {admin.id, real.id, real_org.id}
    result = account_cleanup.purge_users({"user_id": admin.id, "user_role": "admin"}, db, [fake_id])
    assert result == {"removed": [fake_id], "skipped": []}

    db.expire_all()
    assert db.get(User, fake_id) is None and db.get(Event, fake_event_id) is None
    for model in (Ticket, Registration, FormAnswer, EventQuestion, Conversation, Message, Payment, Review,
                  SavingEvent, Notification):
        assert db.query(model).count() == 0, model.__name__
    # The seat the fake account held at the real event is free again; real people stay
    assert db.get(Event, real_event_id).available_tickets == 10
    assert {u.id for u in db.query(User)} == keep


def test_purge_keeps_admins_the_caller_and_paid_accounts(db):
    admin = _user(db, "boss", "boss@gmail.com", role="admin")
    other_admin = _user(db, "boss2", "boss2@gmail.com", role="admin")
    buyer = _user(db, "buyer", "buyer@example.com")
    org = _user(db, "org", "org@example.com", role="organizer")
    ev = _event(db, org)
    db.add(Payment(user_id=buyer.id, event_id=ev.id, amount=1000, currency="DZD", payment_method="cib", status="paid"))
    db.commit()

    result = account_cleanup.purge_users({"user_id": admin.id, "user_role": "admin"}, db,
                                         [admin.id, other_admin.id, buyer.id, org.id, 999])
    assert result["removed"] == []
    reasons = {s["id"]: s["reason"] for s in result["skipped"]}
    assert reasons == {
        admin.id: "You can't remove your own account",
        other_admin.id: "Admins can't be removed",
        buyer.id: "Has paid payments, which must be kept",
        org.id: "Has paid payments, which must be kept",  # the payment was for their event
        999: "Account not found",
    }


def test_only_admins_can_review_or_purge(db):
    attendee = _user(db, "amina", "amina@gmail.com")
    for call in (lambda u: account_cleanup.review_accounts(u, db),
                 lambda u: account_cleanup.purge_users(u, db, [attendee.id])):
        with pytest.raises(HTTPException) as exc:
            call({"user_id": attendee.id, "user_role": "attendee"})
        assert exc.value.status_code == 403
