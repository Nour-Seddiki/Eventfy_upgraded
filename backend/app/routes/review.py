from fastapi import APIRouter, Path
from starlette import status
from app.db.session import db_dependency
from app.services.auth_service import user_dependency
from app.services.review_sevice import ReviewService
from app.schemas.review import ReviewRequest, UpdateReview

router = APIRouter(prefix="/review", tags=["review"])


@router.post("/create_review", status_code=status.HTTP_201_CREATED)
def create_review(user: user_dependency, db: db_dependency, data: ReviewRequest):
    return ReviewService().create_review(user, db, data)


@router.get("/event_reviews/{event_id}", status_code=status.HTTP_200_OK)
def get_event_reviews(user: user_dependency, db: db_dependency, event_id: int = Path(gt=0)):
    return ReviewService().get_event_reviews(db, event_id)


@router.get("/organizer_reviews/{organizer_id}", status_code=status.HTTP_200_OK)
def get_organizer_reviews(user: user_dependency, db: db_dependency, organizer_id: int = Path(gt=0)):
    return ReviewService().get_organizer_reviews(db, organizer_id)


@router.put("/update_review/{review_id}", status_code=status.HTTP_202_ACCEPTED)
def update_review(user: user_dependency, db: db_dependency, data: UpdateReview, review_id: int = Path(gt=0)):
    return ReviewService().update_review(user, db, review_id, data)


@router.delete("/delete_review/{review_id}", status_code=status.HTTP_202_ACCEPTED)
def delete_review(user: user_dependency, db: db_dependency, review_id: int = Path(gt=0)):
    return ReviewService().delete_review(user, db, review_id)
