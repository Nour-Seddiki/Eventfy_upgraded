"""Run the event-dates-currency migration against Supabase PostgreSQL."""
import sys
from pathlib import Path

# Ensure backend root is importable
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db.session import engine
from sqlalchemy import text

MIGRATION_SQL = """
-- 1. Check if 'date' column exists and rename to start_date
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'date'
    ) THEN
        ALTER TABLE events RENAME COLUMN "date" TO start_date;
        RAISE NOTICE 'Renamed events.date -> start_date';
    ELSE
        RAISE NOTICE 'events.date does not exist (already migrated or never existed)';
    END IF;
END $$;

-- 2. Add new columns to events (IF NOT EXISTS)
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date TIMESTAMP;
ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_deadline TIMESTAMP;
ALTER TABLE events ADD COLUMN IF NOT EXISTS currency VARCHAR DEFAULT 'DZD';

-- 3. Add preferred_currency to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_currency VARCHAR DEFAULT 'DZD';

-- 4. Ensure start_date column exists (safety net)
ALTER TABLE events ADD COLUMN IF NOT EXISTS start_date TIMESTAMP;
"""

if __name__ == "__main__":
    print("Connecting to Supabase PostgreSQL...")
    with engine.connect() as conn:
        conn.execute(text(MIGRATION_SQL))
        conn.commit()
    print("Migration completed successfully!")
