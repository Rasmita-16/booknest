from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import Book, BookStatus, ActivityType
from app.activity_log import log_activity

books_bp = Blueprint("books", __name__)

ALLOWED_SORT_FIELDS = {
    "rating": Book.rating,
    "title": Book.title,
    "created_at": Book.created_at,
}


def _progress_percent(book):
    if not book.total_pages or book.total_pages <= 0:
        return None
    return round((book.current_page / book.total_pages) * 100, 1)


def _serialize_book(book):
    return {
        "id": book.id,
        "title": book.title,
        "author": book.author,
        "status": book.status.value,
        "total_pages": book.total_pages,
        "current_page": book.current_page,
        "progress_percent": _progress_percent(book),
        "rating": book.rating,
        "notes": book.notes,
        "finished_at": book.finished_at.isoformat() if book.finished_at else None,
        "created_at": book.created_at.isoformat(),
    }


def _validate_total_pages(value):
    if value is None:
        return None, None
    if not isinstance(value, int) or value <= 0:
        return None, "total_pages must be a positive integer"
    return value, None


def _validate_rating(value):
    if value is None:
        return None, None
    if not isinstance(value, int) or value < 1 or value > 5:
        return None, "rating must be an integer between 1 and 5"
    return value, None


@books_bp.route("", methods=["POST"])
@jwt_required()
def create_book():
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}

    title = (data.get("title") or "").strip()
    author = (data.get("author") or "").strip()
    status_raw = data.get("status", BookStatus.WANT_TO_READ.value)

    if not title:
        return jsonify(error="Title is required"), 400
    if not author:
        return jsonify(error="Author is required"), 400

    try:
        status = BookStatus(status_raw)
    except ValueError:
        return jsonify(error=f"Invalid status '{status_raw}'"), 400

    total_pages, err = _validate_total_pages(data.get("total_pages"))
    if err:
        return jsonify(error=err), 400

    rating, err = _validate_rating(data.get("rating"))
    if err:
        return jsonify(error=err), 400

    book = Book(
        owner_id=user_id,
        title=title,
        author=author,
        status=status,
        total_pages=total_pages,
        rating=rating,
        notes=data.get("notes"),
    )
    db.session.add(book)
    db.session.commit()

    log_activity(
        actor_id=user_id,
        type_=ActivityType.BOOK_ADDED,
        message=f'Added "{book.title}" to your library',
        recipient_ids=[user_id],
        book_id=book.id,
    )

    return jsonify(_serialize_book(book)), 201


@books_bp.route("", methods=["GET"])
@jwt_required()
def list_books():
    user_id = get_jwt_identity()

    status_raw = request.args.get("status")
    search = request.args.get("search", "").strip()
    sort_by = request.args.get("sort_by", "created_at")
    sort_dir = request.args.get("sort_dir", "desc")
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 10, type=int), 1), 50)

    query = Book.query.filter_by(owner_id=user_id)

    # Filter and search apply together (AND), as required.
    if status_raw:
        try:
            status = BookStatus(status_raw)
        except ValueError:
            return jsonify(error=f"Invalid status '{status_raw}'"), 400
        query = query.filter(Book.status == status)

    if search:
        like = f"%{search}%"
        query = query.filter(db.or_(Book.title.ilike(like), Book.author.ilike(like)))

    sort_column = ALLOWED_SORT_FIELDS.get(sort_by)
    if sort_column is None:
        return jsonify(error=f"Invalid sort_by '{sort_by}'"), 400
    if sort_dir not in ("asc", "desc"):
        return jsonify(error="sort_dir must be 'asc' or 'desc'"), 400

    query = query.order_by(sort_column.asc() if sort_dir == "asc" else sort_column.desc())

    # Server does the pagination math — the frontend just sends page/per_page,
    # it never fetches everything and slices client-side.
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()

    return jsonify(
        items=[_serialize_book(b) for b in items],
        page=page,
        per_page=per_page,
        total=total,
        total_pages=(total + per_page - 1) // per_page if per_page else 0,
    )


@books_bp.route("/<book_id>", methods=["GET"])
@jwt_required()
def get_book(book_id):
    user_id = get_jwt_identity()
    book = Book.query.filter_by(id=book_id, owner_id=user_id).first()
    if not book:
        return jsonify(error="Book not found"), 404
    return jsonify(_serialize_book(book))


@books_bp.route("/<book_id>", methods=["PATCH"])
@jwt_required()
def update_book(book_id):
    user_id = get_jwt_identity()
    book = Book.query.filter_by(id=book_id, owner_id=user_id).first()
    if not book:
        return jsonify(error="Book not found"), 404

    data = request.get_json(silent=True) or {}
    old_status = book.status

    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify(error="Title cannot be empty"), 400
        book.title = title

    if "author" in data:
        author = (data.get("author") or "").strip()
        if not author:
            return jsonify(error="Author cannot be empty"), 400
        book.author = author

    if "total_pages" in data:
        total_pages, err = _validate_total_pages(data.get("total_pages"))
        if err:
            return jsonify(error=err), 400
        book.total_pages = total_pages

    if "rating" in data:
        rating, err = _validate_rating(data.get("rating"))
        if err:
            return jsonify(error=err), 400
        book.rating = rating

    if "notes" in data:
        book.notes = data.get("notes")

    # Progress logging: the one field with real validation + a side effect.
    if "current_page" in data:
        current_page = data.get("current_page")
        if not isinstance(current_page, int):
            return jsonify(error="current_page must be an integer"), 400
        if current_page < 0:
            return jsonify(error="current_page cannot be negative"), 400
        if book.total_pages is None:
            return jsonify(error="Cannot log progress before total_pages is set"), 400
        if current_page > book.total_pages:
            return jsonify(error="current_page cannot exceed total_pages"), 400

        book.current_page = current_page

        if current_page == book.total_pages:
            # Auto-finish rule (item 19): reaching the last page finishes
            # the book and stamps finished_at automatically.
            book.status = BookStatus.FINISHED
            book.finished_at = datetime.utcnow()
        elif book.status == BookStatus.FINISHED:
            # Walked progress back down below total — no longer finished.
            book.status = BookStatus.READING
            book.finished_at = None

    elif "status" in data:
        status_raw = data.get("status")
        try:
            new_status = BookStatus(status_raw)
        except ValueError:
            return jsonify(error=f"Invalid status '{status_raw}'"), 400
        book.status = new_status
        if new_status != BookStatus.FINISHED:
            book.finished_at = None

    db.session.commit()

    if book.status != old_status:
        log_activity(
            actor_id=user_id,
            type_=ActivityType.BOOK_STATUS_CHANGED,
            message=f'"{book.title}" changed to {book.status.value}',
            recipient_ids=[user_id],
            book_id=book.id,
        )

    return jsonify(_serialize_book(book))


@books_bp.route("/<book_id>", methods=["DELETE"])
@jwt_required()
def delete_book(book_id):
    user_id = get_jwt_identity()
    book = Book.query.filter_by(id=book_id, owner_id=user_id).first()
    if not book:
        return jsonify(error="Book not found"), 404

    # Cascade rules on the Book model already clean up shelf_links and
    # lendings — no orphaned rows left behind anywhere.
    db.session.delete(book)
    db.session.commit()
    return jsonify(message="Book deleted"), 200