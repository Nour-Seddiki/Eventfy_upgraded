from fastapi import APIRouter, Path, UploadFile, File, HTTPException, Query
from pathlib import Path as SysPath
from datetime import datetime, timezone
from sqlalchemy import func
from app.db.session import db_dependency
from starlette import status
from app.services.auth_service import user_dependency
from app.services.event_service import EventService
from app.schemas.event import eventRequest, eventUpdate
from app.models.event import Event
from app.models.ticket import Ticket
from app.models.user import User
from app.utils.supabase_storage import upload_file as supabase_upload


router = APIRouter(prefix="/Event", tags=['Event'])
public_router = APIRouter(tags=['Public Events'])


# ══════════════════════════════════════════
# PUBLIC ENDPOINTS (no auth needed)
# ══════════════════════════════════════════

def _get_attendees(db, event_id, limit=5):
    """Return the first `limit` ticket-holders for an event (social proof)."""
    rows = (
        db.query(User.username, User.avatar_url)
        .join(Ticket, Ticket.user_id == User.id)
        .filter(Ticket.event_id == event_id, Ticket.status != "cancelled")
        .group_by(User.id)
        .limit(limit)
        .all()
    )
    return [{"username": r.username, "avatar_url": r.avatar_url} for r in rows]


def _public_event_dict(e):
    """Serialize an event for public endpoints."""
    return {
        "id": e.id,
        "title": e.title,
        "description": e.description,
        "location": e.location,
        "price": e.price,
        "currency": e.currency or "DZD",
        "start_date": e.start_date.isoformat() if e.start_date else None,
        "end_date": e.end_date.isoformat() if e.end_date else None,
        "registration_deadline": e.registration_deadline.isoformat() if e.registration_deadline else None,
        "available_tickets": e.available_tickets,
        "image": e.image,
        "organizer_id": e.organizer_id,
        "requires_approval": e.requires_approval or False,
    }


@public_router.get("/events/public", status_code=status.HTTP_200_OK)
def list_public_events(db: db_dependency, limit: int = Query(20, ge=1, le=100)):
    """List all upcoming events with ticket sales count — no login required."""
    rows = (
        db.query(Event, func.count(Ticket.id).label("tickets_sold"))
        .outerjoin(Ticket, (Ticket.event_id == Event.id) & (Ticket.status != "cancelled"))
        .filter(
            Event.is_deleted.is_(False),
            func.coalesce(Event.end_date, Event.start_date) >= datetime.now(timezone.utc)
        )
        .group_by(Event.id)
        .order_by(Event.start_date.asc())
        .limit(limit)
        .all()
    )
    return [
        {
            **_public_event_dict(e),
            "tickets_sold": tickets_sold,
            "attendees": _get_attendees(db, e.id),
        }
        for e, tickets_sold in rows
    ]


@public_router.get("/events/trending", status_code=status.HTTP_200_OK)
def trending_events(db: db_dependency, limit: int = Query(5, ge=1, le=50)):
    """Trending events (most tickets sold) — no login required."""
    current_time = datetime.now(timezone.utc)
    rows = (
        db.query(Event, func.count(Ticket.id).label("tickets_sold"))
        .outerjoin(Ticket, (Ticket.event_id == Event.id) & (Ticket.status != "cancelled"))
        .filter(Event.available_tickets > 0, Event.is_deleted.is_(False))
        .group_by(Event.id)
        .order_by(func.count(Ticket.id).desc(), Event.start_date.asc())
        .limit(limit)
        .all()
    )
    return [
        {
            **_public_event_dict(event),
            "tickets_sold": tickets_sold,
        }
        for event, tickets_sold in rows
    ]


@public_router.get("/events/{event_id}/similar", status_code=status.HTTP_200_OK)
def similar_events(db: db_dependency, event_id: int = Path(gt=0), limit: int = Query(5, ge=1, le=50)):
    """Other events, same city first — no login required."""
    base = db.query(Event).filter(Event.id == event_id).first()
    if not base:
        raise HTTPException(status_code=404, detail="Event not found")

    similar = (
        db.query(Event)
        .filter(Event.id != base.id, Event.is_deleted.is_(False))
        .order_by((Event.location == base.location).desc(), Event.start_date.asc())
        .limit(limit)
        .all()
    )
    return [_public_event_dict(e) for e in similar]


@public_router.get("/events/public/{event_id}", status_code=status.HTTP_200_OK)
def get_public_event(db: db_dependency, event_id: int = Path(gt=0)):
    """Get a single event by ID — no login required."""
    e = db.query(Event).filter(Event.id == event_id, Event.is_deleted.is_(False)).first()
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    return _public_event_dict(e)


@public_router.get("/events/search", status_code=status.HTTP_200_OK)
def search_events(
    db: db_dependency,
    q: str = Query("", description="Search keyword"),
    location: str = Query("", description="Location filter"),
):
    """Search events by title or location — no login required."""
    query = db.query(Event).filter(Event.is_deleted.is_(False))
    if q:
        query = query.filter(Event.title.ilike(f"%{q}%"))
    if location:
        query = query.filter(Event.location.ilike(f"%{location}%"))

    events = query.order_by(Event.start_date.asc()).limit(50).all()
    return [_public_event_dict(e) for e in events]


# ══════════════════════════════════════════
# PROTECTED ENDPOINTS (auth required)
# ══════════════════════════════════════════

@router.post("/create_event", status_code=status.HTTP_201_CREATED)
def create_event(user: user_dependency, db: db_dependency, event_data: eventRequest):
    return EventService().create_event(user, db, event_data)


@router.get("/event_list", status_code=status.HTTP_200_OK)
def list_all_events(user: user_dependency, db: db_dependency):
    return EventService().list_events(user, db)


@router.get("/get_event_by_id/{event_id}", status_code=status.HTTP_200_OK)
def get_event_by_id(user: user_dependency, db: db_dependency, event_id: int = Path(gt=0)):
    return EventService().get_event_by_id(user, db, event_id)


@router.get("/list_event_by_location/{keyword}", status_code=status.HTTP_200_OK)
def list_events_by_location(user: user_dependency, db: db_dependency, keyword: str):
    return EventService().search_events_by_location(user, db, keyword)


@router.get("/list_event_by_title/{keyword}", status_code=status.HTTP_200_OK)
def list_events_by_title(user: user_dependency, db: db_dependency, keyword: str):
    return EventService().search_events_by_title(user, db, keyword)


@router.put("/update_event/{event_id}", status_code=status.HTTP_202_ACCEPTED)
def update_event(user: user_dependency, db: db_dependency, data: eventUpdate, event_id: int = Path(gt=0)):
    return EventService().update_event(user, db, data, event_id)


@router.post("/event/{event_id}/image", status_code=status.HTTP_201_CREATED)
async def upload_event_image(
    user: user_dependency,
    db: db_dependency,
    event_id: int = Path(gt=0),
    image: UploadFile = File(...),
):
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp"}
    file_suffix = SysPath(image.filename or "").suffix.lower()
    if file_suffix not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    file_bytes = await image.read()

    try:
        public_url = supabase_upload("event-images", file_bytes, image.filename or "image.jpg")
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return EventService().upload_event_image(user, db, event_id, public_url)


@router.delete("/delete_event/{event_id}", status_code=status.HTTP_202_ACCEPTED)
def delete_event(user: user_dependency, db: db_dependency, event_id: int = Path(gt=0)):
    return EventService().delete_event(user, db, event_id)
