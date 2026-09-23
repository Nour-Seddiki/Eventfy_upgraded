from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timezone, timedelta
import re
import secrets
from sqlalchemy import func

from app.models.user import User
from starlette import status
from typing import Annotated
from app.schemas.user import CreateUser
from app.db.session import db_dependency
from app.config import settings
from app.utils.email_rules import email_problem, normalize_email


SECRET_KEY = settings.secret_key
ALGORITHM = settings.algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes
oauth2_bearer = OAuth2PasswordBearer(tokenUrl="/auth/token")

bcrypt_context = CryptContext(schemes=['bcrypt'], deprecated='auto')


def hashing_password(password):
    return bcrypt_context.hash(password)


def verifying_password(password, hashed_password):
    return bcrypt_context.verify(password, hashed_password)


def create_access_token(username: str, user_id: int, user_role: str, expired_delta: timedelta):
    encode = {'sub': username, 'user_id': user_id, 'user_role': user_role}
    expires = datetime.now(timezone.utc) + expired_delta
    encode.update({'exp': expires})
    return jwt.encode(encode, SECRET_KEY, algorithm=ALGORITHM)


def apply_bootstrap_admin(user_model, db):
    """Promote accounts listed in ADMIN_EMAILS (settings.admin_emails)."""
    if (user_model.email or "").lower() in settings.admin_emails and user_model.role != "admin":
        user_model.role = "admin"
        db.commit()
        db.refresh(user_model)
    return user_model


def Authentication_user(login_identifier: str, password: str, db):
    """Authenticate user by email OR username."""
    # Try email first (any capitalization), then username
    user = db.query(User).filter(
        func.lower(User.email) == normalize_email(login_identifier),
        User.is_deleted.is_(False)
    ).first()

    if not user:
        user = db.query(User).filter(
            User.username == login_identifier,
            User.is_deleted.is_(False)
        ).first()

    if not user:
        return False
    if not verifying_password(password, user.hashed_password):
        return False

    # Check if user is banned
    if getattr(user, 'is_banned', False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been banned. Contact support for assistance."
        )

    return apply_bootstrap_admin(user, db)


def _generate_unique_username(seed: str, db) -> str:
    base = re.sub(r"[^a-zA-Z0-9_.-]", "_", seed).strip("._-") or "google_user"
    base = base[:20]
    candidate = base
    counter = 1

    while db.query(User).filter(User.username == candidate).first() is not None:
        suffix = f"_{counter}"
        candidate = f"{base[: 20 - len(suffix)]}{suffix}"
        counter += 1

    return candidate


def authenticate_google_user(google_id_token: str, db):
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GOOGLE_CLIENT_ID is not configured",
        )

    try:
        from google.oauth2 import id_token as google_id_token_verifier
        from google.auth.transport import requests as google_requests
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="google-auth is not installed",
        )

    try:
        token_data = google_id_token_verifier.verify_oauth2_token(
            google_id_token,
            google_requests.Request(),
            settings.google_client_id,
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google ID token",
        )

    issuer = token_data.get("iss")
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token issuer",
        )

    email = token_data.get("email")
    email_verified = token_data.get("email_verified")
    if not email or not email_verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account email is not verified",
        )

    email = normalize_email(email)
    existing_user = find_user_by_email(db, email)
    if existing_user:
        if getattr(existing_user, 'is_banned', False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been banned. Contact support for assistance."
            )
        if existing_user.is_deleted:
            existing_user.is_deleted = False
            existing_user.deleted_at = None
        existing_user.is_verified = True
        db.commit()
        db.refresh(existing_user)
        return apply_bootstrap_admin(existing_user, db)

    username_seed = token_data.get("name") or email.split("@")[0]
    username = _generate_unique_username(username_seed, db)

    user = User(
        username=username,
        email=email,
        hashed_password=hashing_password(secrets.token_urlsafe(32)),
        role="attendee",
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return apply_bootstrap_admin(user, db)


async def get_current_user(token: Annotated[str, Depends(oauth2_bearer)], db: db_dependency):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get('sub')
        user_id: int = payload.get('user_id')
        if not username or not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='could not validate user')
        user = db.query(User).filter(User.id == user_id).first()
        if user is None or user.is_deleted:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='could not validate user')
        if getattr(user, 'is_banned', False):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Your account has been banned. Contact support for assistance.')
        return {
            'username': user.username,
            'user_id': user.id,
            'user_role': user.role,
            'is_restricted': getattr(user, 'is_restricted', False),
        }
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


def find_user_by_email(db, email: str):
    """Emails are unique regardless of capitalization."""
    return db.query(User).filter(func.lower(User.email) == normalize_email(email)).first()


def create_user(user: CreateUser, db):
    # Every account starts as an attendee; admins promote organizers
    # from the admin panel (PUT /admin/change_role/{user_id}).
    email = normalize_email(user.email)
    problem = email_problem(email)
    if problem:
        raise HTTPException(status_code=422, detail={"field": "email", "message": problem})
    if find_user_by_email(db, email) is not None:
        raise HTTPException(status_code=409, detail={
            "field": "email", "message": "An account with this email already exists. Sign in instead."})
    if db.query(User).filter(User.username == user.user_name).first() is not None:
        raise HTTPException(status_code=409, detail="Username already taken")

    new_user = User(
        username=user.user_name,
        email=email,
        hashed_password=hashing_password(user.password),
        role="attendee",
        is_verified=True,
        full_name=(user.full_name or "").strip() or None,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    apply_bootstrap_admin(new_user, db)
    return {"message": "Account created successfully", "user_id": new_user.id}


user_dependency = Annotated[dict, Depends(get_current_user)]
