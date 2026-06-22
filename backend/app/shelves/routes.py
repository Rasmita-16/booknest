from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models import Shelf, ShelfBook, ShelfShare, ShelfRole, Book, User

shelves_bp = Blueprint("shelves", __name__)


def _get_role(shelf, user_id):
    """Single source of truth for access level: 'owner', 'editor',
    'viewer', or None. Every route below checks access through this
    function — there's no other path that grants access to a shelf."""
    if shelf.owner_id == user_id:
        return "owner"
    share = ShelfShare.query.filter_by(shelf_id=shelf.id, user_id=user_id).first()
    return share.role.value if share else None


def _serialize_book_brief(book):
    return {
        "id": book.id,
        "title": book.title,
        "author": book.author,
        "status": book.status.value,
    }


def _serialize_shelf(shelf, role, include_shares=False):
    books = [link.book for link in shelf.book_links]
    data = {
        "id": shelf.id,
        "name": shelf.name,
        "owner_id": shelf.owner_id,
        "role": role,
        "book_count": len(books),
        "books": [_serialize_book_brief(b) for b in books],
        "created_at": shelf.created_at.isoformat(),
    }
    if include_shares:
        data["shares"] = [
            {
                "user_id": s.user_id,
                "email": s.user.email,
                "name": s.user.name,
                "role": s.role.value,
            }
            for s in shelf.shares
        ]
    return data


@shelves_bp.route("", methods=["POST"])
@jwt_required()
def create_shelf():
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()

    if not name:
        return jsonify(error="Shelf name is required"), 400

    shelf = Shelf(owner_id=user_id, name=name)
    db.session.add(shelf)
    db.session.commit()

    return jsonify(_serialize_shelf(shelf, role="owner")), 201


@shelves_bp.route("", methods=["GET"])
@jwt_required()
def list_my_shelves():
    user_id = get_jwt_identity()
    shelves = Shelf.query.filter_by(owner_id=user_id).order_by(Shelf.created_at.desc()).all()
    return jsonify(shelves=[_serialize_shelf(s, role="owner") for s in shelves])


@shelves_bp.route("/shared-with-me", methods=["GET"])
@jwt_required()
def shared_with_me():
    user_id = get_jwt_identity()
    shares = ShelfShare.query.filter_by(user_id=user_id).all()
    return jsonify(shelves=[_serialize_shelf(s.shelf, role=s.role.value) for s in shares])


@shelves_bp.route("/<shelf_id>", methods=["GET"])
@jwt_required()
def get_shelf(shelf_id):
    user_id = get_jwt_identity()
    shelf = Shelf.query.get(shelf_id)
    if not shelf:
        return jsonify(error="Shelf not found"), 404

    role = _get_role(shelf, user_id)
    if role is None:
        # Don't reveal that the shelf even exists to someone with no access.
        return jsonify(error="Shelf not found"), 404

    return jsonify(_serialize_shelf(shelf, role, include_shares=(role == "owner")))


@shelves_bp.route("/<shelf_id>", methods=["DELETE"])
@jwt_required()
def delete_shelf(shelf_id):
    user_id = get_jwt_identity()
    shelf = Shelf.query.get(shelf_id)
    if not shelf:
        return jsonify(error="Shelf not found"), 404

    if shelf.owner_id != user_id:
        return jsonify(error="Only the shelf owner can delete this shelf"), 403

    # Cascades (defined on the Shelf model) clean up shelf_books and
    # shelf_shares automatically. The books themselves are never touched.
    db.session.delete(shelf)
    db.session.commit()
    return jsonify(message="Shelf deleted"), 200


@shelves_bp.route("/<shelf_id>/books", methods=["POST"])
@jwt_required()
def add_book_to_shelf(shelf_id):
    user_id = get_jwt_identity()
    shelf = Shelf.query.get(shelf_id)
    if not shelf:
        return jsonify(error="Shelf not found"), 404

    role = _get_role(shelf, user_id)
    if role not in ("owner", "editor"):
        return jsonify(error="You don't have permission to add books to this shelf"), 403

    data = request.get_json(silent=True) or {}
    book_id = data.get("book_id")
    if not book_id:
        return jsonify(error="book_id is required"), 400

    # A collaborator can only add books they personally own — adding
    # someone else's book to a shared shelf isn't something they can do.
    book = Book.query.filter_by(id=book_id, owner_id=user_id).first()
    if not book:
        return jsonify(error="Book not found"), 404

    existing = ShelfBook.query.filter_by(shelf_id=shelf.id, book_id=book.id).first()
    if existing:
        return jsonify(error="That book is already on this shelf"), 409

    db.session.add(ShelfBook(shelf_id=shelf.id, book_id=book.id))
    db.session.commit()
    return jsonify(message="Book added to shelf"), 201


