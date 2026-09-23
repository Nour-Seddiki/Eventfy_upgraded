# utils/email_sender.py

import logging
import smtplib
import base64
import httpx
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from app.config import settings

logger = logging.getLogger(__name__)

def send_ticket_email(user_email: str, event_name: str, event_date: str, qr_image: bytes):
    """
    Sends a ticket confirmation email with QR code attached.
    Uses Resend API if RESEND_API_KEY is set, otherwise falls back to SMTP.
    """
    if not user_email:
        logger.error("User email is missing")
        return False
        
    email_body = (
        f"Hello!\n\n"
        f"Thank you for purchasing a ticket for '{event_name}'.\n"
        f"Event Date: {event_date}\n\n"
        f"Your QR code is attached below. Please bring it to the event.\n\n"
        f"Enjoy the event!\n\n"
        f"Best regards,\n"
        f"Eventfy Team"
    )
    subject = f"🎫 Your Ticket for {event_name}"

    if settings.resend_api_key:
        logger.info(f"Sending email to {user_email} via Resend API")
        return _send_via_resend(user_email, subject, email_body, qr_image)
    else:
        logger.info(f"Sending email to {user_email} via SMTP")
        return _send_via_smtp(user_email, subject, email_body, qr_image)

def _send_via_resend(user_email: str, subject: str, email_body: str, qr_image: bytes):
    try:
        attachments = []
        if qr_image:
            attachments.append({
                "filename": "ticket_qr.png",
                "content": base64.b64encode(qr_image).decode('utf-8')
            })
            
        payload = {
            "from": "Eventfy <onboarding@resend.dev>",
            "to": [user_email],
            "subject": subject,
            "text": email_body,
            "attachments": attachments
        }
        
        headers = {
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json"
        }
        
        response = httpx.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=15.0)
        
        if response.status_code in (200, 201):
            logger.info(f"✅ Ticket confirmation email sent successfully via Resend to {user_email}")
            return True
        else:
            logger.error(f"❌ Resend API error ({response.status_code}): {response.text}")
            return False
            
    except Exception as e:
        logger.exception(f"❌ Unexpected error sending email via Resend: {e}")
        return False

def _send_via_smtp(user_email: str, subject: str, email_body: str, qr_image: bytes):
    try:
        smtp_host = settings.smtp_host
        smtp_port = settings.smtp_port
        smtp_user = settings.smtp_user
        smtp_password = settings.smtp_password
        smtp_from = settings.smtp_from or smtp_user
        use_tls = settings.smtp_use_tls

        if not smtp_user or not smtp_password:
            logger.error("SMTP credentials missing; set SMTP_USER and SMTP_PASSWORD in .env")
            return False

        msg = MIMEMultipart('related')
        msg['Subject'] = subject
        msg['From'] = smtp_from
        msg['To'] = user_email

        msg_alternative = MIMEMultipart('alternative')
        msg.attach(msg_alternative)
        msg_alternative.attach(MIMEText(email_body, 'plain'))

        if qr_image:
            img = MIMEImage(qr_image, 'png')
            img.add_header('Content-ID', '<ticket_qr>')
            img.add_header('Content-Disposition', 'attachment', filename='ticket_qr.png')
            msg.attach(img)
            logger.debug("QR code image attached")

        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            if use_tls:
                server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
            
        logger.info(f"✅ Ticket confirmation email sent successfully via SMTP to {user_email}")
        return True
        
    except Exception as e:
        logger.exception(f"❌ Unexpected error sending email via SMTP: {e}")
        return False
