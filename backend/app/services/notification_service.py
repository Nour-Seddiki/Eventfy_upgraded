from fastapi import HTTPException
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import CreateNotification, UpdateNotification


class NotificationService:
    @staticmethod
    def _get_active_user(user, db) -> User:
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")
        
        user_model = (
            db.query(User)
            .filter(User.id == user.get("user_id"), User.is_deleted.is_(False))
            .first()
        )
        if user_model is None:
            raise HTTPException(status_code=404, detail="User not found")
        return user_model

    @staticmethod
    def create_notification(db, notification_data: CreateNotification) -> Notification:
        """Create a new notification"""
        db_notification = Notification(
            user_id=notification_data.user_id,
            type=notification_data.type,
            title=notification_data.title,
            message=notification_data.message,
            related_object_id=notification_data.related_object_id,
            related_object_type=notification_data.related_object_type,
        )
        db.add(db_notification)
        db.commit()
        db.refresh(db_notification)
        return db_notification

    @staticmethod
    def get_user_notifications(user, db, skip: int = 0, limit: int = 10):
        """Get all notifications for the authenticated user"""
        user_model = NotificationService._get_active_user(user, db)
        
        total = db.query(Notification).filter(
            Notification.user_id == user_model.id
        ).count()
        
        unread_count = db.query(Notification).filter(
            Notification.user_id == user_model.id,
            Notification.read.is_(False)
        ).count()
        
        notifications = (
            db.query(Notification)
            .filter(Notification.user_id == user_model.id)
            .order_by(Notification.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
        
        return {
            "total": total,
            "unread_count": unread_count,
            "notifications": notifications
        }

    @staticmethod
    def get_notification_by_id(user, db, notification_id: int) -> Notification:
        """Get a specific notification"""
        user_model = NotificationService._get_active_user(user, db)
        
        notification = (
            db.query(Notification)
            .filter(
                Notification.id == notification_id,
                Notification.user_id == user_model.id
            )
            .first()
        )
        
        if notification is None:
            raise HTTPException(status_code=404, detail="Notification not found")
        
        return notification

    @staticmethod
    def mark_as_read(user, db, notification_id: int) -> Notification:
        """Mark a notification as read"""
        notification = NotificationService.get_notification_by_id(user, db, notification_id)
        
        notification.read = True
        db.add(notification)
        db.commit()
        db.refresh(notification)
        
        return notification

    @staticmethod
    def mark_all_as_read(user, db):
        """Mark all notifications as read for the user"""
        user_model = NotificationService._get_active_user(user, db)
        
        db.query(Notification).filter(
            Notification.user_id == user_model.id,
            Notification.read.is_(False)
        ).update({"read": True})
        
        db.commit()
        
        return {"message": "All notifications marked as read"}

    @staticmethod
    def delete_notification(user, db, notification_id: int):
        """Delete a notification"""
        notification = NotificationService.get_notification_by_id(user, db, notification_id)
        
        db.delete(notification)
        db.commit()
        
        return {"message": "Notification deleted successfully"}

    @staticmethod
    def get_unread_count(user, db) -> int:
        """Get count of unread notifications"""
        user_model = NotificationService._get_active_user(user, db)
        
        unread_count = (
            db.query(Notification)
            .filter(
                Notification.user_id == user_model.id,
                Notification.read.is_(False)
            )
            .count()
        )
        
        return {"unread_count": unread_count}
