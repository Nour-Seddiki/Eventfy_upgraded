from fastapi import APIRouter, Query
from starlette import status

from app.db.session import db_dependency
from app.schemas.notification import CreateNotification, NotificationResponse, NotificationListResponse
from app.services.auth_service import user_dependency
from app.services.notification_service import NotificationService


router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", status_code=status.HTTP_200_OK, response_model=NotificationListResponse)
def get_notifications(
    user: user_dependency,
    db: db_dependency,
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100)
):
    """Get all notifications for the authenticated user with pagination"""
    return NotificationService.get_user_notifications(user, db, skip, limit)


@router.get("/unread-count", status_code=status.HTTP_200_OK)
def get_unread_count(user: user_dependency, db: db_dependency):
    """Get count of unread notifications"""
    return NotificationService.get_unread_count(user, db)


@router.put("/mark-all-as-read", status_code=status.HTTP_200_OK)
def mark_all_notifications_as_read(user: user_dependency, db: db_dependency):
    """Mark all notifications as read"""
    return NotificationService.mark_all_as_read(user, db)


@router.get("/{notification_id}", status_code=status.HTTP_200_OK, response_model=NotificationResponse)
def get_notification(
    user: user_dependency,
    db: db_dependency,
    notification_id: int
):
    """Get a specific notification by ID"""
    return NotificationService.get_notification_by_id(user, db, notification_id)


@router.put("/{notification_id}/read", status_code=status.HTTP_200_OK, response_model=NotificationResponse)
def mark_notification_as_read(
    user: user_dependency,
    db: db_dependency,
    notification_id: int
):
    """Mark a specific notification as read"""
    return NotificationService.mark_as_read(user, db, notification_id)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(
    user: user_dependency,
    db: db_dependency,
    notification_id: int
):
    """Delete a notification"""
    NotificationService.delete_notification(user, db, notification_id)
