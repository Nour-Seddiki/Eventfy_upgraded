from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime
from enum import Enum


class NotificationType(str, Enum):
    EVENT_REMINDER = "event_reminder"
    BOOKING_CONFIRMED = "booking_confirmed"
    BOOKING_CANCELLED = "booking_cancelled"
    REVIEW_POSTED = "review_posted"
    EVENT_UPDATED = "event_updated"
    EVENT_CANCELLED = "event_cancelled"
    REGISTRATION_RECEIVED = "registration_received"    # Sent to organizer
    REGISTRATION_APPROVED = "registration_approved"    # Sent to attendee
    REGISTRATION_REJECTED = "registration_rejected"    # Sent to attendee
    TICKET_CHECKED_IN = "ticket_checked_in"            # Sent to attendee on QR scan
    ORGANIZER_REQUEST = "organizer_request"            # Sent to admins (and the requester)
    ROLE_CHANGED = "role_changed"                      # Sent to a user an admin promoted/demoted


class CreateNotification(BaseModel):
    user_id: int
    type: NotificationType
    title: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=1000)
    related_object_id: Optional[str] = None
    related_object_type: Optional[str] = None


class UpdateNotification(BaseModel):
    read: bool


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    user_id: int
    type: str
    title: str
    message: str
    read: bool
    related_object_id: Optional[str]
    related_object_type: Optional[str]
    created_at: datetime
    updated_at: datetime


class NotificationListResponse(BaseModel):
    total: int
    unread_count: int
    notifications: list[NotificationResponse]
