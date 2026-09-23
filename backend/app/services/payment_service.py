import json
import logging

from fastapi import HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.models.payment import Payment
from app.models.event import Event
from app.models.user import User
from app.schemas.payment import PaymentStatus
from app.services.ticket_service import TickectService
from app.config import settings

logger = logging.getLogger(__name__)

# ── Chargily Pay setup ────────────────────────────────
# The secret key authenticates API calls and signs webhooks. An empty
# secret would make webhook signatures trivially forgeable, so without
# one every payment endpoint returns 501.
try:
    from chargily_pay import ChargilyClient
    from chargily_pay.entity import Checkout

    if not settings.chargily_secret:
        raise RuntimeError("CHARGILY_SECRET not configured")

    chargily_client = ChargilyClient(
        key=settings.chargily_key or "",
        secret=settings.chargily_secret,
        url=settings.chargily_url,
    )
    CHARGILY_AVAILABLE = True
except Exception as exc:
    logger.warning("Chargily not configured — payment endpoints will return 501 (%s)", exc)
    chargily_client = None
    CHARGILY_AVAILABLE = False

# Chargily only charges in DZD. Events priced in another currency are
# converted with the same fixed rates the frontend displays
# (keep in sync with frontend/currencyUtils.js).
RATES_TO_DZD = {"DZD": 1, "USD": 230, "EUR": 280, "GBP": 300}

# Chargily rejects checkouts below this amount
MIN_CHARGILY_AMOUNT_DZD = 50


def _payment_to_dict(p: Payment) -> dict:
    return {
        "id": str(p.id),
        "user_id": p.user_id,
        "event_id": p.event_id,
        "ticket_id": str(p.ticket_id) if p.ticket_id else None,
        "amount": p.amount,
        "currency": p.currency,
        "payment_method": p.payment_method,
        "payment_intent_id": p.payment_intent_id,
        "status": p.status,
        "created_at": p.created_at,
    }


def _price_in_dzd(event: Event) -> int:
    currency = (event.currency or "DZD").upper()
    rate = RATES_TO_DZD.get(currency)
    if rate is None:
        raise HTTPException(status_code=400, detail=f"Unsupported event currency: {currency}")
    return int(round(event.price * rate))


def _frontend_url() -> str:
    # FRONTEND_URL may be a comma-separated list (see CORS setup in main.py)
    return settings.frontend_url.split(",")[0].strip().rstrip("/")


def _require_chargily():
    if not CHARGILY_AVAILABLE:
        raise HTTPException(status_code=501, detail="Chargily is not configured. Add CHARGILY_SECRET to .env")


