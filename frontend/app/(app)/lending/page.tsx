"use client";

import { useEffect, useState, FormEvent } from "react";
import { apiJson, ApiError } from "../../../lib/api";
import { getSocket } from "../../../lib/socket";

interface LendingPerson {
  id: string;
  name: string;
  email: string;
}

interface LendingBookBrief {
  id: string;
  title: string;
  author: string;
}

interface Lending {
  id: string;
  book: LendingBookBrief;
  lender: LendingPerson | null;
  borrower: LendingPerson | null;
  lent_at: string;
  returned_at: string | null;
}

interface MyBook {
  id: string;
  title: string;
  author: string;
}

export default function LendingPage() {
  const [borrowed, setBorrowed] = useState<Lending[]>([]);
  const [lentOut, setLentOut] = useState<Lending[]>([]);
  const [myBooks, setMyBooks] = useState<MyBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [selectedBookId, setSelectedBookId] = useState("");
  const [borrowerEmail, setBorrowerEmail] = useState("");
  const [lendingSubmitting, setLendingSubmitting] = useState(false);
  const [lendError, setLendError] = useState<string | null>(null);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const [borrowedData, lentData, booksData] = await Promise.all([
        apiJson<{ lendings: Lending[] }>("/lendings/borrowed"),
        apiJson<{ lendings: Lending[] }>("/lendings/lent-out"),
        apiJson<{ items: MyBook[] }>("/books?per_page=100"),
      ]);
      setBorrowed(borrowedData.lendings);
      setLentOut(lentData.lendings);
      setMyBooks(booksData.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load lending info.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, []);

  // Live updates (item 27): when someone lends you a book, or the
  // lender marks it returned, this view updates with no refresh.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function handleLendingChange() {
      fetchAll();
    }

    socket.on("lending:created", handleLendingChange);
    socket.on("lending:returned", handleLendingChange);

    return () => {
      socket.off("lending:created", handleLendingChange);
      socket.off("lending:returned", handleLendingChange);
    };
  }, []);

  // A book already lent out shouldn't be offered again in the dropdown —
  // the backend would reject it anyway, but filtering it client-side
  // avoids the round trip and the confusing error for an obvious case.
  const lentOutBookIds = new Set(lentOut.map((l) => l.book.id));
  const availableBooks = myBooks.filter((b) => !lentOutBookIds.has(b.id));

  async function handleLend(e: FormEvent) {
    e.preventDefault();
    if (!selectedBookId || !borrowerEmail.trim()) {
      setLendError("Choose a book and enter the borrower's email");
      return;
    }
    setLendError(null);
    setLendingSubmitting(true);
    try {
      await apiJson("/lendings", {
        method: "POST",
        body: JSON.stringify({ book_id: selectedBookId, borrower_email: borrowerEmail.trim() }),
      });
      setSelectedBookId("");
      setBorrowerEmail("");
      fetchAll();
    } catch (err) {
      setLendError(err instanceof ApiError ? err.message : "Couldn't lend that book.");
    } finally {
      setLendingSubmitting(false);
    }
  }

  async function handleReturn(lendingId: string) {
    setActionError(null);
    try {
      await apiJson(`/lendings/${lendingId}/return`, { method: "PATCH" });
      fetchAll();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't mark this as returned.");
    }
  }

  if (loading) {
    return <p className="text-center text-sm text-neutral-500">Loading lending info…</p>;
  }

  if (error) {
    return <p className="text-center text-sm text-red-600">{error}</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-neutral-900">Lending</h1>

      {actionError && (
        <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Lend a book</h2>
        <form
          onSubmit={handleLend}
          className="mt-3 flex flex-wrap gap-3 rounded-lg border border-neutral-200 bg-white p-4"
        >
          {lendError && (
            <div className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{lendError}</div>
          )}
          <select
            value={selectedBookId}
            onChange={(e) => setSelectedBookId(e.target.value)}
            className="min-w-[200px] flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">Choose a book to lend…</option>
            {availableBooks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} — {b.author}
              </option>
            ))}
          </select>
          <input
            value={borrowerEmail}
            onChange={(e) => setBorrowerEmail(e.target.value)}
            placeholder="Borrower's email"
            className="min-w-[200px] flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={lendingSubmitting}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {lendingSubmitting ? "Lending…" : "Lend"}
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Borrowed from others</h2>
        <div className="mt-3 rounded-lg border border-neutral-200 bg-white px-4">
          {borrowed.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">You haven't borrowed anything.</p>
          ) : (
            borrowed.map((l) => (
              <div key={l.id} className="flex items-center justify-between border-b border-neutral-200 py-3 last:border-b-0">
                <div>
                  <p className="font-medium text-neutral-900">{l.book.title}</p>
                  <p className="text-sm text-neutral-500">
                    by {l.book.author} · lent by {l.lender?.name ?? "unknown"}
                  </p>
                </div>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                  read-only
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Lent out</h2>
        <div className="mt-3 rounded-lg border border-neutral-200 bg-white px-4">
          {lentOut.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">You haven't lent anything out.</p>
          ) : (
            lentOut.map((l) => (
              <div key={l.id} className="flex items-center justify-between border-b border-neutral-200 py-3 last:border-b-0">
                <div>
                  <p className="font-medium text-neutral-900">{l.book.title}</p>
                  <p className="text-sm text-neutral-500">
                    by {l.book.author} · borrowed by {l.borrower?.name ?? "unknown"} ({l.borrower?.email})
                  </p>
                </div>
                <button
                  onClick={() => handleReturn(l.id)}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Mark returned
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}