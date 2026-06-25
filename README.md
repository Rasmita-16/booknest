# BookNest

A reading tracker where you manage books, organize them into shelves,
share shelves with other users under owner/editor/viewer roles, log
reading progress, and lend books to other registered users — with
live updates pushed over WebSockets.

## Stack

- **Frontend:** Next.js (App Router) + React + TypeScript + Tailwind CSS
- **Backend:** Python + Flask
- **Database:** PostgreSQL via SQLAlchemy + Flask-Migrate (Alembic)
- **Auth:** Flask-JWT-Extended (rotating refresh tokens) + bcrypt
- **Real-time:** Flask-SocketIO + socket.io-client

Flask was chosen for a lightweight, explicit backend where every route's
authorization logic is easy to read top-to-bottom. PostgreSQL was
chosen over MongoDB because the data is fundamentally relational
(many-to-many shelves/books, role-based shares, foreign-key-heavy
lending records) — a relational database with real constraints
(unique indexes, check constraints) enforces correctness at the DB
level, not just in application code.

## How to run it

### Backend
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1        # Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env             # edit values if needed
# create a Postgres database/user matching DATABASE_URL in .env
$env:FLASK_APP = "run.py"
flask db upgrade
python seed.py                     # creates demo users/data
python run.py                      # serves on http://localhost:5000
```

### Frontend
```powershell
cd frontend
npm install
copy .env.example .env.local       # or create manually, see below
npm run dev                        # serves on http://localhost:3000
```

`.env.local` needs:

NEXT_PUBLIC_API_URL=http://localhost:5000/api

NEXT_PUBLIC_SOCKET_URL=http://localhost:5000

### Demo accounts (after running `seed.py`)
- `alice@example.com` / `password123` — owns the demo shelf and books
- `bob@example.com` / `password123` — editor on the shared shelf
- `carol@example.com` / `password123` — viewer on the shared shelf, currently borrowing a book from Alice

## Data model

| Table | Purpose |
|---|---|
| `users` | Accounts |
| `refresh_tokens` | Hashed refresh tokens, supports rotation/revocation |
| `books` | One row per book, owned by one user |
| `shelves` | A named collection, owned by one user |
| `shelf_books` | Many-to-many join: books on shelves |
| `shelf_shares` | A user's role (editor/viewer) on a shelf they don't own |
| `lendings` | Active/historical loans; a partial unique index guarantees at most one active loan per book at the database level |
| `activity_events` / `activity_recipients` | One row per event, fanned out to exactly the users who should see it |

## Refresh token flow

The access token is returned in the JSON response body only and kept
in memory on the frontend (never localStorage, never a cookie) — it's
short-lived (15 minutes), so a leak has limited impact. The refresh
token is set as an `httpOnly` + `Secure` cookie, so client-side JS can
never read it; CSRF protection is enabled via a separate, non-httpOnly
CSRF cookie the frontend reads and sends back as a header (the "double
submit cookie" pattern). Every time `/auth/refresh` is called, the old
refresh token is immediately revoked in the database and a brand new
pair is issued — so a stolen, already-used refresh token is rejected
on its next use.

## RBAC enforcement

Every shelf-related route funnels through a single function,
`_get_role(shelf, user_id)`, which returns `"owner"`, `"editor"`,
`"viewer"`, or `None`. Owner-only actions (share, change role, remove
collaborator, delete shelf) check for `"owner"` explicitly; add/remove
book actions accept `("owner", "editor")`. Because there's exactly one
function deciding access, a viewer calling any mutating endpoint
directly — bypassing the UI entirely — gets rejected with a 403 from
the backend itself, not just hidden buttons on the frontend.

## WebSocket setup

The socket authenticates using the same JWT access token as REST
calls, sent once at connect time via the `auth` payload — there's no
separate login flow for sockets. On a successful connect, the server
joins the socket to a private room (`user:<id>`) for personal events,
plus one room per shelf the user can currently see (`shelf:<id>`), so
events are pushed only to the people who should receive them rather
than broadcast globally. If a socket disconnects, no manual cleanup is
needed — Flask-SocketIO automatically removes it from every room, and
on reconnect the client re-runs the same handshake. If reconnection
takes a moment, the app still works off the REST API, and a page
refresh always restores current state.

## What was hard (PERSONALIZE THIS — write it in your own words)

[Talk about something genuinely tricky you can explain confidently —
e.g. the refresh-token rotation + CSRF flow, or getting the
double-lend race condition right with both an app-level check and a
DB-level constraint, or scoping socket rooms correctly. Explain it the
way you'd explain it out loud in the interview.]

## Known issues / what's incomplete

- If a shelf is shared with someone *while they're already
  connected*, they won't join that shelf's socket room until their
  next reconnect (e.g. a page refresh). A more complete solution would
  have the server tell the affected client to dynamically join the
  room the moment they're shared with.
- No automated tests were added (stretch goal, skipped due to time).
- Not Dockerized (stretch goal, skipped due to time).

## What I'd improve with more time

- Automated tests around auth, RBAC enforcement, and the lending state
  machine — these are the highest-value areas to protect with tests.
- Dynamic socket room joining on share, removing the limitation above.
- Optimistic UI updates with rollback on failure.

## Where I used AI (PERSONALIZE THIS)

[Be specific and honest — e.g. "I used Claude to scaffold the Flask
blueprint structure and the Next.js pages, then read through and
adjusted X. I learned/confirmed Y about JWT refresh rotation and Z
about Postgres partial unique indexes while reviewing what it
generated." Write what's actually true for you.]