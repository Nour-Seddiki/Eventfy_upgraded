from fastapi import HTTPException
from starlette import status
from app.models.review import Review
from app.models.event import Event
from app.models.ticket import Ticket
from app.models.user import User
from app.schemas.review import ReviewRequest, UpdateReview
from app.schemas.ticket import TicketStatus
from app.services.notification_service import NotificationService
from app.schemas.notification import CreateNotification, NotificationType
import logging

logger = logging.getLogger(__name__)


class ReviewService:

    def create_review(self, user: dict, db, data: ReviewRequest):
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication failed"
            )

        # Restriction check
        if user.get('is_restricted'):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is restricted. You cannot post reviews."
            )

        if not data.event_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide an event_id to review."
            )

        # Fetch event and auto-fill organizer_id
        event = db.query(Event).filter(Event.id == data.event_id).first()
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found."
            )
        organizer_id = event.organizer_id

        # Verified purchase check
        ticket = db.query(Ticket).filter(
            Ticket.user_id == user.get("user_id"),
            Ticket.event_id == data.event_id,
            Ticket.status == TicketStatus.used
        ).first()
        if not ticket:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only review events you have attended."
            )

        # Prevent duplicate reviews
        existing = db.query(Review).filter(
            Review.reviewer_id == user.get("user_id"),
            Review.event_id == data.event_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You have already reviewed this event."
            )

        review = Review(
            rating=data.rating,
            comment=data.comment,
            reviewer_id=user.get("user_id"),
            event_id=data.event_id,
            organizer_id=organizer_id,
            is_verified_purchase=True
        )
        db.add(review)
        db.commit()
        db.refresh(review)

        # Notify the organizer about the new review
        try:
            reviewer_name = user.get('username', 'A user')
            stars = '⭐' * data.rating
            notif_data = CreateNotification(
                user_id=organizer_id,
                type=NotificationType.REVIEW_POSTED,
                title="New Review",
                message=f"{reviewer_name} left a {data.rating}-star review on '{event.title}' {stars}",
                related_object_id=str(review.id),
                related_object_type="review",
            )
            NotificationService.create_notification(db, notif_data)
        except Exception as exc:
            logger.warning("Failed to create review notification: %s", exc)

        return review

    def get_event_reviews(self, db, event_id: int):
        reviews = db.query(Review).filter(Review.event_id == event_id).all()
        if not reviews:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No reviews found for this event."
            )
        return reviews

    def get_organizer_reviews(self, db, organizer_id: int):
        reviews = db.query(Review).filter(Review.organizer_id == organizer_id).all()
        if not reviews:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No reviews found for this organizer."
            )
        return reviews

    def update_review(self, user: dict, db, review_id: int, data: UpdateReview):
        review = db.query(Review).filter(
            Review.id == review_id,
            Review.reviewer_id == user.get("user_id")
        ).first()
        if not review:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Review not found or you are not the author."
            )
        if data.rating is not None:
            review.rating = data.rating
        if data.comment is not None:
            review.comment = data.comment
        db.commit()
        db.refresh(review)
        return review

    def delete_review(self, user: dict, db, review_id: int):
        review = db.query(Review).filter(
            Review.id == review_id,
            Review.reviewer_id == user.get("user_id")
        ).first()
        if not review:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Review not found or you are not the author."
            )
        db.delete(review)
        db.commit()
        return {"detail": "Review deleted successfully."}
