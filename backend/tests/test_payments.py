import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import BackgroundTasks, HTTPException

from app.models.event import Event
from app.models.notification import Notification  # noqa: F401  (tables used by ticket fulfilment)
from app.models.payment import Payment
from app.models.registration import Registration  # noqa: F401
from app.models.ticket import Ticket
from app.models.user import User
from app.routes import tickets as ticket_routes
from app.schemas.payment import PaymentStatus
from app.services import payment_service
from app.services.payment_service import PaymentService

SECRET = "test_sk_secret"


class FakeChargily:
    """Stands in for chargily_pay.ChargilyClient: records checkouts, no network."""

    def __init__(self):
        self.checkouts = {}
        self.created = []

    def create_checkout(self, checkout):
        checkout_id = f"chk_{len(self.created) + 1}"
        self.created.append(checkout)
        self.checkouts[checkout_id] = {"id": checkout_id, "status": "pending"}
        return {"id": checkout_id, "checkout_url": f"https://pay.chargily.net/test/checkouts/{checkout_id}/pay"}

    def retrieve_checkout(self, checkout_id):
        return self.checkouts[checkout_id]

    def validate_signature(self, signature, payload):
        expected = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(signature, expected)


@pytest.fixture()
def chargily(monkeypatch):
    fake = FakeChargily()
    monkeypatch.setattr(payment_service, "chargily_client", fake)
    monkeypatch.setattr(payment_service, "CHARGILY_AVAILABLE", True)
    return fake


def _sign(payload: str) -> str:
    return hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def _setup(db, price=1500.0, currency="DZD", requires_approval=False):
    organizer = User(username="org", email="org@example.com", hashed_password="x", role="organizer")
    buyer = User(username="buyer", email="buyer@example.com", hashed_password="x", role="attendee")
    db.add_all([organizer, buyer])
    db.commit()
    event = Event(
        title="Paid Event",
        description="",
        category="music",
        location="algiers",
        price=price,
        currency=currency,
        available_tickets=5,
        start_date=datetime.now(timezone.utc) + timedelta(days=3),
        organizer_id=organizer.id,
        requires_approval=requires_approval,
    )
    db.add(event)
    db.commit()
    db.refresh(buyer)
    db.refresh(event)
    return {"username": buyer.username, "user_id": buyer.id, "user_role": buyer.role}, event


def _paid_webhook(checkout_id: str) -> str:
    return json.dumps({
        "id": "evt_1",
        "entity": "event",
        "type": "checkout.paid",
        "data": {"id": checkout_id, "status": "paid", "payment_method": "edahabia"},
    })


def test_checkout_creates_pending_dzd_payment(db_session, chargily):
    buyer, event = _setup(db_session)

    result = PaymentService.create_checkout(buyer, db_session, event.id)

    payment = db_session.query(Payment).one()
    assert payment.status == PaymentStatus.pending
    assert payment.payment_intent_id == result["checkout_id"] == "chk_1"
    assert (payment.amount, payment.currency) == (1500, "dzd")
    sent = chargily.created[0]
    assert (sent.amount, sent.currency) == (1500, "dzd")
    assert sent.success_url.endswith(f"/?payment_id={payment.id}")
    assert sent.failure_url.endswith(f"/?payment_cancelled={event.id}")


def test_checkout_converts_other_currencies_to_dzd(db_session, chargily):
    buyer, event = _setup(db_session, price=10.0, currency="USD")

    PaymentService.create_checkout(buyer, db_session, event.id)

    assert chargily.created[0].amount == 2300  # 1 USD = 230 DZD, as in currencyUtils.js


def test_checkout_rejects_free_and_unapproved_events(db_session, chargily):
    buyer, event = _setup(db_session, requires_approval=True)
    with pytest.raises(HTTPException) as exc:
        PaymentService.create_checkout(buyer, db_session, event.id)
    assert exc.value.status_code == 403

    event.requires_approval, event.price = False, 0
    db_session.commit()
    with pytest.raises(HTTPException) as exc:
        PaymentService.create_checkout(buyer, db_session, event.id)
    assert exc.value.status_code == 400
    assert chargily.created == []


