from enum import Enum
from typing import Optional
from pydantic import BaseModel
from datetime import datetime


class PaymentStatus(str, Enum):
    pending = "pending"
    paid = "paid"
    failed = "failed"
    canceled = "canceled"
    expired = "expired"
    refunded = "refunded"


class PaymentMethodEnum(str, Enum):
    chargily = "chargily"
    edahabia = "edahabia"
    cib = "cib"


class CheckoutSessionResponse(BaseModel):
    checkout_url: str
    checkout_id: str
    payment_id: str


class PaymentResponse(BaseModel):
    id: str
    user_id: int
    event_id: int
    ticket_id: Optional[str] = None
    amount: float
    currency: str
    payment_method: str
    payment_intent_id: Optional[str] = None
    status: str
    created_at: datetime
