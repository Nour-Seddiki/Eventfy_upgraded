"""Find and remove accounts that aren't real people.

review_accounts() lists every non-admin account with the reasons it looks fake: an email
that fails email_problem() (placeholder, disposable, mistyped, no mail server) or a
deactivated account. purge_users() then deletes the ones an admin picks, together with
everything that points at them. Accounts with a paid payment are kept, because payments
are financial records.
"""
from collections import Counter
from datetime import datetime, timezone

from fastapi import HTTPException

from app.models.chat import Conversation, Message
from app.models.event import Event
from app.models.event_question import EventQuestion
from app.models.form_answer import FormAnswer
from app.models.notification import Notification
from app.models.payment import Payment
from app.models.recommendation import Recommendation
from app.models.registration import Registration
from app.models.review import Review
from app.models.saving_event import SavingEvent
from app.models.ticket import Ticket
from app.models.user import User
from app.utils.email_rules import email_problem

PAID = ("paid", "succeeded")


def _require_admin(user):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication failed")
    if user.get("user_role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


def _keep_reason(db, target: User, caller_id: int) -> str | None:
    """Why this account can't be removed, or None."""
    if target.id == caller_id:
        return "You can't remove your own account"
    if target.role == "admin":
        return "Admins can't be removed"
    owned = [e for (e,) in db.query(Event.id).filter(Event.organizer_id == target.id)]
    paid = db.query(Payment).filter(
        Payment.status.in_(PAID),
        (Payment.user_id == target.id) | (Payment.event_id.in_(owned) if owned else False),
    ).count()
    if paid:
        return "Has paid payments, which must be kept"
    return None


def review_accounts(user, db) -> list[dict]:
    _require_admin(user)
    tickets = Counter(uid for (uid,) in db.query(Ticket.user_id).filter(Ticket.status != "cancelled"))
    events = Counter(oid for (oid,) in db.query(Event.organizer_id).filter(Event.is_deleted.is_(False)))
    paid = Counter(uid for (uid,) in db.query(Payment.user_id).filter(Payment.status.in_(PAID)))

    rows = []
    for u in db.query(User).filter(User.role != "admin").order_by(User.created_at.desc()):
        problem = email_problem(u.email or "", strict=True)
        reasons = []
        if problem:
            reasons.append(problem)
        if u.is_deleted:
            reasons.append("Account was deactivated")
        rows.append({
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "created_at": str(u.created_at) if u.created_at else None,
            "is_deleted": bool(u.is_deleted),
            "is_banned": bool(u.is_banned),
            "reasons": reasons,
            "flagged": bool(reasons),
            "tickets": tickets.get(u.id, 0),
            "events": events.get(u.id, 0),
            "removable": not paid.get(u.id),
        })
    return rows


def _delete_user(db, target: User) -> None:
    uid = target.id
    event_ids = [e for (e,) in db.query(Event.id).filter(Event.organizer_id == uid)]
    of_events = (lambda col: col.in_(event_ids)) if event_ids else (lambda col: False)

    ticket_rows = db.query(Ticket).filter((Ticket.user_id == uid) | of_events(Ticket.event_id)).all()
    ticket_ids = [t.id for t in ticket_rows]

    # Give seats back on other organizers' upcoming events
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for t in ticket_rows:
        if t.event_id in event_ids or t.status != "active":
            continue
        event = db.query(Event).filter(Event.id == t.event_id).first()
        if event is not None and event.start_date and event.start_date >= now:
            event.available_tickets = (event.available_tickets or 0) + 1

    registration_ids = [r for (r,) in db.query(Registration.id).filter(
        (Registration.user_id == uid) | of_events(Registration.event_id))]
    question_ids = [q for (q,) in db.query(EventQuestion.id).filter(of_events(EventQuestion.event_id))]
    conversation_ids = [c for (c,) in db.query(Conversation.id).filter(
        (Conversation.user_id == uid) | (Conversation.organizer_id == uid) | of_events(Conversation.event_id))]

    def gone(model, *conditions):
        for condition in conditions:
            db.query(model).filter(condition).delete(synchronize_session=False)

    # Children before parents: nothing here relies on ON DELETE CASCADE
    gone(Payment, (Payment.user_id == uid) | of_events(Payment.event_id))
    if ticket_ids:
        gone(Notification, (Notification.related_object_type == "ticket")
             & Notification.related_object_id.in_([str(t) for t in ticket_ids]))
    gone(Ticket, (Ticket.user_id == uid) | of_events(Ticket.event_id))
    if registration_ids:
        gone(FormAnswer, FormAnswer.registration_id.in_(registration_ids))
    if question_ids:
        gone(FormAnswer, FormAnswer.question_id.in_(question_ids))
    gone(Registration, (Registration.user_id == uid) | of_events(Registration.event_id))
    db.query(Registration).filter(Registration.reviewed_by == uid).update(
        {Registration.reviewed_by: None}, synchronize_session=False)
    gone(EventQuestion, of_events(EventQuestion.event_id))
    if conversation_ids:
        gone(Message, Message.conversation_id.in_(conversation_ids))
        gone(Conversation, Conversation.id.in_(conversation_ids))
    db.query(Message).filter(Message.sender_id == uid).update({Message.sender_id: None}, synchronize_session=False)
    gone(Review, (Review.reviewer_id == uid) | (Review.organizer_id == uid) | of_events(Review.event_id))
    gone(SavingEvent, (SavingEvent.user_id == uid) | of_events(SavingEvent.event_id))
    gone(Recommendation, (Recommendation.user_id == uid) | of_events(Recommendation.event_id))
    gone(Notification, Notification.user_id == uid,
         (Notification.related_object_type == "user") & (Notification.related_object_id == str(uid)))
    if event_ids:
        gone(Notification, (Notification.related_object_type == "event")
             & Notification.related_object_id.in_([str(e) for e in event_ids]))
        gone(Event, Event.id.in_(event_ids))
    db.delete(target)


def purge_users(user, db, user_ids: list[int]) -> dict:
    """Permanently delete accounts (and their events, tickets, messages...)."""
    _require_admin(user)
    removed, skipped = [], []
    for uid in dict.fromkeys(user_ids):
        target = db.query(User).filter(User.id == uid).first()
        if target is None:
            skipped.append({"id": uid, "reason": "Account not found"})
            continue
        reason = _keep_reason(db, target, user.get("user_id"))
        if reason:
            skipped.append({"id": uid, "email": target.email, "reason": reason})
            continue
        _delete_user(db, target)
        db.commit()
        removed.append(uid)
    return {"removed": removed, "skipped": skipped}
