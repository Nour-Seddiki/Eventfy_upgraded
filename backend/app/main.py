import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.db.session import engine
from app.db.base import Base
from app.routes import (
    auth, events, users, tickets, payments,
    notifications, review, saving_events, admin, recommendations,
    registrations, chat,
)

# Import ALL models so Base.metadata knows every table
from app.models import (  # noqa: F401
    user, event, ticket, payment,
    notification, review as review_model,
    saving_event, recommendation,
    event_question, registration, form_answer,
    chat as chat_model,
)

logger = logging.getLogger("eventfy")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables on startup — runs once when the server boots."""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables synced")
    except Exception as exc:
        logger.error("Could not create tables: %s", exc)
    yield


app = FastAPI(
    title="Eventfy API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — local origins + production frontend URL from env
_local_origins = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    # Production Netlify frontend
    "https://eventfy-pro.netlify.app",
]
# FRONTEND_URL env can be a single URL or comma-separated list
_frontend_url = os.getenv("FRONTEND_URL", "")
for _url in _frontend_url.split(","):
    _url = _url.strip()
    if _url and _url not in _local_origins:
        _local_origins.append(_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_local_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(events.router)
app.include_router(events.public_router)
app.include_router(tickets.router)
app.include_router(payments.router)
app.include_router(notifications.router)
app.include_router(review.router)
app.include_router(saving_events.router)
app.include_router(admin.router)
app.include_router(recommendations.router)
app.include_router(registrations.router)
app.include_router(chat.router)

# Static files — ensure the directory exists (fresh deploys won't have it)
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/")
async def root():
    return {"message": "Welcome to Eventfy API", "docs": "/docs"}
