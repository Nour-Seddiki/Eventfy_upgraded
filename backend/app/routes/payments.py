from typing import Literal

from fastapi import APIRouter, Path, Request, Header, Query
from starlette import status
from app.db.session import db_dependency
from app.services.auth_service import user_dependency
from app.services.payment_service import PaymentService

router = APIRouter(prefix="/payment", tags=["payment"])


# ── Chargily Checkout ────────────────────────────────
@router.post("/checkout/{event_id}", status_code=status.HTTP_201_CREATED)
def create_checkout(
    user: user_dependency,
    db: db_dependency,
    event_id: int = Path(gt=0),
    payment_method: Literal["edahabia", "cib"] | None = Query(None),
):
    """Create a Chargily checkout (EDAHABIA / CIB) for a paid event."""
    return PaymentService.create_checkout(user, db, event_id, payment_method)


# ── Chargily Webhook ─────────────────────────────────
@router.post("/webhook", status_code=status.HTTP_200_OK)
async def chargily_webhook(
    request: Request,
    db: db_dependency,
    signature: str = Header(alias="signature"),
):
    """Chargily calls this endpoint after payment events."""
    payload = (await request.body()).decode("utf-8")
    return PaymentService.handle_webhook(db, payload, signature)


# ── Verify Payment (frontend success page calls this) ──
@router.post("/verify/{payment_id}", status_code=status.HTTP_200_OK)
def verify_payment(
    user: user_dependency,
    db: db_dependency,
    payment_id: str = Path(),
):
    """Check the checkout with Chargily and fulfill the order (ticket + notification)."""
    return PaymentService.verify_payment(user, db, payment_id)


# ── My Payments ──────────────────────────────────────
@router.get("/my_payments", status_code=status.HTTP_200_OK)
def get_my_payments(user: user_dependency, db: db_dependency):
    return PaymentService.get_user_payments(user, db)