@shelves_bp.route("/<shelf_id>/books/<book_id>", methods=["DELETE"])
@jwt_required()
def remove_book_from_shelf(shelf_id, book_id):
    user_id = get_jwt_identity()
    shelf = Shelf.query.get(shelf_id)
    if not shelf:
        return jsonify(error="Shelf not found"), 404

    role = _get_role(shelf, user_id)
    if role not in ("owner", "editor"):
        return jsonify(error="You don't have permission to remove books from this shelf"), 403

    link = ShelfBook.query.filter_by(shelf_id=shelf_id, book_id=book_id).first()
    if not link:
        return jsonify(error="That book is not on this shelf"), 404

    db.session.delete(link)
    db.session.commit()
    return jsonify(message="Book removed from shelf"), 200


@shelves_bp.route("/<shelf_id>/share", methods=["POST"])
@jwt_required()
def share_shelf(shelf_id):
    user_id = get_jwt_identity()
    shelf = Shelf.query.get(shelf_id)
    if not shelf:
        return jsonify(error="Shelf not found"), 404

    if shelf.owner_id != user_id:
        return jsonify(error="Only the shelf owner can share this shelf"), 403

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    try:
        role = ShelfRole(data.get("role"))
    except ValueError:
        return jsonify(error="role must be 'editor' or 'viewer'"), 400

    target_user = User.query.filter_by(email=email).first()
    if not target_user:
        return jsonify(error="No registered user with that email"), 404

    if target_user.id == user_id:
        return jsonify(error="You can't share a shelf with yourself"), 400

    existing = ShelfShare.query.filter_by(shelf_id=shelf.id, user_id=target_user.id).first()
    if existing:
        return jsonify(error="Already shared with this user — use PATCH to change their role"), 409

    db.session.add(ShelfShare(shelf_id=shelf.id, user_id=target_user.id, role=role))
    db.session.commit()

    return jsonify(message=f"Shelf shared with {target_user.email} as {role.value}"), 201


@shelves_bp.route("/<shelf_id>/share/<target_user_id>", methods=["PATCH"])
@jwt_required()
def update_share_role(shelf_id, target_user_id):
    user_id = get_jwt_identity()
    shelf = Shelf.query.get(shelf_id)
    if not shelf:
        return jsonify(error="Shelf not found"), 404

    if shelf.owner_id != user_id:
        return jsonify(error="Only the shelf owner can change collaborator roles"), 403

    share = ShelfShare.query.filter_by(shelf_id=shelf.id, user_id=target_user_id).first()
    if not share:
        return jsonify(error="That user doesn't have access to this shelf"), 404

    data = request.get_json(silent=True) or {}
    try:
        new_role = ShelfRole(data.get("role"))
    except ValueError:
        return jsonify(error="role must be 'editor' or 'viewer'"), 400

    share.role = new_role
    db.session.commit()
    return jsonify(message="Role updated"), 200


@shelves_bp.route("/<shelf_id>/share/<target_user_id>", methods=["DELETE"])
@jwt_required()
def remove_collaborator(shelf_id, target_user_id):
    user_id = get_jwt_identity()
    shelf = Shelf.query.get(shelf_id)
    if not shelf:
        return jsonify(error="Shelf not found"), 404

    if shelf.owner_id != user_id:
        return jsonify(error="Only the shelf owner can remove a collaborator"), 403

    share = ShelfShare.query.filter_by(shelf_id=shelf.id, user_id=target_user_id).first()
    if not share:
        return jsonify(error="That user doesn't have access to this shelf"), 404

    db.session.delete(share)
    db.session.commit()
    return jsonify(message="Collaborator removed"), 200