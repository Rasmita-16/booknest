"""
Seed script for BookNest.

Creates three test users, sample books, a shelf shared with both an
editor and a viewer, and one active lending — so the sharing and
borrowing flows can be tested immediately on a fresh clone.

This drops and recreates all tables, so it's safe to re-run any time
you want to reset to a known, clean demo state.

Run with:
    python seed.py
(from the backend/ folder, with your virtual environment activated)
"""

from datetime import datetime

from app import create_app
from app.extensions import db, bcrypt
from app.models import (
    User,
    Book,
    BookStatus,
    Shelf,
    ShelfBook,
    ShelfShare,
    ShelfRole,
    Lending,
)

app = create_app()

with app.app_context():
    db.drop_all()
    db.create_all()

    # --- Users -----------------------------------------------------
    alice = User(
        name="Alice Owner",
        email="alice@example.com",
        password_hash=bcrypt.generate_password_hash("password123").decode(),
    )
    bob = User(
        name="Bob Collaborator",
        email="bob@example.com",
        password_hash=bcrypt.generate_password_hash("password123").decode(),
    )
    carol = User(
        name="Carol Viewer",
        email="carol@example.com",
        password_hash=bcrypt.generate_password_hash("password123").decode(),
    )
    db.session.add_all([alice, bob, carol])
    db.session.commit()

    # --- Books (owned by Alice) -------------------------------------
    dune = Book(
        owner_id=alice.id,
        title="Dune",
        author="Frank Herbert",
        status=BookStatus.READING,
        total_pages=412,
        current_page=150,
    )
    hobbit = Book(
        owner_id=alice.id,
        title="The Hobbit",
        author="J.R.R. Tolkien",
        status=BookStatus.FINISHED,
        total_pages=310,
        current_page=310,
        rating=5,
        finished_at=datetime.utcnow(),
    )
    foundation = Book(
        owner_id=alice.id,
        title="Foundation",
        author="Isaac Asimov",
        status=BookStatus.WANT_TO_READ,
    )

    # A book owned by Bob too, so as an editor he has something of his
    # own he can add to the shared shelf during the demo.
    name_of_wind = Book(
        owner_id=bob.id,
        title="The Name of the Wind",
        author="Patrick Rothfuss",
        status=BookStatus.WANT_TO_READ,
    )

    db.session.add_all([dune, hobbit, foundation, name_of_wind])
    db.session.commit()

    # --- Shelf, shared with both an editor and a viewer --------------
    shelf = Shelf(owner_id=alice.id, name="Sci-Fi & Fantasy Favorites")
    db.session.add(shelf)
    db.session.commit()

    db.session.add_all(
        [
            ShelfBook(shelf_id=shelf.id, book_id=dune.id),
            ShelfBook(shelf_id=shelf.id, book_id=foundation.id),
        ]
    )
    db.session.add_all(
        [
            ShelfShare(shelf_id=shelf.id, user_id=bob.id, role=ShelfRole.EDITOR),
            ShelfShare(shelf_id=shelf.id, user_id=carol.id, role=ShelfRole.VIEWER),
        ]
    )
    db.session.commit()

    # --- One active lending: Alice lends "The Hobbit" to Carol --------
    lending = Lending(book_id=hobbit.id, lender_id=alice.id, borrower_id=carol.id)
    db.session.add(lending)
    db.session.commit()

    print("Seed data created:")
    print("  alice@example.com / password123  (owner)")
    print("  bob@example.com   / password123  (editor on 'Sci-Fi & Fantasy Favorites')")
    print("  carol@example.com / password123  (viewer on the same shelf, borrowed 'The Hobbit')")