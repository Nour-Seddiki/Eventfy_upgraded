from app.db.session import engine
from sqlalchemy import text

with engine.connect() as conn:
    r = conn.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'users' AND column_name = 'profile_picture'"
    ))
    row = r.fetchone()
    if row:
        print("EXISTS")
    else:
        print("GONE")
