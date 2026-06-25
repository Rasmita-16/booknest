"use client";

import { useEffect, useState, FormEvent } from "react";
import { apiJson, ApiError } from "../../../lib/api";

interface Book {
  id: string;
  title: string;
  author: string;
  status: "want_to_read" | "reading" | "finished";
  total_pages: number | null;
  current_page: number;
  progress_percent: number | null;
  rating: number | null;
  notes: string | null;
  finished_at: string | null;
  created_at: string;
}

interface BooksResponse {
  items: Book[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "want_to_read", label: "Want to Read" },
  { value: "reading", label: "Reading" },
  { value: "finished", label: "Finished" },
];

const SORT_OPTIONS = [
  { value: "created_at", label: "Date added" },
  { value: "title", label: "Title" },
  { value: "rating", label: "Rating" },
];

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newTotalPages, setNewTotalPages] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Debounce search input — wait until the person stops typing for
  // 400ms before firing a request, instead of one per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  async function fetchBooks() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("sort_by", sortBy);
      params.set("sort_dir", sortDir);
      params.set("page", String(page));
      params.set("per_page", "10");

      const data = await apiJson<BooksResponse>(`/books?${params.toString()}`);
      setBooks(data.items);
      setTotalPages(data.total_pages || 1);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your books.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, debouncedSearch, sortBy, sortDir, page]);

  async function handleAddBook(e: FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newAuthor.trim()) {
      setAddError("Title and author are required");
      return;
    }
    setAddError(null);
    setAdding(true);
    try {
      await apiJson("/books", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim(),
          author: newAuthor.trim(),
          total_pages: newTotalPages ? parseInt(newTotalPages, 10) : null,
        }),
      });
      setNewTitle("");
      setNewAuthor("");
      setNewTotalPages("");
      setShowAddForm(false);
      setPage(1);
      fetchBooks();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Couldn't add the book.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Your books</h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          {showAddForm ? "Cancel" : "Add a book"}
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleAddBook}
          className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-4"
        >
          {addError && (
            <div className="col-span-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{addError}</div>
          )}
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Title"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <input
            value={newAuthor}
            onChange={(e) => setNewAuthor(e.target.value)}
            placeholder="Author"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            value={newTotalPages}
            onChange={(e) => setNewTotalPages(e.target.value)}
            placeholder="Total pages (optional)"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={adding}
            className="col-span-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 sm:w-fit"
          >
            {adding ? "Adding…" : "Add book"}
          </button>
        </form>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or author…"
          className="min-w-[200px] flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Sort by {opt.label}
            </option>
          ))}
        </select>

        <button
          onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
          title="Toggle sort direction"
        >
          {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
        </button>
      </div>

      <div className="mt-6 rounded-lg border border-neutral-200 bg-white px-4">
        {loading ? (
          <p className="py-8 text-center text-sm text-neutral-500">Loading your books…</p>
        ) : error ? (
          <p className="py-8 text-center text-sm text-red-600">{error}</p>
        ) : books.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">
            No books match your filters yet — try adding one above.
          </p>
        ) : (
          books.map((book) => <BookRow key={book.id} book={book} onChanged={fetchBooks} />)
        )}
      </div>

      {!loading && !error && total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-neutral-500">
          <span>
            {total} book{total !== 1 ? "s" : ""} — page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-neutral-300 px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-neutral-300 px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BookRow({ book, onChanged }: { book: Book; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [totalPages, setTotalPages] = useState(book.total_pages?.toString() ?? "");
  const [currentPage, setCurrentPage] = useState(book.current_page.toString());
  const [rating, setRating] = useState(book.rating?.toString() ?? "");
  const [notes, setNotes] = useState(book.notes ?? "");
  const [status, setStatus] = useState(book.status);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetFields() {
    setTitle(book.title);
    setAuthor(book.author);
    setTotalPages(book.total_pages?.toString() ?? "");
    setCurrentPage(book.current_page.toString());
    setRating(book.rating?.toString() ?? "");
    setNotes(book.notes ?? "");
    setStatus(book.status);
    setError(null);
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        author: author.trim(),
        total_pages: totalPages ? parseInt(totalPages, 10) : null,
        rating: rating ? parseInt(rating, 10) : null,
        notes: notes.trim() || null,
      };

      // The backend treats current_page and status together as one
      // decision (logging progress can auto-flip status to Finished),
      // so only send the one the person actually changed.
      const currentPageNum = parseInt(currentPage, 10);
      if (!isNaN(currentPageNum) && currentPageNum !== book.current_page) {
        payload.current_page = currentPageNum;
      } else if (status !== book.status) {
        payload.status = status;
      }

      await apiJson(`/books/${book.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${book.title}"? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await apiJson(`/books/${book.id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete this book.");
      setDeleting(false);
    }
  }

  const statusLabel: Record<Book["status"], string> = {
    want_to_read: "Want to Read",
    reading: "Reading",
    finished: "Finished",
  };

  const statusColor: Record<Book["status"], string> = {
    want_to_read: "bg-neutral-100 text-neutral-700",
    reading: "bg-blue-50 text-blue-700",
    finished: "bg-green-50 text-green-700",
  };

  return (
    <div className="border-b border-neutral-200 py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-neutral-900">{book.title}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[book.status]}`}>
              {statusLabel[book.status]}
            </span>
          </div>
          <p className="text-sm text-neutral-500">{book.author}</p>

          {book.total_pages != null && (
            <div className="mt-2 max-w-xs">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-neutral-800"
                  style={{ width: `${book.progress_percent ?? 0}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-neutral-400">
                {book.current_page} / {book.total_pages} pages ({book.progress_percent ?? 0}%)
              </p>
            </div>
          )}

          {book.rating != null && (
            <p className="mt-1 text-sm text-amber-500">
              {"★".repeat(book.rating)}
              {"☆".repeat(5 - book.rating)}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => {
              if (editing) resetFields();
              setEditing(!editing);
            }}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-neutral-50 p-4 sm:grid-cols-2">
          {error && (
            <div className="col-span-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-600">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600">Author</label>
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600">Total pages</label>
            <input
              type="number"
              min={1}
              value={totalPages}
              onChange={(e) => setTotalPages(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600">Current page</label>
            <input
              type="number"
              min={0}
              value={currentPage}
              onChange={(e) => setCurrentPage(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <p className="mt-1 text-xs text-neutral-400">Reaching the last page auto-marks it Finished.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Book["status"])}
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="want_to_read">Want to Read</option>
              <option value="reading">Reading</option>
              <option value="finished">Finished</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600">Rating (1–5)</label>
            <select
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="">No rating</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-full">
            <label className="block text-xs font-medium text-neutral-600">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div className="col-span-full flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}