from fastapi import HTTPException
from datetime import datetime, timezone
from app.models.event import Event
from app.models.ticket import Ticket


class Recommendation_Servies:

    def recommendation(self, user, db):
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        ticket_model = db.query(Ticket).filter(Ticket.user_id == user.get("user_id")).all()
        if not ticket_model:
            raise HTTPException(status_code=404, detail="tickets not found")

        purchased_event_ids = {ticket.event_id for ticket in ticket_model}

        purchased_events = (
            db.query(Event).filter(Event.id.in_(list(purchased_event_ids))).all()
        )
        if not purchased_events:
            raise HTTPException(status_code=404, detail="events not found")

        preferred_locations = {event.location for event in purchased_events if event.location}

        current_time = datetime.now(timezone.utc)
        candidate_events = (
            db.query(Event)
            .filter(
                Event.available_tickets > 0,
                Event.start_date >= current_time,
                Event.is_deleted.is_(False),
                ~Event.id.in_(list(purchased_event_ids)),
            )
            .all()
        )

        if not candidate_events:
            raise HTTPException(status_code=404, detail="No recommendations available")

        scored_events = []
        for event in candidate_events:
            score = 0
            if event.location in preferred_locations:
                score += 2
            if event.price is not None and event.price <= 100:
                score += 1
            scored_events.append((score, event))

        # Keep stronger matches first, then earlier events.
        scored_events.sort(
            key=lambda item: (
                -item[0],
                item[1].start_date,
                -item[1].available_tickets,
            )
        )

        recommended_events = [
            {
                "id": event.id,
                "title": event.title,
                "description": event.description,
                "location": event.location,
                "price": event.price,
                "start_date": event.start_date,
                "available_tickets": event.available_tickets,
                "score": score,
            }
            for score, event in scored_events[:10]
        ]

        return recommended_events
        
