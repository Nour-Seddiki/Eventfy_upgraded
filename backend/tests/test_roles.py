from app.config import settings
from app.models.user import User
from app.routes import auth as auth_routes
from app.schemas.user import CreateUser, UpdateUser
from app.services.admin_services import Admin
from app.services.auth_service import create_user
from app.services.user_service import userServices


def _auth(user: User) -> dict:
    return {"username": user.username, "user_id": user.id, "user_role": user.role}


def test_signup_always_creates_attendee(db_session):
    # Old clients may still send a role, including "admin"; it is ignored
    for i, role in enumerate(["attendee", "organizer", "admin"]):
        data = CreateUser(user_name=f"user{i}", email=f"user{i}@example.com", password="secret123", role=role)
        user_id = create_user(data, db_session)["user_id"]
        assert db_session.get(User, user_id).role == "attendee"


def test_users_cannot_change_their_own_role(db_session):
    user_id = create_user(CreateUser(user_name="dev", email="dev@example.com", password="secret123"), db_session)["user_id"]
    user = db_session.get(User, user_id)

    data = UpdateUser(user_name="dev2", email="dev2@example.com", role="admin")
    userServices.update_user(_auth(user), db_session, data)

    db_session.refresh(user)
    assert (user.username, user.role) == ("dev2", "attendee")


def test_admin_promotes_attendee_to_organizer(db_session):
    admin = User(username="boss", email="boss@example.com", hashed_password="x", role="admin")
    db_session.add(admin)
    db_session.commit()
    user_id = create_user(CreateUser(user_name="dev", email="dev@example.com", password="secret123"), db_session)["user_id"]

    Admin().change_user_role(_auth(admin), db_session, user_id, "organizer")

    assert db_session.get(User, user_id).role == "organizer"


def test_organizer_request_notifies_admins_until_resolved(db_session):
    from app.models.notification import Notification

    admin = User(username="boss", email="boss@example.com", hashed_password="x", role="admin")
    db_session.add(admin)
    db_session.commit()
    user_id = create_user(CreateUser(user_name="dev", email="dev@example.com", password="secret123"), db_session)["user_id"]
    user = db_session.get(User, user_id)

    assert userServices().get_my_profile(_auth(user), db_session)["organizer_request_pending"] is False
    for _ in range(2):  # asking twice doesn't notify the admins twice
        assert userServices.request_organizer_access(_auth(user), db_session) == {"status": "pending"}
    assert userServices().get_my_profile(_auth(user), db_session)["organizer_request_pending"] is True
    assert db_session.query(Notification).filter(Notification.user_id == admin.id).count() == 1

    Admin().change_user_role(_auth(admin), db_session, user_id, "organizer")

    profile = userServices().get_my_profile(_auth(user), db_session)
    assert (profile["role"], profile["organizer_request_pending"]) == ("organizer", False)
    assert db_session.query(Notification).filter(
        Notification.user_id == user_id, Notification.type == "role_changed").count() == 1


def test_google_config_serves_backend_client_id():
    assert settings.google_client_id.endswith(".apps.googleusercontent.com")
    assert auth_routes.google_config() == {"client_id": settings.google_client_id}


def test_admin_emails_bootstrap_the_first_admin(db_session, monkeypatch):
    import dataclasses
    from app.services import auth_service
    monkeypatch.setattr(auth_service, "settings",
                        dataclasses.replace(auth_service.settings, admin_emails=frozenset({"owner@example.com"})))

    owner_id = create_user(CreateUser(user_name="owner", email="Owner@example.com", password="secret123"), db_session)["user_id"]
    other_id = create_user(CreateUser(user_name="other", email="other@example.com", password="secret123"), db_session)["user_id"]

    assert db_session.get(User, owner_id).role == "admin"
    assert db_session.get(User, other_id).role == "attendee"
