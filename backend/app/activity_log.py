from app.extensions import db, socketio
from app.models import ActivityEvent, ActivityRecipient


def _serialize_event(event):
    return {
        "id": event.id,
        "type": event.type.value,
        "message": event.message,
        "shelf_id": event.shelf_id,
        "book_id": event.book_id,
        "created_at": event.created_at.isoformat(),
    }


def log_activity(actor_id, type_, message, recipient_ids, shelf_id=None, book_id=None):
    """The single place every module (books, shelves, lendings) calls
    into whenever something activity-worthy happens. Writes one
    ActivityEvent row, fans it out to one ActivityRecipient row per
    recipient, then pushes it live over the socket to each recipient's
    personal room — so the dashboard feed updates without a refresh.
    """
    event = ActivityEvent(
        actor_id=actor_id,
        type=type_,
        message=message,
        shelf_id=shelf_id,
        book_id=book_id,
    )
    db.session.add(event)
    db.session.flush()  # need event.id before creating recipient rows

    unique_recipient_ids = set(recipient_ids)
    for uid in unique_recipient_ids:
        db.session.add(ActivityRecipient(event_id=event.id, user_id=uid))

    db.session.commit()

    payload = _serialize_event(event)
    for uid in unique_recipient_ids:
        socketio.emit("activity:new", payload, room=f"user:{uid}")

    return event