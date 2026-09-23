from datetime import datetime, timezone
from io import BytesIO
from sqlalchemy import and_
from app.models.ticket import Ticket
from app.models.event import Event
from app.models.user import User
from fastapi import HTTPException, status, BackgroundTasks
import uuid
import qrcode
from app.schemas.ticket import TicketStatus
from app.schemas.notification import CreateNotification, NotificationType
from app.utils.email_sender import send_ticket_email
from app.utils.qr_generator import generate_qr_code


def _ticket_to_dict(ticket: Ticket) -> dict:
    return {
        "id": str(ticket.id),
        "user_id": ticket.user_id,
        "event_id": ticket.event_id,
        "qr_code": ticket.qr_code,
        "status": ticket.status,
        "purchased_at": ticket.purchased_at,
    }


class TickectService:

    def purchase_ticket(self, user, db, event_id, background_tasks: BackgroundTasks):
        # Authenticate user
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        # Restriction check
        if user.get('is_restricted'):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is restricted. You cannot purchase tickets."
            )

        user_model = db.query(User).filter(User.id == user.get("user_id")).first()
        if user_model is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        # Check if event exists
        event_model = db.query(Event).filter(Event.id == event_id).first()
        if event_model is None:
            raise HTTPException(status_code=404, detail="Event not found")

        # Validate event date
        current_time = datetime.now(timezone.utc)
        if event_model.start_date is None:
            raise HTTPException(status_code=400, detail="Event date is missing")
        event_time = event_model.start_date
        if event_time.tzinfo is None:
            event_time = event_time.replace(tzinfo=timezone.utc)
        if event_time < current_time:
            raise HTTPException(status_code=400, detail="The event time is over")

        # Check ticket availability
        if event_model.available_tickets <= 0:
            raise HTTPException(status_code=400, detail="The event tickets have been sold out")

        # Prevent duplicate purchase
        existing_ticket = db.query(Ticket).filter(
            and_(
                Ticket.user_id == user_model.id,
                Ticket.event_id == event_id,
                Ticket.status == TicketStatus.active
            )
        ).first()

        if existing_ticket:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User has already purchased a ticket for this event."
            )

        unique_id, qr_bytes = generate_qr_code()
        # Create ticket record with QR image
        new_ticket = Ticket(
            user_id=user_model.id,
            event_id=event_id,
            qr_code=unique_id,
            qr_image=qr_bytes,
            status=TicketStatus.active,
            purchased_at=current_time
        )

        # Update event available tickets
        db.add(new_ticket)
        event_model.available_tickets -= 1

        db.commit()
        db.refresh(new_ticket)

        # Create notification for booking confirmation
        from app.services.notification_service import NotificationService
        notification_data = CreateNotification(
            user_id=user_model.id,
            type=NotificationType.BOOKING_CONFIRMED,
            title="Booking Confirmed",
            message=f"Your ticket for '{event_model.title}' has been confirmed. Event date: {event_model.start_date.strftime('%B %d, %Y at %I:%M %p')}",
            related_object_id=str(new_ticket.id),
            related_object_type="ticket"
        )
        NotificationService.create_notification(db, notification_data)

        background_tasks.add_task(
            send_ticket_email,
            user_email=user_model.email,
            event_name=event_model.title,
            event_date=str(event_model.start_date),
            qr_image=new_ticket.qr_image
        )

        return _ticket_to_dict(new_ticket)

    def cancel_ticket(self, user, db, event_id):
        # Authentication
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        # Check event exists
        event_model = db.query(Event).filter(Event.id == event_id).first()
        if event_model is None:
            raise HTTPException(status_code=404, detail="Event not found")

        # Prevent cancelling after event started
        current_time = datetime.now(timezone.utc)
        if event_model.start_date is None:
            raise HTTPException(status_code=400, detail="Event date is missing")
        event_time = event_model.start_date
        if event_time.tzinfo is None:
            event_time = event_time.replace(tzinfo=timezone.utc)
        if event_time < current_time:
            raise HTTPException(status_code=400, detail="The event time is over")

        # Find user's active ticket
        ticket_model = db.query(Ticket).filter(
            and_(
                Ticket.user_id == user.get("user_id"),
                Ticket.event_id == event_id,
                Ticket.status == TicketStatus.active
            )
        ).first()

        if ticket_model is None:
            raise HTTPException(
                status_code=404,
                detail="Active ticket not found for this user"
            )

        # Cancel ticket
        ticket_model.status = TicketStatus.cancelled

        # Increase available tickets
        event_model.available_tickets += 1

        # Commit changes
        db.commit()

        # Create notification for booking cancellation
        user_model = db.query(User).filter(User.id == user.get("user_id")).first()
        from app.services.notification_service import NotificationService
        notification_data = CreateNotification(
            user_id=user_model.id,
            type=NotificationType.BOOKING_CANCELLED,
            title="Booking Cancelled",
            message=f"Your ticket for '{event_model.title}' has been cancelled. Event date: {event_model.start_date.strftime('%B %d, %Y at %I:%M %p')}",
            related_object_id=str(ticket_model.id),
            related_object_type="ticket"
        )
        NotificationService.create_notification(db, notification_data)

        return {"message": "Ticket successfully cancelled"}

    def validate_ticket(self, user, db, qr_input):
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        ticket_model = db.query(Ticket).filter(Ticket.qr_code == qr_input).first()
        if ticket_model is None:
            raise HTTPException(status_code=404, detail="Ticket not found — invalid QR code")

        event = db.query(Event).filter(Event.id == ticket_model.event_id).first()
        if event is None:
            raise HTTPException(status_code=404, detail="Event not found")

        # Only the event's organizer (or an admin) may check tickets in
        role = (user.get("user_role") or "").lower()
        if role != "admin" and event.organizer_id != user.get("user_id"):
            raise HTTPException(status_code=403, detail="Only the organizer can validate tickets for this event")

        # Differentiate error types for the scanner UI
        if ticket_model.status == TicketStatus.cancelled:
            raise HTTPException(status_code=400, detail="This ticket has been cancelled")
        if ticket_model.status == TicketStatus.used:
            raise HTTPException(status_code=409, detail="This ticket has already been used")
        if ticket_model.status != TicketStatus.active:
            raise HTTPException(status_code=400, detail=f"Invalid ticket status: {ticket_model.status}")

        current_time = datetime.now(timezone.utc)
        if event.start_date is None:
            raise HTTPException(status_code=400, detail="Event date is missing")
        event_time = event.start_date
        if event_time.tzinfo is None:
            event_time = event_time.replace(tzinfo=timezone.utc)

        # Allow scanning from 24h before event start through 24h after
        from datetime import timedelta
        scan_window_start = event_time - timedelta(hours=24)
        scan_window_end = event_time + timedelta(hours=24)

        if current_time > scan_window_end:
            raise HTTPException(status_code=400, detail="This event has already finished")
        if current_time < scan_window_start:
            raise HTTPException(
                status_code=400,
                detail="Check-in is not open yet for this event"
            )

        # Mark as used — prevents duplicate check-ins
        ticket_model.status = TicketStatus.used
        db.commit()

        # Get attendee info for the scanner display
        attendee = db.query(User).filter(User.id == ticket_model.user_id).first()
        attendee_name = attendee.username if attendee else "Unknown"

        # Send check-in notification to attendee
        try:
            from app.services.notification_service import NotificationService
            from app.schemas.notification import CreateNotification, NotificationType
            notif_data = CreateNotification(
                user_id=ticket_model.user_id,
                type=NotificationType.TICKET_CHECKED_IN,
                title="Checked In ✅",
                message=f"You've been checked in to '{event.title}'. Enjoy the event!",
                related_object_id=str(ticket_model.id),
                related_object_type="ticket",
            )
            NotificationService.create_notification(db, notif_data)
        except Exception:
            pass  # Don't block check-in if notification fails

        return {
            "message": "Entry allowed",
            "attendee_name": attendee_name,
            "event_title": event.title,
            "ticket_status": "used",
            "checked_in_at": current_time.isoformat(),
        }

    def get_user_tickets(self, user, db):
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")

        ticket_model = db.query(Ticket).filter(Ticket.user_id == user.get("user_id")).all()
        return [_ticket_to_dict(t) for t in ticket_model]

    def get_event_attendees(self, user, db, event_id):
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication failed")
            
        # Verify event and organizer
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
            
        role = (user.get("user_role") or "").lower()
        if role != "admin" and event.organizer_id != user.get("user_id"):
            raise HTTPException(status_code=403, detail="Only the organizer can view attendees")
            
        # Join tickets with users to get details
        query = (
            db.query(Ticket, User)
            .join(User, Ticket.user_id == User.id)
            .filter(Ticket.event_id == event_id)
            .order_by(Ticket.purchased_at.desc())
        )
        
        rows = query.all()
        
        return [
            {
                "ticket_id": str(t.id),
                "user_id": t.user_id,
                "user_name": u.username,
                "user_email": u.email,
                "status": t.status,
                "purchased_at": t.purchased_at,
            }
            for t, u in rows
        ]