def test_webhook_rejects_bad_signature(db_session, chargily):
    buyer, event = _setup(db_session)
    checkout_id = PaymentService.create_checkout(buyer, db_session, event.id)["checkout_id"]

    with pytest.raises(HTTPException) as exc:
        PaymentService.handle_webhook(db_session, _paid_webhook(checkout_id), "forged", BackgroundTasks())
    assert exc.value.status_code == 403
    assert db_session.query(Ticket).count() == 0


def test_paid_webhook_issues_one_ticket_even_if_redelivered(db_session, chargily):
    buyer, event = _setup(db_session)
    checkout_id = PaymentService.create_checkout(buyer, db_session, event.id)["checkout_id"]
    payload = _paid_webhook(checkout_id)

    for _ in range(2):
        assert PaymentService.handle_webhook(db_session, payload, _sign(payload), BackgroundTasks()) == {"status": "ok"}

    payment = db_session.query(Payment).one()
    assert payment.status == PaymentStatus.paid
    assert payment.payment_method == "edahabia"
    ticket = db_session.query(Ticket).one()
    assert payment.ticket_id == ticket.id
    db_session.refresh(event)
    assert event.available_tickets == 4


def test_verify_fulfills_only_once_chargily_reports_paid(db_session, chargily):
    buyer, event = _setup(db_session)
    result = PaymentService.create_checkout(buyer, db_session, event.id)

    pending = PaymentService.verify_payment(buyer, db_session, result["payment_id"], BackgroundTasks())
    assert pending == {"status": "not_paid", "payment_status": "pending"}
    assert db_session.query(Ticket).count() == 0

    chargily.checkouts[result["checkout_id"]]["status"] = "paid"
    fulfilled = PaymentService.verify_payment(buyer, db_session, result["payment_id"], BackgroundTasks())
    assert fulfilled["status"] == "fulfilled" and fulfilled["ticket_id"]

    again = PaymentService.verify_payment(buyer, db_session, result["payment_id"], BackgroundTasks())
    assert again["status"] == "already_fulfilled"
    assert db_session.query(Ticket).count() == 1


def test_verify_only_for_payment_owner(db_session, chargily):
    buyer, event = _setup(db_session)
    result = PaymentService.create_checkout(buyer, db_session, event.id)
    chargily.checkouts[result["checkout_id"]]["status"] = "paid"

    other = {"username": "other", "user_id": 999, "user_role": "attendee"}
    with pytest.raises(HTTPException) as exc:
        PaymentService.verify_payment(other, db_session, result["payment_id"], BackgroundTasks())
    assert exc.value.status_code == 404


@pytest.mark.parametrize(
    "price, requires_approval, status_code",
    [(1500.0, False, 402), (0.0, True, 403)],
)
def test_direct_purchase_blocked_for_paid_and_approval_events(db_session, price, requires_approval, status_code):
    buyer, event = _setup(db_session, price=price, requires_approval=requires_approval)

    with pytest.raises(HTTPException) as exc:
        ticket_routes.purchase_ticket(buyer, db_session, BackgroundTasks(), event.id)
    assert exc.value.status_code == status_code
    assert db_session.query(Ticket).count() == 0


def test_direct_purchase_allowed_for_free_open_events(db_session):
    buyer, event = _setup(db_session, price=0.0)

    ticket_routes.purchase_ticket(buyer, db_session, BackgroundTasks(), event.id)
    assert db_session.query(Ticket).count() == 1


@pytest.mark.skipif(
    bool(payment_service.settings.chargily_secret),
    reason="CHARGILY_SECRET is configured in this environment",
)
def test_chargily_disabled_without_secret():
    # With an empty secret, this signature would be computable by anyone
    payload = _paid_webhook("chk_forged")
    forged_signature = hmac.new(b"", payload.encode(), hashlib.sha256).hexdigest()

    assert payment_service.CHARGILY_AVAILABLE is False
    with pytest.raises(HTTPException) as exc:
        PaymentService.handle_webhook(None, payload, forged_signature, BackgroundTasks())
    assert exc.value.status_code == 501
