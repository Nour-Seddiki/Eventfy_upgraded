from sqlalchemy import Column, Integer, String, Boolean, DateTime
from app.db.base import Base
from datetime import datetime, timezone


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True)
    email = Column(String, unique=True)
    hashed_password = Column(String)
    role = Column(String, default='attendee')
    is_verified = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    is_banned = Column(Boolean, default=False)       # Permanent ban — cannot log in
    is_restricted = Column(Boolean, default=False)   # Temporary restriction — read-only access
    ban_reason = Column(String, nullable=True)       # Reason for ban or restriction
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Extended profile fields
    full_name = Column(String, nullable=True)
    bio = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    location = Column(String, nullable=True)
    website = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    preferred_currency = Column(String, default="DZD")

    # Global Profile fields — used for "1-Click Autofill" on registration forms
    university = Column(String, nullable=True)
    major = Column(String, nullable=True)
    dietary_restrictions = Column(String, nullable=True)
    date_of_birth = Column(String, nullable=True)   # ISO date string, e.g. "2000-01-15"
    gender = Column(String, nullable=True)
