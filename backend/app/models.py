import uuid
import enum
from datetime import datetime

from sqlalchemy import Index
from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


def gen_uuid():
    return str(uuid.uuid4())


class BookStatus(str, enum.Enum):
    WANT_TO_READ = "want_to_read"
    READING = "reading"
    FINISHED = "finished"


class ShelfRole(str, enum.Enum):
    EDITOR = "editor"
    VIEWER = "viewer"


class ActivityType(str, enum.Enum):
    BOOK_ADDED = "book_added"
    BOOK_STATUS_CHANGED = "book_status_changed"
    BOOK_LENT = "book_lent"
    BOOK_RETURNED = "book_returned"
    SHELF_SHARED = "shelf_shared"
    SHELF_ROLE_CHANGED = "shelf_role_changed"
    SHELF_COLLABORATOR_REMOVED = "shelf_collaborator_removed"


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    books = db.relationship("Book", back_populates="owner", cascade="all, delete-orphan")
    shelves = db.relationship("Shelf", back_populates="owner", cascade="all, delete-orphan")
    refresh_tokens = db.relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    shelf_shares = db.relationship("ShelfShare", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User {self.email}>"


class RefreshToken(db.Model):
    __tablename__ = "refresh_tokens"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = db.Column(UUID(as_uuid=False), db.ForeignKey("users.id"), nullable=False, index=True)
    token_hash = db.Column(db.String(255), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    revoked = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    user = db.relationship("User", back_populates="refresh_tokens")


class Book(db.Model):
    __tablename__ = "books"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    owner_id = db.Column(UUID(as_uuid=False), db.ForeignKey("users.id"), nullable=False, index=True)
    title = db.Column(db.String(255), nullable=False)
    author = db.Column(db.String(255), nullable=False)
    status = db.Column(db.Enum(BookStatus), default=BookStatus.WANT_TO_READ, nullable=False)
    total_pages = db.Column(db.Integer, nullable=True)
    current_page = db.Column(db.Integer, default=0, nullable=False)
    rating = db.Column(db.Integer, nullable=True)  # 1-5
    notes = db.Column(db.Text, nullable=True)
    finished_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    owner = db.relationship("User", back_populates="books")
    shelf_links = db.relationship("ShelfBook", back_populates="book", cascade="all, delete-orphan")
    lendings = db.relationship("Lending", back_populates="book", cascade="all, delete-orphan")

    __table_args__ = (
        db.CheckConstraint("rating IS NULL OR (rating >= 1 AND rating <= 5)", name="ck_book_rating_range"),
        db.CheckConstraint("current_page >= 0", name="ck_book_current_page_nonneg"),
    )


class Shelf(db.Model):
    __tablename__ = "shelves"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    owner_id = db.Column(UUID(as_uuid=False), db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    owner = db.relationship("User", back_populates="shelves")
    book_links = db.relationship("ShelfBook", back_populates="shelf", cascade="all, delete-orphan")
    shares = db.relationship("ShelfShare", back_populates="shelf", cascade="all, delete-orphan")


class ShelfBook(db.Model):
    """Join table: many-to-many between Shelf and Book.
    Deleting a shelf or book cascades only this link row, never the
    other side — satisfies 'no orphaned references, books never deleted'.
    """
    __tablename__ = "shelf_books"

    shelf_id = db.Column(UUID(as_uuid=False), db.ForeignKey("shelves.id"), primary_key=True)
    book_id = db.Column(UUID(as_uuid=False), db.ForeignKey("books.id"), primary_key=True)
    added_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    shelf = db.relationship("Shelf", back_populates="book_links")
    book = db.relationship("Book", back_populates="shelf_links")


class ShelfShare(db.Model):
    """A user's role (editor/viewer) on a shelf they don't own. This row's
    existence + .role is the single source of truth every RBAC check in
    step 3 will query against."""
    __tablename__ = "shelf_shares"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    shelf_id = db.Column(UUID(as_uuid=False), db.ForeignKey("shelves.id"), nullable=False, index=True)
    user_id = db.Column(UUID(as_uuid=False), db.ForeignKey("users.id"), nullable=False, index=True)
    role = db.Column(db.Enum(ShelfRole), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    shelf = db.relationship("Shelf", back_populates="shares")
    user = db.relationship("User", back_populates="shelf_shares")

    __table_args__ = (
        db.UniqueConstraint("shelf_id", "user_id", name="uq_shelf_user_share"),
    )


class Lending(db.Model):
    __tablename__ = "lendings"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    book_id = db.Column(UUID(as_uuid=False), db.ForeignKey("books.id"), nullable=False, index=True)
    lender_id = db.Column(UUID(as_uuid=False), db.ForeignKey("users.id"), nullable=False, index=True)
    borrower_id = db.Column(UUID(as_uuid=False), db.ForeignKey("users.id"), nullable=False, index=True)
    lent_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    returned_at = db.Column(db.DateTime, nullable=True)

    book = db.relationship("Book", back_populates="lendings")

    __table_args__ = (
        # DB-level guarantee: a book can have at most one ACTIVE
        # (returned_at IS NULL) lending row at a time. Belt-and-suspenders
        # alongside the application check in step 4.
        Index(
            "uq_active_lending_per_book",
            "book_id",
            unique=True,
            postgresql_where=(returned_at.is_(None)),
        ),
    )


class ActivityEvent(db.Model):
    """One row per event that happened."""
    __tablename__ = "activity_events"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    actor_id = db.Column(UUID(as_uuid=False), db.ForeignKey("users.id"), nullable=False)
    type = db.Column(db.Enum(ActivityType), nullable=False)
    message = db.Column(db.String(500), nullable=False)
    shelf_id = db.Column(UUID(as_uuid=False), db.ForeignKey("shelves.id"), nullable=True)
    book_id = db.Column(UUID(as_uuid=False), db.ForeignKey("books.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)


class ActivityRecipient(db.Model):
    """Fan-out row: who should see this event (their own feed + the socket
    gateway both query this table). Avoids re-deriving 'who has access to
    this shelf' on every feed read or every socket emit."""
    __tablename__ = "activity_recipients"

    id = db.Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    event_id = db.Column(UUID(as_uuid=False), db.ForeignKey("activity_events.id"), nullable=False, index=True)
    user_id = db.Column(UUID(as_uuid=False), db.ForeignKey("users.id"), nullable=False, index=True)

    event = db.relationship("ActivityEvent")