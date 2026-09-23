"""Test SMTP email sending with the configured credentials."""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
smtp_port = int(os.getenv("SMTP_PORT", "587"))
smtp_user = os.getenv("SMTP_USER")
smtp_password = os.getenv("SMTP_PASSWORD")
smtp_from = os.getenv("SMTP_FROM") or smtp_user
use_tls = os.getenv("SMTP_USE_TLS", "true").lower() in {"1", "true", "yes"}

print(f"SMTP Host: {smtp_host}")
print(f"SMTP Port: {smtp_port}")
print(f"SMTP User: {smtp_user}")
print(f"SMTP Pass: {'*' * len(smtp_password) if smtp_password else 'MISSING!'}")
print(f"SMTP From: {smtp_from}")
print(f"Use TLS:   {use_tls}")

if not smtp_user or not smtp_password:
    print("\n❌ SMTP_USER or SMTP_PASSWORD is not set!")
    sys.exit(1)

# Build test email
msg = MIMEMultipart()
msg['Subject'] = "Eventfy Test Email"
msg['From'] = smtp_from
msg['To'] = smtp_user  # Send to ourselves
msg.attach(MIMEText("This is a test email from Eventfy backend.", 'plain'))

print(f"\nConnecting to {smtp_host}:{smtp_port}...")
try:
    with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
        server.set_debuglevel(1)  # Show SMTP dialog
        if use_tls:
            server.starttls()
            print("TLS started")
        server.login(smtp_user, smtp_password)
        print("Login successful")
        server.send_message(msg)
        print("\n✅ Test email sent successfully!")
except smtplib.SMTPAuthenticationError as e:
    print(f"\n❌ Auth failed: {e}")
    print("For Gmail, you need an App Password (not your regular password).")
    print("Go to: https://myaccount.google.com/apppasswords")
except Exception as e:
    print(f"\n❌ Error: {type(e).__name__}: {e}")
