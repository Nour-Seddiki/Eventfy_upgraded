from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ReviewRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None
    event_id: Optional[int] = None
   
   


class ReviewResponse(BaseModel):
    id: int
    rating: int
    comment: Optional[str]
    reviewer_id: int
    event_id: Optional[int]
    organizer_id: Optional[int]
    is_verified_purchase: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UpdateReview(BaseModel):
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    comment: Optional[str] = None
