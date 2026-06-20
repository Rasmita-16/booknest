import hashlib
from datetime import datetime

from flask import Blueprint, request, jsonify, make_response
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    set_refresh_cookies,
    unset_jwt_cookies,
    jwt_required,
    get_jwt_identity,
    decode_token,
)

from app.extensions import db, bcrypt
from app.models import User, RefreshToken
from app.auth.utils import is_valid_email, is_valid_password

auth_bp = Blueprint("auth", __name__)


def _hash_token(raw_token: str) -> str:
    # Tokens are high-entropy and machine-generated (unlike passwords), so
    # a fast cryptographic hash is appropriate here rather than bcrypt.
    return hashlib.sha256(raw_token.encode()).hexdigest()


def _issue_tokens(user: User):
    access_token = create_access_token(identity=user.id)
    refresh_token = create_refresh_token(identity=user.id)

    decoded = decode_token(refresh_token)
    expires_at = datetime.utcfromtimestamp(decoded["exp"])

    db.session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=_hash_token(refresh_token),
            expires_at=expires_at,
        )
    )
    db.session.commit()
    return access_token, refresh_token


@auth_bp.route("/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name:
        return jsonify(error="Name is required"), 400
    if not is_valid_email(email):
        return jsonify(error="Invalid email format"), 400
    if not is_valid_password(password):
        return jsonify(
            error="Password must be at least 8 characters and include a letter and a number"
        ), 400
    if User.query.filter_by(email=email).first():
        return jsonify(error="An account with that email already exists"), 409

    user = User(
        name=name,
        email=email,
        password_hash=bcrypt.generate_password_hash(password).decode(),
    )
    db.session.add(user)
    db.session.commit()

    access_token, refresh_token = _issue_tokens(user)
    resp = make_response(
        jsonify(
            access_token=access_token,
            user={"id": user.id, "name": user.name, "email": user.email},
        ),
        201,
    )
    set_refresh_cookies(resp, refresh_token)
    return resp


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not bcrypt.check_password_hash(user.password_hash, password):
        return jsonify(error="Invalid email or password"), 401

    access_token, refresh_token = _issue_tokens(user)
    resp = make_response(
        jsonify(
            access_token=access_token,
            user={"id": user.id, "name": user.name, "email": user.email},
        )
    )
    set_refresh_cookies(resp, refresh_token)
    return resp


@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    raw_refresh_token = request.cookies.get("booknest_refresh")
    user_id = get_jwt_identity()

    token_row = RefreshToken.query.filter_by(
        user_id=user_id, token_hash=_hash_token(raw_refresh_token), revoked=False
    ).first()

    if not token_row or token_row.expires_at < datetime.utcnow():
        return jsonify(error="Refresh token invalid or expired"), 401

    # Rotation: the old refresh token is dead the moment it's used.
    # A replayed (stolen) old token will be rejected here on its next use.
    token_row.revoked = True
    db.session.commit()

    user = User.query.get(user_id)
    access_token, new_refresh_token = _issue_tokens(user)

    resp = make_response(jsonify(access_token=access_token))
    set_refresh_cookies(resp, new_refresh_token)
    return resp


@auth_bp.route("/logout", methods=["POST"])
@jwt_required(refresh=True, optional=True)
def logout():
    raw_refresh_token = request.cookies.get("booknest_refresh")
    if raw_refresh_token:
        RefreshToken.query.filter_by(token_hash=_hash_token(raw_refresh_token)).update(
            {"revoked": True}
        )
        db.session.commit()

    resp = make_response(jsonify(message="Logged out"))
    unset_jwt_cookies(resp)
    return resp


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify(error="User not found"), 404
    return jsonify(id=user.id, name=user.name, email=user.email)