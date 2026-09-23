import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


# Load .env early so any module importing settings gets configured values.
load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")


BASE_DIR = Path(__file__).resolve().parents[1]  # …/backend/

# Eventfy's Google OAuth client. It is public (it ships in every page that shows the
# Google button), so it lives here as the default rather than only in the deploy env.
DEFAULT_GOOGLE_CLIENT_ID = "725864767438-3bb48r2mf541gtbet8fnhnmg8tgjoqbm.apps.googleusercontent.com"


@dataclass(frozen=True)
class Settings:
    secret_key: str
    algorithm: str
    access_token_expire_minutes: int
    # Supabase PostgreSQL connection fields
    db_host: str
    db_port: int
    db_user: str
    db_password: str
    db_name: str
    google_client_id: str | None
    chargily_key: str | None
    chargily_secret: str | None
    chargily_url: str
    frontend_url: str
    backend_url: str | None
    email_domain_checks: bool
    admin_emails: frozenset


settings = Settings(
    secret_key=os.getenv("SECRET_KEY", "dev-insecure-secret-change-me"),
    algorithm=os.getenv("ALGORITHM", "HS256"),
    access_token_expire_minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")),
    db_host=os.getenv("DB_HOST", ""),
    db_port=int(os.getenv("DB_PORT", "6543")),
    db_user=os.getenv("DB_USER", "postgres"),
    db_password=os.getenv("DB_PASSWORD", ""),
    db_name=os.getenv("DB_NAME", "postgres"),
    google_client_id=os.getenv("GOOGLE_CLIENT_ID", "").strip() or DEFAULT_GOOGLE_CLIENT_ID,
    chargily_key=os.getenv("CHARGILY_KEY"),
    chargily_secret=os.getenv("CHARGILY_SECRET"),
    chargily_url=os.getenv("CHARGILY_URL", "https://pay.chargily.net/test/api/v2/"),
    frontend_url=os.getenv("FRONTEND_URL", "http://localhost:8080"),
    backend_url=os.getenv("BACKEND_URL", "").strip() or None,
    # Reject signups with misspelled, placeholder or disposable domains, or domains
    # with no mail server (DNS lookup). Off leaves only the syntax check (tests)
    email_domain_checks=os.getenv("EMAIL_DOMAIN_CHECKS", "true").lower() in {"1", "true", "yes"},
    # Accounts with these emails become admins when they sign up or sign in.
    # How a fresh deployment gets its first admin (signup never grants a role).
    admin_emails=frozenset(e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()),
)