from datetime import datetime, timedelta, timezone
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.utils.currency import MIN_ONLINE_PRICE_DZD, RATES_TO_DZD, to_dzd

# Event times are stored as naive local Algeria time (UTC+1, no DST), which
# is how every client displays them.
ALGERIA_TZ = timezone(timedelta(hours=1))


def now_local() -> datetime:
    return datetime.now(ALGERIA_TZ).replace(tzinfo=None)


def check_event_rules(start, end, deadline, price, currency, *, new: bool) -> None:
    """Cross-field rules shared by create (schema) and update (service).
    Raises ValueError with a message meant for the organizer."""
    if new and start is not None and start < now_local():
        raise ValueError("The start date is in the past")
    if start is not None and end is not None and end <= start:
        raise ValueError("The end date must be after the start date")
    if start is not None and deadline is not None and deadline > start:
        raise ValueError("The registration deadline must be before the event starts")
    if price and to_dzd(price, currency) < MIN_ONLINE_PRICE_DZD:
        raise ValueError(
            f"Paid tickets must cost at least {MIN_ONLINE_PRICE_DZD} DZD (the Chargily minimum). "
            "Make the event free or raise the price."
        )


class _EventFields(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    @field_validator("start_date", "end_date", "registration_deadline", mode="after", check_fields=False)
    @classmethod
    def _local_time(cls, v: Optional[datetime]) -> Optional[datetime]:
        # Clients that send UTC/offset times get them converted to local time
        if v is not None and v.tzinfo is not None:
            return v.astimezone(ALGERIA_TZ).replace(tzinfo=None)
        return v

    @field_validator("currency", mode="after", check_fields=False)
    @classmethod
    def _known_currency(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.upper()
        if v not in RATES_TO_DZD:
            raise ValueError(f"Currency must be one of {', '.join(RATES_TO_DZD)}")
        return v


class eventRequest(_EventFields):
    title: str = Field(min_length=3, max_length=50)
    description: str = Field(min_length=1)
    location: str = Field(min_length=1)
    price: float = Field(ge=0)
    currency: str = "DZD"
    available_tickets: int = Field(ge=1, le=100_000)
    start_date: datetime
    end_date: Optional[datetime] = None
    registration_deadline: Optional[datetime] = None
    image: Optional[str] = None
    requires_approval: bool = False

    @model_validator(mode="after")
    def _rules(self):
        check_event_rules(self.start_date, self.end_date, self.registration_deadline,
                          self.price, self.currency, new=True)
        return self


class eventUpdate(_EventFields):
    title: Optional[str] = Field(default=None, min_length=3, max_length=50)
    description: Optional[str] = Field(default=None, min_length=1)
    location: Optional[str] = Field(default=None, min_length=1)
    price: Optional[float] = Field(default=None, ge=0)
    currency: Optional[str] = None
    available_tickets: Optional[int] = Field(default=None, ge=0, le=100_000)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    registration_deadline: Optional[datetime] = None
    image: Optional[str] = None
    requires_approval: Optional[bool] = None
