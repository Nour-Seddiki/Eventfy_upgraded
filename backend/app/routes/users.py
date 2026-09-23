from fastapi import APIRouter, UploadFile, File, HTTPException
from pathlib import Path as SysPath
from starlette import status

from app.db.session import db_dependency
from app.schemas.user import UpdateUser, UpdateProfile
from app.services.auth_service import user_dependency
from app.services.user_service import userServices
from app.utils.supabase_storage import upload_file as supabase_upload


router = APIRouter(prefix="/users", tags=["users"])

_svc = userServices()


@router.get("/my_profile", status_code=status.HTTP_200_OK)
def get_my_profile(user: user_dependency, db: db_dependency):
    return _svc.get_my_profile(user, db)


@router.put("/update_me", status_code=status.HTTP_202_ACCEPTED)
def update_me(user: user_dependency, db: db_dependency, data: UpdateUser):
    return _svc.update_user(user, db, data)


@router.put("/update_profile", status_code=status.HTTP_200_OK)
def update_profile(user: user_dependency, db: db_dependency, data: UpdateProfile):
    """Update extended profile fields (full_name, bio, phone, location, website)."""
    return _svc.update_profile(user, db, data)


@router.post("/avatar", status_code=status.HTTP_200_OK)
async def upload_avatar(
    user: user_dependency,
    db: db_dependency,
    image: UploadFile = File(...),
):
    """Upload or replace the user's profile avatar."""
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    file_suffix = SysPath(image.filename or "").suffix.lower()
    if file_suffix not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    file_bytes = await image.read()

    try:
        public_url = supabase_upload("avatars", file_bytes, image.filename or "avatar.jpg")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError:
        raise HTTPException(status_code=502, detail="The image could not be uploaded. Please try again.")

    return _svc.update_avatar(user, db, public_url)


@router.post("/request_organizer", status_code=status.HTTP_202_ACCEPTED)
def request_organizer(user: user_dependency, db: db_dependency):
    """Attendee asks the admins for organizer access."""
    return _svc.request_organizer_access(user, db)


@router.get("/my_activity", status_code=status.HTTP_200_OK)
def get_my_activity(user: user_dependency, db: db_dependency):
    return _svc.get_my_activity(user, db)


@router.delete("/delete_me", status_code=status.HTTP_202_ACCEPTED)
def delete_my_account(user: user_dependency, db: db_dependency):
    return _svc.delete_my_account(user, db)

