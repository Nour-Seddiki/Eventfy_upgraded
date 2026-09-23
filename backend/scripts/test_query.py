from sqlalchemy import text, func
from sqlalchemy.orm import sessionmaker
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.models.event import Event
from app.models.ticket import Ticket
from app.models.user import User
from app.db.session import engine

Session = sessionmaker(bind=engine)
db = Session()

rows = (
    db.query(Event, func.count(Ticket.id).label("tickets_sold"), func.array_agg(User.profile_picture).label("attendee_avatars"))
    .outerjoin(Ticket, (Ticket.event_id == Event.id) & (Ticket.status != "cancelled"))
    .outerjoin(User, Ticket.user_id == User.id)
    .group_by(Event.id)
    .limit(5)
    .all()
)

for e, tickets_sold, attendee_avatars in rows:
    avatars = list(filter(None, set(attendee_avatars)))[:3] if attendee_avatars else []
    print(f"Event: {e.title}, Sold: {tickets_sold}, Avatars: {avatars}")
