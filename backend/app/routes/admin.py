from fastapi import APIRouter, Path, Body
from starlette import status

from app.db.session import db_dependency
from app.services.admin_services import Admin
from app.services.auth_service import user_dependency


router = APIRouter(prefix="/admin", tags=["admin"])


# ── Dashboard ────────────────────────────────
@router.get("/dashboard", status_code=status.HTTP_200_OK)
def dashboard(user: user_dependency, db: db_dependency):
    return Admin().DashBoard(user, db)


# ── Analytics (time-series for charts) ───────
@router.get("/analytics", status_code=status.HTTP_200_OK)
def analytics(user: user_dependency, db: db_dependency):
    return Admin().get_analytics(user, db)


# ── Users ────────────────────────────────────
@router.get("/view_all_users", status_code=status.HTTP_200_OK)
def view_all_users(user: user_dependency, db: db_dependency):
    return Admin().view_all_users(user, db)


@router.get("/user_details/{user_id}", status_code=status.HTTP_200_OK)
def user_details(user: user_dependency, db: db_dependency, user_id: int = Path(gt=0)):
    return Admin().get_user_details(user, db, user_id)


@router.put("/deactivate_user/{user_id}", status_code=status.HTTP_202_ACCEPTED)
def deactivate_user(user: user_dependency, db: db_dependency, user_id: int = Path(gt=0)):
    return Admin().deactivate_user(user, db, user_id)


@router.put("/ban_user/{user_id}", status_code=status.HTTP_202_ACCEPTED)
def ban_user(user: user_dependency, db: db_dependency, user_id: int = Path(gt=0)):
    return Admin().ban_user(user, db, user_id)


@router.delete("/delete_user/{user_id}", status_code=status.HTTP_202_ACCEPTED)
def delete_user(user: user_dependency, db: db_dependency, user_id: int = Path(gt=0)):
    return Admin().delete_user(user, db, user_id)


@router.put("/reactive_user/{user_id}", status_code=status.HTTP_202_ACCEPTED)
def reactive_user(user: user_dependency, db: db_dependency, user_id: int = Path(gt=0)):
    return Admin().reactive_user(user, db, user_id)


@router.put("/restrict_user/{user_id}", status_code=status.HTTP_202_ACCEPTED)
def restrict_user(user: user_dependency, db: db_dependency, user_id: int = Path(gt=0)):
    return Admin().restrict_user(user, db, user_id)


@router.put("/unrestrict_user/{user_id}", status_code=status.HTTP_202_ACCEPTED)
def unrestrict_user(user: user_dependency, db: db_dependency, user_id: int = Path(gt=0)):
    return Admin().unrestrict_user(user, db, user_id)


@router.put("/change_role/{user_id}", status_code=status.HTTP_202_ACCEPTED)
def change_role(
    user: user_dependency,
    db: db_dependency,
    user_id: int = Path(gt=0),
    body: dict = Body(...),
):
    return Admin().change_user_role(user, db, user_id, body.get("role", ""))


# ── Events ───────────────────────────────────
@router.get("/view_all_events", status_code=status.HTTP_200_OK)
def view_all_events(user: user_dependency, db: db_dependency):
    return Admin().view_all_events(user, db)


@router.delete("/delete_event/{event_id}", status_code=status.HTTP_202_ACCEPTED)
def delete_event(user: user_dependency, db: db_dependency, event_id: int = Path(gt=0)):
    return Admin().delete_event(user, db, event_id)


# ── Payments ─────────────────────────────────
@router.get("/view_all_payments", status_code=status.HTTP_200_OK)
def view_all_payments(user: user_dependency, db: db_dependency):
    return Admin().view_all_payments(user, db)


# ── Reviews ──────────────────────────────────
@router.get("/view_all_reviews", status_code=status.HTTP_200_OK)
def view_all_reviews(user: user_dependency, db: db_dependency):
    return Admin().view_all_reviews(user, db)


@router.delete("/delete_review/{review_id}", status_code=status.HTTP_202_ACCEPTED)
def delete_review(user: user_dependency, db: db_dependency, review_id: int = Path(gt=0)):
    return Admin().delete_review(user, db, review_id)
