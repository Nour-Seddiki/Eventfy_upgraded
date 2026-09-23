"""
Eventfy — Add extended profile columns to the users table.
Run this script once to migrate the database schema.

Usage:
  cd backend
  python -m scripts.add_profile_columns
"""
import sys
from pathlib import Path

# Ensure the backend package is importable
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import engine
from sqlalchemy import text, inspect


def migrate():
    inspector = inspect(engine)
    existing_columns = [c["name"] for c in inspector.get_columns("users")]

    new_columns = {
        "full_name": "VARCHAR",
        "bio": "VARCHAR",
        "phone": "VARCHAR",
        "location": "VARCHAR",
        "website": "VARCHAR",
    }

    with engine.begin() as conn:
        for col_name, col_type in new_columns.items():
            if col_name not in existing_columns:
                conn.execute(text(f'ALTER TABLE users ADD COLUMN "{col_name}" {col_type}'))
                print(f"  [+] Added column: {col_name}")
            else:
                print(f"  [=] Column already exists: {col_name}")

    print("\n[OK] Migration complete.")


if __name__ == "__main__":
    migrate()
