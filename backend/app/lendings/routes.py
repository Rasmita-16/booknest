from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import Lending, Book, User

lendings_bp = Blueprint("lendings", __name__)


def _serialize_lending(lending):
    lender = User.query.get(lending.lender_id)
    borrower = User.query.get(lending.borrower_id)
    return {
        "id": lending.id,
        "book": {
            "id": lending.book.id,
            "title": lending.book.title,
            "author": lending.book.author,
        },
        "lender": {"id": lender.id, "name": lender.name, "email": lender.email} if lender else None,
        "borrower": {"id": borrower.id, "name": borrower.name, "email": borrower.email} if borrower else None,
        "lent_at": lending.lent_at.isoformat(),
        "returned_at": lending.returned_at.isoformat() if lending.returned_at else None,
    }


@lendings_bp.route("", methods=["POST"])
@jwt_required()
def lend_book():
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}

    book_id = data.get("book_id")
    borrower_email = (data.get("borrower_email") or "").strip().lower()

    if not book_id or not borrower_email:
        return jsonify(error="book_id and borrower_email are required"), 400

    # "Cannot lend a book that does not exist or is not yours" — one
    # query, scoped to ownership, covers both cases as a 404.
    book = Book.query.filter_by(id=book_id, owner_id=user_id).first()
    if not book:
        return jsonify(error="Book not found"), 404

    borrower = User.query.filter_by(email=borrower_email).first()
    if not borrower:
        return jsonify(error="No registered user with that email"), 404

    if borrower.id == user_id:
        return jsonify(error="You can't lend a book to yourself"), 400

    active_lending = Lending.query.filter_by(book_id=book.id, returned_at=None).first()
    if active_lending:
        return jsonify(error="This book is already lent out"), 409

    lending = Lending(book_id=book.id, lender_id=user_id, borrower_id=borrower.id)
    db.session.add(lending)

    try:
        db.session.commit()
    except IntegrityError:
        # Belt-and-suspenders: if two lend requests for the same book
        # land at the exact same moment, the DB's partial unique index
        # catches what the check above might miss in a race.
        db.session.rollback()
        return jsonify(error="This book is already lent out"), 409

    return jsonify(_serialize_lending(lending)), 201


@lendings_bp.route("/borrowed", methods=["GET"])
@jwt_required()
def borrowed_from_others():
    """Books currently lent TO the current user — read-only by nature,
    since editing a book is gated on owner_id in the books module, not
    on anything lending-related."""
    user_id = get_jwt_identity()
    lendings = Lending.query.filter_by(borrower_id=user_id, returned_at=None).all()
    return jsonify(lendings=[_serialize_lending(l) for l in lendings])


@lendings_bp.route("/lent-out", methods=["GET"])
@jwt_required()
def lent_out():
    """Books the current user has lent TO others, still outstanding."""
    user_id = get_jwt_identity()
    lendings = Lending.query.filter_by(lender_id=user_id, returned_at=None).all()
    return jsonify(lendings=[_serialize_lending(l) for l in lendings])


@lendings_bp.route("/<lending_id>/return", methods=["PATCH"])
@jwt_required()
def return_book(lending_id):
    user_id = get_jwt_identity()
    lending = Lending.query.filter_by(id=lending_id, lender_id=user_id).first()
    if not lending:
        return jsonify(error="Lending record not found"), 404

    if lending.returned_at is not None:
        return jsonify(error="This book has already been returned"), 400

    lending.returned_at = datetime.utcnow()
    db.session.commit()
    return jsonify(_serialize_lending(lending))