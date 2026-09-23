from fastapi import APIRouter,Path
from app.db.session import db_dependency 
from starlette import status 
from app.services.auth_service import user_dependency
from app.services.recommendation_service import Recommendation_Servies



router = APIRouter(prefix="/Recommendation" , tags=["Recommendation"])


@router.get("/recommendation",status_code=status.HTTP_200_OK)
def recommendation(user:user_dependency, db:db_dependency):
    return Recommendation_Servies().recommendation(user,db)



