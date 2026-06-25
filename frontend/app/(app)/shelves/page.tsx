"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { apiJson, ApiError } from "../../../lib/api";

interface ShelfSummary {
  id: string;
  name: string;
  owner_id: string;
  role: string;
  book_count: number;
  created_at: string;
}

export default function ShelvesPage() {
  const [myShelves, setMyShelves] = useState<ShelfSummary[]>([]);
  const [sharedShelves, setSharedShelves] = useState<ShelfSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function fetchShelves() {
    setLoading(true);
    setError(null);
    try {
      const [mine, shared] = await Promise.all([
        apiJson<{ shelves: ShelfSummary[] }>("/shelves"),
        apiJson<{ shelves: ShelfSummary[] }>("/shelves/shared-with-me"),
      ]);
      setMyShelves(mine.shelves);
      setSharedShelves(shared.shelves);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your shelves.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchShelves();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) {
      setCreateError("Shelf name is required");
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      await apiJson("/shelves", { method: "POST", body: JSON.stringify({ name: newName.trim() }) });
      setNewName("");
      setShowCreateForm(false);
      fetchShelves();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Couldn't create the shelf.");
    } finally {
      setCreating(false);
    }
  }

  const roleColor: Record<string, string> = {
    owner: "bg-neutral-100 text-neutral-700",
    editor: "bg-blue-50 text-blue-700",
    viewer: "bg-amber-50 text-amber-700",
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Your shelves</h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          {showCreateForm ? "Cancel" : "New shelf"}
        </button>
      </div>

      {showCreateForm && (
        <form onSubmit={handleCreate} className="mt-4 flex gap-3 rounded-lg border border-neutral-200 bg-white p-4">
          {createError && (
            <div className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</div>
          )}
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Shelf name"
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="mt-8 text-center text-sm text-neutral-500">Loading shelves…</p>
      ) : error ? (
        <p className="mt-8 text-center text-sm text-red-600">{error}</p>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">My shelves</h2>
            {myShelves.length === 0 ? (
              <p className="mt-3 text-sm text-neutral-500">You haven't created any shelves yet.</p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {myShelves.map((shelf) => (
                  <Link
                    key={shelf.id}
                    href={`/shelves/${shelf.id}`}
                    className="rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-300 hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-neutral-900">{shelf.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleColor[shelf.role]}`}>
                        {shelf.role}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">
                      {shelf.book_count} book{shelf.book_count !== 1 ? "s" : ""}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Shared with me</h2>
            {sharedShelves.length === 0 ? (
              <p className="mt-3 text-sm text-neutral-500">No one has shared a shelf with you yet.</p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sharedShelves.map((shelf) => (
                  <Link
                    key={shelf.id}
                    href={`/shelves/${shelf.id}`}
                    className="rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-300 hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-neutral-900">{shelf.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleColor[shelf.role]}`}>
                        {shelf.role}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">
                      {shelf.book_count} book{shelf.book_count !== 1 ? "s" : ""}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}