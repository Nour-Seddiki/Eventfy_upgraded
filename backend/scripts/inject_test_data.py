"""
Eventfy -- Inject test data for verification.
Creates sample users, events, and tickets to test the audit fixes.

Usage:
  cd backend
  python -m scripts.inject_test_data
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from datetime import datetime, timezone, timedelta
from app.db.session import SessionLocal
from app.models.user import User
from app.models.event import Event
from app.models.ticket import Ticket
from app.services.auth_service import hashing_password
import uuid


# ── Mock attendee users with avatar URLs ──
MOCK_ATTENDEES = [
    {
        "username": "amira_b",
        "email": "amira.b@demo.com",
        "full_name": "Amira Benali",
        "avatar_url": "https://ui-avatars.com/api/?name=Amira+Benali&background=7f0df2&color=fff&size=100&bold=true",
    },
    {
        "username": "youcef_k",
        "email": "youcef.k@demo.com",
        "full_name": "Youcef Khelifi",
        "avatar_url": "https://ui-avatars.com/api/?name=Youcef+Khelifi&background=ef4444&color=fff&size=100&bold=true",
    },
    {
        "username": "sarah_m",
        "email": "sarah.m@demo.com",
        "full_name": "Sarah Mebarki",
        "avatar_url": "https://ui-avatars.com/api/?name=Sarah+Mebarki&background=10b981&color=fff&size=100&bold=true",
    },
    {
        "username": "karim_d",
        "email": "karim.d@demo.com",
        "full_name": "Karim Djelloul",
        "avatar_url": "https://ui-avatars.com/api/?name=Karim+Djelloul&background=f59e0b&color=fff&size=100&bold=true",
    },
    {
        "username": "lina_h",
        "email": "lina.h@demo.com",
        "full_name": "Lina Hamidi",
        "avatar_url": "https://ui-avatars.com/api/?name=Lina+Hamidi&background=3b82f6&color=fff&size=100&bold=true",
    },
    {
        "username": "mehdi_r",
        "email": "mehdi.r@demo.com",
        "full_name": "Mehdi Rahmani",
        "avatar_url": "https://ui-avatars.com/api/?name=Mehdi+Rahmani&background=8b5cf6&color=fff&size=100&bold=true",
    },
    {
        "username": "nadia_z",
        "email": "nadia.z@demo.com",
        "full_name": "Nadia Ziani",
        "avatar_url": "https://ui-avatars.com/api/?name=Nadia+Ziani&background=ec4899&color=fff&size=100&bold=true",
    },
    {
        "username": "amine_t",
        "email": "amine.t@demo.com",
        "full_name": "Amine Touati",
        "avatar_url": "https://ui-avatars.com/api/?name=Amine+Touati&background=14b8a6&color=fff&size=100&bold=true",
    },
]


def inject():
    db = SessionLocal()

    try:
        # -- Find or create test organizer --
        organizer = db.query(User).filter(User.username == "test_organizer").first()
        if organizer:
            print(f"  [=] Organizer already exists: {organizer.username} (id={organizer.id})")
            # Update profile fields if they're empty
            if not organizer.full_name:
                organizer.full_name = "Demo Organizer"
                organizer.bio = "Event management enthusiast and community builder."
                organizer.phone = "+213 555 123 456"
                organizer.location = "Algiers, Algeria"
                organizer.website = "https://eventfy.demo"
                db.commit()
                print(f"  [+] Updated organizer profile fields")
            # Set avatar if missing
            if not organizer.avatar_url:
                organizer.avatar_url = "https://ui-avatars.com/api/?name=Demo+Organizer&background=0f172a&color=fff&size=100&bold=true"
                db.commit()
                print(f"  [+] Updated organizer avatar_url")
        else:
            organizer = User(
                username="test_organizer",
                email="organizer@test.com",
                hashed_password=hashing_password("Test1234!"),
                role="organizer",
                is_verified=True,
                full_name="Demo Organizer",
                bio="Event management enthusiast and community builder.",
                phone="+213 555 123 456",
                location="Algiers, Algeria",
                website="https://eventfy.demo",
                avatar_url="https://ui-avatars.com/api/?name=Demo+Organizer&background=0f172a&color=fff&size=100&bold=true",
            )
            db.add(organizer)
            db.flush()
            print(f"  [+] Created organizer: {organizer.username} (id={organizer.id})")

        # -- Find or create test attendee --
        attendee = db.query(User).filter(User.username == "test_attendee").first()
        if attendee:
            print(f"  [=] Attendee already exists: {attendee.username} (id={attendee.id})")
            if not attendee.full_name:
                attendee.full_name = "Demo Attendee"
                attendee.bio = "Love discovering local events!"
                attendee.phone = "+213 555 789 012"
                attendee.location = "Oran, Algeria"
                db.commit()
                print(f"  [+] Updated attendee profile fields")
            if not attendee.avatar_url:
                attendee.avatar_url = "https://ui-avatars.com/api/?name=Demo+Attendee&background=6366f1&color=fff&size=100&bold=true"
                db.commit()
                print(f"  [+] Updated attendee avatar_url")
        else:
            attendee = User(
                username="test_attendee",
                email="attendee@test.com",
                hashed_password=hashing_password("Test1234!"),
                role="attendee",
                is_verified=True,
                full_name="Demo Attendee",
                bio="Love discovering local events!",
                phone="+213 555 789 012",
                location="Oran, Algeria",
                avatar_url="https://ui-avatars.com/api/?name=Demo+Attendee&background=6366f1&color=fff&size=100&bold=true",
            )
            db.add(attendee)
            db.flush()
            print(f"  [+] Created attendee: {attendee.username} (id={attendee.id})")

        # -- Create mock attendee users with avatars --
        mock_user_ids = []
        for att_data in MOCK_ATTENDEES:
            existing = db.query(User).filter(User.username == att_data["username"]).first()
            if existing:
                print(f"  [=] Mock attendee already exists: {existing.username} (id={existing.id})")
                # Update avatar if missing
                if not existing.avatar_url:
                    existing.avatar_url = att_data["avatar_url"]
                    db.commit()
                    print(f"  [+] Updated avatar for {existing.username}")
                mock_user_ids.append(existing.id)
            else:
                new_user = User(
                    username=att_data["username"],
                    email=att_data["email"],
                    hashed_password=hashing_password("Demo1234!"),
                    role="attendee",
                    is_verified=True,
                    full_name=att_data["full_name"],
                    avatar_url=att_data["avatar_url"],
                )
                db.add(new_user)
                db.flush()
                mock_user_ids.append(new_user.id)
                print(f"  [+] Created mock attendee: {new_user.username} (id={new_user.id})")

        # -- 3. Create sample events --
        events_data = [
            {
                "title": "AI and Machine Learning Summit 2026",
                "description": "A full-day summit exploring the latest in AI, deep learning, and automation.",
                "category": "Science",
                "location": "Algiers, CIC Convention Center",
                "price": 2500.0,
                "available_tickets": 200,
                "date": datetime.now(timezone.utc) + timedelta(days=30),
            },
            {
                "title": "Startup Weekend Algeria",
                "description": "54 hours to build your startup from idea to MVP. Mentors, investors, and pizza included.",
                "category": "Business",
                "location": "Oran, TechHub Co-Working",
                "price": 0,
                "available_tickets": 100,
                "date": datetime.now(timezone.utc) + timedelta(days=14),
            },
            {
                "title": "Electronic Music Festival",
                "description": "The biggest outdoor EDM festival in North Africa. 3 stages, 20+ artists.",
                "category": "Music",
                "location": "Constantine, Olympic Stadium",
                "price": 3500.0,
                "available_tickets": 500,
                "date": datetime.now(timezone.utc) + timedelta(days=45),
            },
            {
                "title": "Gaming Tournament - League Finals",
                "description": "National League of Legends championship with $5000 prize pool.",
                "category": "Gaming",
                "location": "Algiers, Esports Arena",
                "price": 1000.0,
                "available_tickets": 150,
                "date": datetime.now(timezone.utc) + timedelta(days=7),
            },
            {
                "title": "Street Food Festival",
                "description": "Taste the best street food from 50+ vendors across Algeria.",
                "category": "Food",
                "location": "Annaba, Corniche Square",
                "price": 500.0,
                "available_tickets": 300,
                "date": datetime.now(timezone.utc) + timedelta(days=21),
            },
        ]

        created_events = []
        for ev_data in events_data:
            existing_ev = db.query(Event).filter(Event.title == ev_data["title"]).first()
            if existing_ev:
                print(f"  [=] Event already exists: {existing_ev.title} (id={existing_ev.id})")
                created_events.append(existing_ev)
            else:
                event = Event(organizer_id=organizer.id, **ev_data)
                db.add(event)
                db.flush()
                created_events.append(event)
                print(f"  [+] Created event: {event.title} (id={event.id})")

        # -- 4. Create tickets from DIVERSE mock users (real attendee avatars) --
        # Each event gets tickets from different mock attendees for social proof
        # Map: event index -> list of (mock_user_index, ticket_count) pairs
        event_attendee_map = [
            # AI Summit: 5 different attendees
            [(0, 3), (1, 2), (2, 4), (3, 1), (4, 2)],
            # Startup Weekend: 3 attendees
            [(2, 2), (5, 1), (6, 2)],
            # Music Festival: 6 attendees (big event)
            [(0, 5), (1, 3), (3, 4), (5, 6), (6, 5), (7, 5)],
            # Gaming Tournament: 4 attendees
            [(1, 2), (3, 3), (4, 1), (7, 2)],
            # Street Food: 5 attendees
            [(0, 2), (2, 3), (4, 2), (6, 4), (7, 4)],
        ]

        for event, attendee_pairs in zip(created_events, event_attendee_map):
            existing_tickets = db.query(Ticket).filter(Ticket.event_id == event.id).count()
            if existing_tickets > 0:
                print(f"  [=] {existing_tickets} tickets already exist for: {event.title}")
                continue

            total_created = 0
            for mock_idx, count in attendee_pairs:
                user_id = mock_user_ids[mock_idx]
                for _ in range(count):
                    ticket = Ticket(
                        id=str(uuid.uuid4()),
                        user_id=user_id,
                        event_id=event.id,
                        qr_code=f"QR-{event.id}-{uuid.uuid4().hex[:8]}",
                        status="active",
                    )
                    db.add(ticket)
                    total_created += 1
            print(f"  [+] Created {total_created} tickets from {len(attendee_pairs)} attendees for: {event.title}")

        db.commit()
        print("\n[OK] Test data injected successfully!")
        print(f"\nLogin credentials:")
        print(f"   Organizer: organizer@test.com / Test1234!")
        print(f"   Attendee:  attendee@test.com  / Test1234!")
        print(f"   Mock users: *@demo.com        / Demo1234!")

    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    inject()
