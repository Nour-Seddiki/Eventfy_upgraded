"""
One-shot migration: drop the legacy profile_picture column from users table.
This column is not used by the app (avatar_url is used instead).
"""
from sqlalchemy import text
from app.db.session import engine

def main():
    with engine.connect() as conn:
        # Check if column exists before dropping
        result = conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'profile_picture'
        """))
        row = result.fetchone()
        if row:
            conn.execute(text("ALTER TABLE users DROP COLUMN profile_picture"))
            conn.commit()
            print("✅ Dropped legacy 'profile_picture' column from users table.")
        else:
            print("ℹ️  Column 'profile_picture' does not exist — nothing to do.")

if __name__ == "__main__":
    main()
