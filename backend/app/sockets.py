from flask_socketio import join_room
from flask_jwt_extended import decode_token

from app.extensions import socketio
from app.models import Shelf, ShelfShare


@socketio.on("connect")
def handle_connect(auth):
    """Authenticates the socket using the same JWT access token already
    used for REST calls — no separate login for sockets. Returning False
    rejects the connection outright if the token is missing or invalid.
    """
    token = (auth or {}).get("token")
    if not token:
        return False

    try:
        decoded = decode_token(token)
    except Exception:
        return False

    user_id = decoded["sub"]

    # Private room: events meant only for this user (their own activity
    # feed, lending updates) are emitted here, never broadcast globally.
    join_room(f"user:{user_id}")

    # One room per shelf this user can currently see — owned or shared —
    # so shelf-scoped events (item 28) reach exactly the right people.
    owned_shelf_ids = [s.id for s in Shelf.query.filter_by(owner_id=user_id).all()]
    shared_shelf_ids = [
        share.shelf_id for share in ShelfShare.query.filter_by(user_id=user_id).all()
    ]
    for shelf_id in set(owned_shelf_ids + shared_shelf_ids):
        join_room(f"shelf:{shelf_id}")


@socketio.on("disconnect")
def handle_disconnect():
    # No manual cleanup needed — Flask-SocketIO automatically removes a
    # socket from every room it joined the moment it disconnects. On
    # reconnect, the client re-runs the handshake above and rejoins the
    # correct rooms. If reconnection takes a moment, the UI still works
    # off the REST API and a page refresh always gets current state —
    # nothing depends on the socket staying alive to function correctly.
    pass