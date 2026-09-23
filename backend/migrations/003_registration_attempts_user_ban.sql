-- Migration: Add attempt_count to registrations, ban/restrict fields to users
-- Run this ONCE against the database.

-- 1. Add attempt_count to registrations table
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 1;

-- 2. Add ban/restrict fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason VARCHAR;
