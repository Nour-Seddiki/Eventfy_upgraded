-- ═══════════════════════════════════════════════════════
-- Eventfy — Supabase PostgreSQL Schema
-- Generated from SQLAlchemy models
-- Run this in the Supabase SQL Editor (supabase.com/dashboard)
-- ═══════════════════════════════════════════════════════

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR NOT NULL UNIQUE,
    email VARCHAR NOT NULL UNIQUE,
    hashed_password VARCHAR NOT NULL,
    role VARCHAR DEFAULT 'attendee',
    is_verified BOOLEAN DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    profile_picture VARCHAR,
    bio TEXT,
    linkedin VARCHAR,
    twitter VARCHAR,
    instagram VARCHAR,
    phone VARCHAR,
    address VARCHAR,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS ix_users_id ON users(id);
CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);
CREATE INDEX IF NOT EXISTS ix_users_username ON users(username);


-- 2. EVENTS
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    title VARCHAR NOT NULL,
    description TEXT,
    category VARCHAR,
    location VARCHAR,
    price FLOAT DEFAULT 0.0,
    date TIMESTAMP,
    available_tickets INTEGER DEFAULT 0,
    image VARCHAR,
    organizer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS ix_events_id ON events(id);
CREATE INDEX IF NOT EXISTS ix_events_organizer_id ON events(organizer_id);
CREATE INDEX IF NOT EXISTS ix_events_category ON events(category);


-- 3. TICKETS
CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    status VARCHAR DEFAULT 'confirmed',
    qr_code VARCHAR,
    is_validated BOOLEAN DEFAULT FALSE,
    price_paid FLOAT DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS ix_tickets_id ON tickets(id);
CREATE INDEX IF NOT EXISTS ix_tickets_user_id ON tickets(user_id);
CREATE INDEX IF NOT EXISTS ix_tickets_event_id ON tickets(event_id);


-- 4. PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
    amount FLOAT NOT NULL,
    currency VARCHAR DEFAULT 'DZD',
    payment_method VARCHAR,
    status VARCHAR DEFAULT 'pending',
    checkout_id VARCHAR,
    checkout_url VARCHAR,
    provider_ref VARCHAR,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS ix_payments_id ON payments(id);
CREATE INDEX IF NOT EXISTS ix_payments_user_id ON payments(user_id);


-- 5. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR,
    title VARCHAR,
    message TEXT,
    read BOOLEAN DEFAULT FALSE,
    related_object_id VARCHAR,
    related_object_type VARCHAR,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS ix_notifications_id ON notifications(id);
CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications(user_id);


-- 6. REVIEWS
CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    rating INTEGER NOT NULL,
    comment TEXT,
    reviewer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    organizer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    is_verified_purchase BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS ix_reviews_id ON reviews(id);


-- 7. SAVING EVENTS (bookmarks)
CREATE TABLE IF NOT EXISTS saving_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS ix_saving_events_id ON saving_events(id);


-- 8. RECOMMENDATIONS
CREATE TABLE IF NOT EXISTS recommendations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    score INTEGER,
    generated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS ix_recommendations_id ON recommendations(id);


-- ═══════════════════════════════════════
-- Done! All 8 original tables created.
-- ═══════════════════════════════════════


-- ═══════════════════════════════════════════════════════
-- Dynamic Event Registration Form — Additional Tables
-- ═══════════════════════════════════════════════════════

-- Add requires_approval flag to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE;

-- Add global profile fields to users (for 1-Click Autofill)
ALTER TABLE users ADD COLUMN IF NOT EXISTS university VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS major VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS dietary_restrictions VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR;


-- 9. EVENT QUESTIONS (Form Builder)
CREATE TABLE IF NOT EXISTS event_questions (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    question_type VARCHAR NOT NULL,
    label VARCHAR NOT NULL,
    options_json TEXT,
    is_required BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    profile_field_key VARCHAR,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS ix_event_questions_event_id ON event_questions(event_id);


-- 10. REGISTRATIONS (User form submissions)
CREATE TABLE IF NOT EXISTS registrations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    status VARCHAR DEFAULT 'in_processing' NOT NULL,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT uq_registration_user_event UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS ix_registrations_user_id ON registrations(user_id);
CREATE INDEX IF NOT EXISTS ix_registrations_event_id ON registrations(event_id);
CREATE INDEX IF NOT EXISTS ix_registrations_status ON registrations(status);


-- 11. FORM ANSWERS (Individual question answers)
CREATE TABLE IF NOT EXISTS form_answers (
    id SERIAL PRIMARY KEY,
    registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES event_questions(id) ON DELETE CASCADE,
    answer_value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_form_answers_registration_id ON form_answers(registration_id);
CREATE INDEX IF NOT EXISTS ix_form_answers_question_id ON form_answers(question_id);


-- ═══════════════════════════════════════
-- Done! 11 tables total.
-- ═══════════════════════════════════════
