from typing import Optional
from enum import Enum

from pydantic import BaseModel, Field


class TicketStatus(str, Enum):
    active = "active"
    cancelled = "cancelled"
    used = "used"


class TicketQRInput(BaseModel):
    qr_input: Optional[str] = Field(default=None, min_length=1)
    qr_code: Optional[str] = Field(default=None, min_length=1)


