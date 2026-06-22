from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func

from app.extensions import db
from app.models import (
    Book,
    BookStatus,
    Shelf,
    ShelfBook,
    ShelfShare,
    Lending,
    ActivityEvent,
    ActivityRecipient,
)

dashboard_bp = Blueprint("dashboard", __name__)


def _serialize_activity(recipient):
    event = recipient.event
    return {
        "id": event.id,
        "type": event.type.value,
        "message": event.message,
        "created_at": event.created_at.isoformat(),
    }


@dashboard_bp.route("", methods=["GET"])
@jwt_required()
def get_dashboard():
    user_id = get_jwt_identity()
    current_year = datetime.utcnow().year

    status_counts = dict(
        db.session.query(Book.status, func.count(Book.id))
        .filter(Book.owner_id == user_id)
        .group_by(Book.status)
        .all()
    )
    counts_by_status = {s.value: status_counts.get(s, 0) for s in BookStatus}

    finished_this_year = Book.query.filter(
        Book.owner_id == user_id,
        Book.status == BookStatus.FINISHED,
        Book.finished_at.isnot(None),
        func.extract("year", Book.finished_at) == current_year,
    ).count()

    avg_rating = (
        db.session.query(func.avg(Book.rating))
        .filter(Book.owner_id == user_id, Book.rating.isnot(None))
        .scalar()
    )

    busiest_shelf = (
        db.session.query(Shelf.name, func.count(ShelfBook.book_id).label("cnt"))
        .join(ShelfBook, ShelfBook.shelf_id == Shelf.id)
        .filter(Shelf.owner_id == user_id)
        .group_by(Shelf.id, Shelf.name)
        .order_by(func.count(ShelfBook.book_id).desc())
        .first()
    )

    lent_out_count = Lending.query.filter_by(lender_id=user_id, returned_at=None).count()
    shared_with_me_count = ShelfShare.query.filter_by(user_id=user_id).count()

    recent_activity = (
        ActivityRecipient.query.filter_by(user_id=user_id)
        .join(ActivityEvent)
        .order_by(ActivityEvent.created_at.desc())
        .limit(10)
        .all()
    )

    return jsonify(
        counts_by_status=counts_by_status,
        finished_this_year=finished_this_year,
        average_rating=round(avg_rating, 2) if avg_rating else None,
        busiest_shelf=busiest_shelf[0] if busiest_shelf else None,
        currently_lent_out=lent_out_count,
        shelves_shared_with_me=shared_with_me_count,
        recent_activity=[_serialize_activity(r) for r in recent_activity],
    )


@dashboard_bp.route("/activity", methods=["GET"])
@jwt_required()
def get_activity_feed():
    """Full, paginated activity feed — the dashboard above only shows the
    latest 10; this is what a 'load more' button on the feed would call."""
    user_id = get_jwt_identity()
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 20, type=int), 1), 100)

    query = (
        ActivityRecipient.query.filter_by(user_id=user_id)
        .join(ActivityEvent)
        .order_by(ActivityEvent.created_at.desc())
    )
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()

    return jsonify(
        items=[_serialize_activity(r) for r in items],
        page=page,
        per_page=per_page,
        total=total,
    )