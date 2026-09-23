-- Migration: Add start_date, end_date, registration_deadline, currency to events
-- and preferred_currency to users.
-- Run this ONCE against the PostgreSQL database.

-- 1. Rename the existing 'date' column to 'start_date'
ALTER TABLE events RENAME COLUMN "date" TO start_date;

-- 2. Add new columns to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date TIMESTAMP;
ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_deadline TIMESTAMP;
ALTER TABLE events ADD COLUMN IF NOT EXISTS currency VARCHAR DEFAULT 'DZD';

-- 3. Add preferred_currency to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_currency VARCHAR DEFAULT 'DZD';