class PaymentService:

    # ─────────────────────────────────────────────
    #  CHARGILY CHECKOUT
    # ─────────────────────────────────────────────
    @staticmethod
    def create_checkout(user: dict, db: Session, event_id: int, payment_method: str | None = None) -> dict:
        """Create a Chargily checkout for a paid event and a pending Payment record.

        payment_method ("edahabia" | "cib") preselects the card type on
        Chargily's page; without it the buyer picks there."""
        _require_chargily()

        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        user_model = db.query(User).filter(User.id == user.get("user_id")).first()
        if not user_model:
            raise HTTPException(status_code=401, detail="Authentication failed")

        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")

        if event.available_tickets <= 0:
            raise HTTPException(status_code=400, detail="Sold out")

        if not event.price or event.price <= 0:
            raise HTTPException(status_code=400, detail="This is a free event. Use /ticket/purchase_ticket instead")

        # If event requires approval, user must have a payment_required registration
        if event.requires_approval:
            from app.models.registration import Registration
            registration = db.query(Registration).filter(
                Registration.event_id == event.id,
                Registration.user_id == user_model.id,
                Registration.status == "payment_required"
            ).first()
            if not registration:
                raise HTTPException(status_code=403, detail="You must be approved by the organizer before paying.")

        amount_dzd = _price_in_dzd(event)
        if amount_dzd < MIN_CHARGILY_AMOUNT_DZD:
            raise HTTPException(
                status_code=400,
                detail=f"Online payment requires a price of at least {MIN_CHARGILY_AMOUNT_DZD} DZD",
            )

        # Create the payment first so its id can go in the success URL:
        # Chargily redirects there without appending the checkout id.
        # The app at the frontend root picks up ?payment_id= and verifies it.
        payment = Payment(
            user_id=user_model.id,
            event_id=event.id,
            amount=amount_dzd,
            currency="dzd",
            payment_method=payment_method or "chargily",
            status=PaymentStatus.pending,
        )
        db.add(payment)
        db.commit()
        db.refresh(payment)

        frontend = _frontend_url()
        try:
            checkout = Checkout(
                amount=amount_dzd,
                currency="dzd",
                success_url=f"{frontend}/?payment_id={payment.id}",
                failure_url=f"{frontend}/?payment_cancelled={event.id}",
                payment_method=payment_method,
                webhook_endpoint=(
                    f"{settings.backend_url.rstrip('/')}/payment/webhook" if settings.backend_url else None
                ),
                description=f"Ticket: {event.title}",
                locale="en",
                metadata=[{
                    "payment_id": str(payment.id),
                    "user_id": str(user_model.id),
                    "event_id": str(event.id),
                }],
            )
            response = chargily_client.create_checkout(checkout)
        except Exception as e:
            logger.error(f"Chargily checkout creation failed: {e}")
            payment.status = PaymentStatus.failed
            db.commit()
            raise HTTPException(status_code=502, detail="Could not create the payment checkout. Please try again.")

        payment.payment_intent_id = response["id"]
        db.commit()
        db.refresh(payment)

        return {
            "checkout_url": response["checkout_url"],
            "checkout_id": response["id"],
            "payment_id": str(payment.id),
        }

    # ─────────────────────────────────────────────
    #  FULFILMENT (shared by webhook and verify)
    # ─────────────────────────────────────────────
    @staticmethod
    def _fulfill(db: Session, payment: Payment, background_tasks: BackgroundTasks) -> None:
        """Mark a payment paid and issue its ticket. Idempotent: webhooks can be
        delivered more than once, and the success page verifies as well."""
        if payment.status == PaymentStatus.paid and payment.ticket_id:
            return

        payment.status = PaymentStatus.paid

        user_dict = {"user_id": payment.user_id}
        try:
            ticket_result = TickectService().purchase_ticket(
                user_dict, db, payment.event_id, background_tasks
            )
            payment.ticket_id = ticket_result["id"]

            # If there's an associated registration, mark it as confirmed
            from app.models.registration import Registration
            registration = db.query(Registration).filter(
                Registration.event_id == payment.event_id,
                Registration.user_id == payment.user_id,
                Registration.status == "payment_required"
            ).first()
            if registration:
                registration.status = "confirmed"

        except HTTPException as e:
            if e.status_code == 409:
                # Ticket already exists (duplicate purchase guard)
                logger.info(f"Ticket already exists for user {payment.user_id}, event {payment.event_id}")
            else:
                logger.error(f"Ticket creation failed after payment {payment.id}: {e.detail}")
                # Payment succeeded but ticket failed — mark for manual resolution
                payment.status = "paid_ticket_error"

        db.commit()
        db.refresh(payment)
        logger.info(f"Payment {payment.id} fulfilled for event {payment.event_id}")

    # ─────────────────────────────────────────────
    #  CHARGILY WEBHOOK
    # ─────────────────────────────────────────────
    @staticmethod
    def handle_webhook(db: Session, payload: str, signature: str, background_tasks: BackgroundTasks) -> dict:
        """Verify and process a Chargily webhook (checkout.paid / failed / canceled / expired)."""
        _require_chargily()

        if not chargily_client.validate_signature(signature, payload):
            raise HTTPException(status_code=403, detail="Invalid signature")

        event = json.loads(payload)
        event_type = event.get("type", "")
        checkout_data = event.get("data", {})
        checkout_id = checkout_data.get("id")

        payment = db.query(Payment).filter(
            Payment.payment_intent_id == checkout_id
        ).first()
        if not payment:
            # 2xx so Chargily doesn't keep retrying a checkout we don't know
            logger.warning(f"Payment not found for Chargily checkout {checkout_id}")
            return {"status": "ignored"}

        if event_type == "checkout.paid":
            if checkout_data.get("payment_method"):
                payment.payment_method = checkout_data["payment_method"]
            PaymentService._fulfill(db, payment, background_tasks)
        elif payment.status == PaymentStatus.pending:
            new_status = {
                "checkout.failed": PaymentStatus.failed,
                "checkout.canceled": PaymentStatus.canceled,
                "checkout.expired": PaymentStatus.expired,
            }.get(event_type)
            if new_status:
                payment.status = new_status
                db.commit()

        return {"status": "ok"}

    # ─────────────────────────────────────────────
    #  VERIFY (success page fallback for when the webhook can't reach us, e.g. localhost)
    # ─────────────────────────────────────────────
    @staticmethod
    def verify_payment(user: dict, db: Session, payment_id: str, background_tasks: BackgroundTasks) -> dict:
        """Ask Chargily for the checkout's status and fulfill the order if it is paid."""
        _require_chargily()

        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        payment = db.query(Payment).filter(
            Payment.id == payment_id,
            Payment.user_id == user.get("user_id"),
        ).first()
        if not payment or not payment.payment_intent_id:
            raise HTTPException(status_code=404, detail="Payment not found")

        if payment.status == PaymentStatus.paid and payment.ticket_id:
            return {
                "status": "already_fulfilled",
                "payment_id": str(payment.id),
                "ticket_id": str(payment.ticket_id),
                "event_id": payment.event_id,
            }

        try:
            checkout = chargily_client.retrieve_checkout(payment.payment_intent_id)
        except Exception as e:
            logger.error(f"Chargily checkout retrieval failed: {e}")
            raise HTTPException(status_code=502, detail="Could not verify payment with Chargily")

        if checkout.get("status") != "paid":
            return {
                "status": "not_paid",
                "payment_status": checkout.get("status"),
            }

        if checkout.get("payment_method"):
            payment.payment_method = checkout["payment_method"]
        PaymentService._fulfill(db, payment, background_tasks)

        return {
            "status": "fulfilled",
            "payment_id": str(payment.id),
            "ticket_id": str(payment.ticket_id) if payment.ticket_id else None,
            "event_id": payment.event_id,
        }

    # ─────────────────────────────────────────────
    #  SHARED METHODS
    # ─────────────────────────────────────────────
    @staticmethod
    def get_user_payments(user: dict, db: Session) -> list[dict]:
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")
        payments = db.query(Payment).filter(
            Payment.user_id == user.get("user_id")
        ).all()
        return [_payment_to_dict(p) for p in payments]
