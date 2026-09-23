from datetime import timedelta
from typing import Annotated
from fastapi import APIRouter, Depends,HTTPException
from fastapi.security import OAuth2PasswordRequestForm 
from app.db.session import db_dependency 
from starlette import status 
from app.services.auth_service import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    Authentication_user,
    authenticate_google_user,
    create_access_token,
    create_user,
    user_dependency,
)
from app.schemas.user import CreateUser, GoogleTokenRequest, Token, update_password
from app.services.user_service import userServices
from app.config import settings



router = APIRouter( prefix='/auth', tags=['auth'])


@router.post("/sign_up" , status_code=status.HTTP_201_CREATED)
def sign_up(user:CreateUser,db:db_dependency):
    return create_user(user,db)


@router.post("/token",response_model=Token)
def login_access(form_data:Annotated[OAuth2PasswordRequestForm,Depends()],db:db_dependency):
    user = Authentication_user(form_data.username,form_data.password,db)
    if not user:
        raise HTTPException(status_code=401 , detail='Authentication failed')
    token = create_access_token(
        user.username,
        user.id,
        user.role,
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {'access_token': token , 'token_type':'bearer'}


@router.get("/google/config")
def google_config():
    """Public: the OAuth client id the frontend's Google button must use.
    Served from here so frontend and backend can never disagree on it."""
    return {"client_id": settings.google_client_id}


@router.post("/google", response_model=Token)
def login_with_google(payload: GoogleTokenRequest, db: db_dependency):
    user = authenticate_google_user(payload.id_token, db)
    token = create_access_token(
        user.username,
        user.id,
        user.role,
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": token, "token_type": "bearer"}


@router.post("/reset_password" , status_code=status.HTTP_202_ACCEPTED)
def reset_password(user:user_dependency , db: db_dependency,data:update_password):
    return userServices.change_password(user, db , data)


