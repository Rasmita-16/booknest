"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiJson, ApiError } from "../../../../lib/api";
import { getSocket } from "../../../../lib/socket";

interface ShelfBookBrief {
  id: string;
  title: string;
  author: string;
  status: string;
}

interface ShelfShare {
  user_id: string;
  email: string;
  name: string;
  role: "editor" | "viewer";
}

interface ShelfDetail {
  id: string;
  name: string;
  owner_id: string;
  role: "owner" | "editor" | "viewer";
  book_count: number;
  books: ShelfBookBrief[];
  created_at: string;
  shares?: ShelfShare[];
}

interface MyBook {
  id: string;
  title: string;
  author: string;
}

export default function ShelfDetailPage() {
  const params = useParams();
  const router = useRouter();
  const shelfId = params.id as string;

  const [shelf, setShelf] = useState<ShelfDetail | null>(null);
  const [myBooks, setMyBooks] = useState<MyBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [selectedBookId, setSelectedBookId] = useState("");
  const [addingBook, setAddingBook] = useState(false);

  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<"editor" | "viewer">("viewer");
  const [sharing, setSharing] = useState(false);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const [shelfData, booksData] = await Promise.all([
        apiJson<ShelfDetail>(`/shelves/${shelfId}`),
        apiJson<{ items: MyBook[] }>(`/books?per_page=100`),
      ]);
      setShelf(shelfData);
      setMyBooks(booksData.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load this shelf.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelfId]);

  // Live updates (item 28): when an editor adds/removes a book on this
  // shelf, everyone else currently viewing it sees it instantly — the
  // socket event just triggers a re-fetch rather than hand-patching
  // local state, which keeps this simple and always-correct.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function handleShelfChange(data: { shelf_id: string }) {
      if (data.shelf_id === shelfId) {
        fetchAll();
      }
    }

    socket.on("shelf:book_added", handleShelfChange);
    socket.on("shelf:book_removed", handleShelfChange);

    return () => {
      socket.off("shelf:book_added", handleShelfChange);
      socket.off("shelf:book_removed", handleShelfChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelfId]);

  const canEdit = shelf?.role === "owner" || shelf?.role === "editor";
  const isOwner = shelf?.role === "owner";
  const booksNotOnShelf = myBooks.filter((b) => !shelf?.books.some((sb) => sb.id === b.id));

  async function handleAddBook(e: FormEvent) {
    e.preventDefault();
    if (!selectedBookId) return;
    setActionError(null);
    setAddingBook(true);
    try {
      await apiJson(`/shelves/${shelfId}/books`, {
        method: "POST",
        body: JSON.stringify({ book_id: selectedBookId }),
      });
      setSelectedBookId("");
      fetchAll();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't add that book.");
    } finally {
      setAddingBook(false);
    }
  }

  async function handleRemoveBook(bookId: string) {
    setActionError(null);
    try {
      await apiJson(`/shelves/${shelfId}/books/${bookId}`, { method: "DELETE" });
      fetchAll();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't remove that book.");
    }
  }

  async function handleShare(e: FormEvent) {
    e.preventDefault();
    if (!shareEmail.trim()) {
      setActionError("Email is required");
      return;
    }
    setActionError(null);
    setSharing(true);
    try {
      await apiJson(`/shelves/${shelfId}/share`, {
        method: "POST",
        body: JSON.stringify({ email: shareEmail.trim(), role: shareRole }),
      });
      setShareEmail("");
      fetchAll();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't share this shelf.");
    } finally {
      setSharing(false);
    }
  }

  async function handleRoleChange(userId: string, role: "editor" | "viewer") {
    setActionError(null);
    try {
      await apiJson(`/shelves/${shelfId}/share/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      fetchAll();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't update that role.");
    }
  }

  async function handleRemoveCollaborator(userId: string) {
    if (!confirm("Remove this collaborator's access?")) return;
    setActionError(null);
    try {
      await apiJson(`/shelves/${shelfId}/share/${userId}`, { method: "DELETE" });
      fetchAll();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't remove that collaborator.");
    }
  }

  async function handleDeleteShelf() {
    if (!shelf) return;
    if (!confirm(`Delete "${shelf.name}"? The books on it will NOT be deleted.`)) return;
    try {
      await apiJson(`/shelves/${shelfId}`, { method: "DELETE" });
      router.push("/shelves");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't delete this shelf.");
    }
  }

  if (loading) {
    return <p className="text-center text-sm text-neutral-500">Loading shelf…</p>;
  }

  if (error || !shelf) {
    return (
      <div>
        <p className="text-center text-sm text-red-600">{error || "Shelf not found."}</p>
        <div className="mt-4 text-center">
          <Link href="/shelves" className="text-sm font-medium text-neutral-900 hover:underline">
            ← Back to shelves
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link href="/shelves" className="text-sm text-neutral-500 hover:underline">
        ← Back to shelves
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{shelf.name}</h1>
          <p className="text-sm text-neutral-500">
            {shelf.book_count} book{shelf.book_count !== 1 ? "s" : ""} · your role: {shelf.role}
          </p>
        </div>
        {isOwner && (
          <button
            onClick={handleDeleteShelf}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete shelf
          </button>
        )}
      </div>

      {actionError && (
        <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>
      )}

      {canEdit && (
        <form onSubmit={handleAddBook} className="mt-6 flex gap-3 rounded-lg border border-neutral-200 bg-white p-4">
          <select
            value={selectedBookId}
            onChange={(e) => setSelectedBookId(e.target.value)}
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">Choose one of your books to add…</option>
            {booksNotOnShelf.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} — {b.author}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={addingBook || !selectedBookId}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {addingBook ? "Adding…" : "Add to shelf"}
          </button>
        </form>
      )}

      <div className="mt-6 rounded-lg border border-neutral-200 bg-white px-4">
        {shelf.books.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">No books on this shelf yet.</p>
        ) : (
          shelf.books.map((book) => (
            <div
              key={book.id}
              className="flex items-center justify-between border-b border-neutral-200 py-3 last:border-b-0"
            >
              <div>
                <p className="font-medium text-neutral-900">{book.title}</p>
                <p className="text-sm text-neutral-500">{book.author}</p>
              </div>
              {canEdit && (
                <button
                  onClick={() => handleRemoveBook(book.id)}
                  className="rounded-md border border-red-200 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {isOwner && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Sharing</h2>

          <form onSubmit={handleShare} className="mt-3 flex flex-wrap gap-3 rounded-lg border border-neutral-200 bg-white p-4">
            <input
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              placeholder="Collaborator's email"
              className="min-w-[200px] flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <select
              value={shareRole}
              onChange={(e) => setShareRole(e.target.value as "editor" | "viewer")}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button
              type="submit"
              disabled={sharing}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {sharing ? "Sharing…" : "Share"}
            </button>
          </form>

          <div className="mt-4 rounded-lg border border-neutral-200 bg-white px-4">
            {!shelf.shares || shelf.shares.length === 0 ? (
              <p className="py-6 text-center text-sm text-neutral-500">Not shared with anyone yet.</p>
            ) : (
              shelf.shares.map((share) => (
                <div
                  key={share.user_id}
                  className="flex items-center justify-between border-b border-neutral-200 py-3 last:border-b-0"
                >
                  <div>
                    <p className="font-medium text-neutral-900">{share.name}</p>
                    <p className="text-sm text-neutral-500">{share.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={share.role}
                      onChange={(e) => handleRoleChange(share.user_id, e.target.value as "editor" | "viewer")}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </select>
                    <button
                      onClick={() => handleRemoveCollaborator(share.user_id)}
                      className="rounded-md border border-red-200 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}