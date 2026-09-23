from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class SavingEventCreate(BaseModel):
    event_id: int


class SavingEventUpdate(BaseModel):
    is_deleted: Optional[bool] = None


class SavingEventResponse(BaseModel):
    id: int
    user_id: int
    event_id: int
    is_deleted: bool
    created_at: datetime
    deleted_at: Optional[datetime] = None

    class Config:
        from_attributes = True
