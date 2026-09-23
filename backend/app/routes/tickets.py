from fastapi import APIRouter, Path, BackgroundTasks, HTTPException, Response, status as fastapi_status
from app.db.session import db_dependency 
from starlette import status 
from app.services.auth_service import user_dependency
from app.services.ticket_service import TickectService
from app.schemas.ticket import TicketQRInput
from app.models.event import Event
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix='/ticket', tags=['ticket'])


@router.post("/purchase_ticket/{event_id}",status_code=status.HTTP_201_CREATED)
def purchase_ticket(
    user: user_dependency,
    db: db_dependency,
    background_tasks: BackgroundTasks,
    event_id: int = Path(gt=0),
):
    # Direct purchase is only for free, open events. Paid events go through
    # /payment/checkout and approval events through /registrations; both
    # issue the ticket themselves once paid / approved.
    event = db.query(Event).filter(Event.id == event_id).first()
    if event is not None:
        if event.requires_approval:
            raise HTTPException(
                status_code=fastapi_status.HTTP_403_FORBIDDEN,
                detail="This event requires organizer approval. Submit a registration instead.",
            )
        if event.price and event.price > 0:
            raise HTTPException(
                status_code=fastapi_status.HTTP_402_PAYMENT_REQUIRED,
                detail="This is a paid event. Complete the payment to get your ticket.",
            )
    return TickectService().purchase_ticket(user, db, event_id, background_tasks)

@router.put("/cancell_ticket/{event_id}",status_code=status.HTTP_201_CREATED)
def cancell_ticket(user:user_dependency,db:db_dependency,event_id:int=Path(gt=0)):
    return TickectService().cancel_ticket(user,db,event_id)

@router.post("/validate_ticket",status_code=status.HTTP_201_CREATED)
def validate_ticket(user:user_dependency,db:db_dependency,qr_input: TicketQRInput):
    qr_value = qr_input.qr_input or qr_input.qr_code
    if not qr_value:
        raise HTTPException(
            status_code=fastapi_status.HTTP_400_BAD_REQUEST,
            detail='Provide "qr_input" or "qr_code" in request body',
        )
    return TickectService().validate_ticket(user,db,qr_value)

@router.get("/get_user_tickets",status_code=status.HTTP_200_OK)
def get_user_ticket(user:user_dependency , db:db_dependency):
    return TickectService().get_user_tickets(user,db)


@router.get("/events/{event_id}/attendees", status_code=status.HTTP_200_OK)
def get_event_attendees(user: user_dependency, db: db_dependency, event_id: int = Path(gt=0)):
    return TickectService().get_event_attendees(user, db, event_id)


@router.get("/{ticket_id}/qr")
def get_ticket_qr(ticket_id: str, db: db_dependency, download: bool = False):
    """
    Serve the ticket QR code PNG image.
    If the ticket exists but has no qr_image (legacy data), generate it on-the-fly
    from the qr_code string and persist it back to the DB.
    If download is True, sets Content-Disposition header to prompt download.
    """
    from app.models.ticket import Ticket
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=fastapi_status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )

    # Generate QR image on-the-fly for legacy tickets that lack one
    if not ticket.qr_image:
        if not ticket.qr_code:
            raise HTTPException(
                status_code=fastapi_status.HTTP_404_NOT_FOUND,
                detail="No QR data available for this ticket"
            )
        try:
            from app.utils.qr_generator import generate_qr_code
            import io, qrcode as qrlib
            # Generate a QR image from the existing qr_code string
            qr_img = qrlib.make(ticket.qr_code)
            buffer = io.BytesIO()
            qr_img.save(buffer, format="PNG")
            qr_bytes = buffer.getvalue()
            # Persist back so we don't regenerate every time
            ticket.qr_image = qr_bytes
            db.commit()
        except Exception as e:
            logger.error(f"Failed to generate QR for ticket {ticket_id}: {e}")
            raise HTTPException(
                status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate QR code image"
            )

    headers = {}
    if download:
        headers["Content-Disposition"] = f"attachment; filename=ticket_qr_{ticket_id}.png"
        
    return Response(content=ticket.qr_image, media_type="image/png", headers=headers)

