from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional
from typing import Annotated , Literal
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    ORGANIZER = "organizer"
    ATTENDEE = "attendee"


class CreateUser(BaseModel):
    user_name : str = Field(min_length=1 , max_length=20)
    email : EmailStr = Field(min_length=1 , max_length=60)
    password : str
    full_name : Optional[str] = Field(default=None, max_length=80)

    @validator("password")
    def password_max_72_bytes(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("password must be 72 bytes or fewer")
        return value
    
class UpdateUser(BaseModel):
    user_name : str = Field(min_length=1 , max_length=20)
    email : EmailStr = Field(min_length=1 , max_length=60)

class UserResponce(BaseModel):
    id :int
    user_name : str 
    email : EmailStr 
    role : UserRole
    is_verified : bool

class UserUpdate(BaseModel):
    username: Optional[str]
    password: Optional[str]
    role: Optional[UserRole]

class UpdateProfile(BaseModel):
    """Schema for the profile edit modal — all fields optional for partial updates."""
    full_name: Optional[str] = None
    bio: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    preferred_currency: Optional[str] = None

    # Global Profile fields — used for "1-Click Autofill" on registration forms
    university: Optional[str] = None
    major: Optional[str] = None
    dietary_restrictions: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None

class Token(BaseModel):
    access_token : str
    token_type : str

class GoogleTokenRequest(BaseModel):
    id_token: str = Field(min_length=1)

class update_password(BaseModel):
    current_password : str 
    new_password : str

    @validator("new_password")
    def new_password_max_72_bytes(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("password must be 72 bytes or fewer")
        return value
