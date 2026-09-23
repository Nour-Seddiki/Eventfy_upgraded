import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db.base import Base
from app.models.user import User
from app.models.event import Event
from app.models.ticket import Ticket
from app.models.review import Review


@pytest.fixture()
def db_session():
    """In-memory SQLite session for fast unit tests.

    Note: The production database is Supabase PostgreSQL.
    This in-memory session is only used for isolated model-level unit tests
    that don't need PostgreSQL-specific features.
    """
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
