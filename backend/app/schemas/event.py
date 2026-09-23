from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from typing import Annotated, Literal
from datetime import datetime

class eventRequest(BaseModel):
    title: str = Field(min_length=3, max_length=50)
    description: str
    location: str
    price: float
    currency: str = "DZD"
    available_tickets: int
    start_date: datetime
    end_date: Optional[datetime] = None
    registration_deadline: Optional[datetime] = None
    image: Optional[str] = None
    requires_approval: bool = False

class eventUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=50)
    description: Optional[str] = None
    location: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    available_tickets: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    registration_deadline: Optional[datetime] = None
    image: Optional[str] = None
    requires_approval: Optional[bool] = None
