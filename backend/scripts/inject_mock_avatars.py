import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Connection settings come from backend/.env (DB_HOST, DB_USER, DB_PASSWORD, ...)
from app.db.session import engine
from sqlalchemy import text


with engine.connect() as conn:
    # 1. Add profile_picture to users table
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture VARCHAR;"))
        conn.commit()
        print("Column 'profile_picture' added to 'users' table.")
    except Exception as e:
        print(f"Error adding column: {e}")

    # 2. Add mock profile pictures for all users
    try:
        result = conn.execute(text("SELECT id, username FROM users;"))
        users = result.fetchall()
        for idx, u in enumerate(users):
            avatar_url = f"https://i.pravatar.cc/150?img={(u.id * 7) % 70 + 1}"
            conn.execute(text("UPDATE users SET profile_picture = :url WHERE id = :id"), {"url": avatar_url, "id": u.id})
        conn.commit()
        print(f"Updated {len(users)} users with mock profile pictures.")
    except Exception as e:
        print(f"Error updating users: {e}")
        
    # 3. Create mock tickets for events so there are attendees
    try:
        # Get events
        events = conn.execute(text("SELECT id FROM events;")).fetchall()
        if events and users:
            ticket_count = 0
            for e in events:
                # Add 3 random users to each event
                event_users = users[:min(3, len(users))]
                for u in event_users:
                    # check if ticket already exists
                    existing = conn.execute(text("SELECT id FROM tickets WHERE user_id = :uid AND event_id = :eid"), {"uid": u.id, "eid": e.id}).fetchone()
                    if not existing:
                        conn.execute(text("INSERT INTO tickets (user_id, event_id, status) VALUES (:uid, :eid, 'valid')"), {"uid": u.id, "eid": e.id})
                        ticket_count += 1
            conn.commit()
            print(f"Created {ticket_count} mock tickets.")
    except Exception as e:
        print(f"Error creating tickets: {e}")

print("Supabase database modification complete!")
