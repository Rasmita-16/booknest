"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../../lib/auth-context";
import { apiJson, ApiError } from "../../../lib/api";
import { getSocket } from "../../../lib/socket";

interface ActivityItem {
  id: string;
  type: string;
  message: string;
  created_at: string;
}

interface DashboardData {
  counts_by_status: { want_to_read: number; reading: number; finished: number };
  finished_this_year: number;
  average_rating: number | null;
  busiest_shelf: string | null;
  currently_lent_out: number;
  shelves_shared_with_me: number;
  recent_activity: ActivityItem[];
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchDashboard() {
    setLoading(true);
    setError(null);
    try {
      const result = await apiJson<DashboardData>("/dashboard");
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboard();
  }, []);

  // Live updates (item 29): a new activity event for this user gets
  // pushed straight into the feed, no refresh needed. Other stat cards
  // (counts, lent-out total, etc.) refresh too, since most activity
  // types change at least one of them.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function handleNewActivity(event: ActivityItem) {
      setData((prev) =>
        prev
          ? {
              ...prev,
              recent_activity: [event, ...prev.recent_activity].slice(0, 10),
            }
          : prev
      );
      fetchDashboard();
    }

    socket.on("activity:new", handleNewActivity);
    return () => {
      socket.off("activity:new", handleNewActivity);
    };
  }, []);

  if (loading) {
    return <p className="text-center text-sm text-neutral-500">Loading your dashboard…</p>;
  }

  if (error || !data) {
    return <p className="text-center text-sm text-red-600">{error || "Something went wrong."}</p>;
  }

  const stats = [
    { label: "Want to read", value: data.counts_by_status.want_to_read },
    { label: "Reading", value: data.counts_by_status.reading },
    { label: "Finished", value: data.counts_by_status.finished },
    { label: "Finished this year", value: data.finished_this_year },
    { label: "Average rating", value: data.average_rating ?? "—" },
    { label: "Busiest shelf", value: data.busiest_shelf ?? "—" },
    { label: "Currently lent out", value: data.currently_lent_out },
    { label: "Shelves shared with me", value: data.shelves_shared_with_me },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-neutral-900">Welcome back, {user?.name}.</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="text-2xl font-semibold text-neutral-900">{s.value}</p>
            <p className="mt-1 text-xs text-neutral-500">{s.label}</p>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Recent activity</h2>
        <div className="mt-3 rounded-lg border border-neutral-200 bg-white px-4">
          {data.recent_activity.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">Nothing yet — start adding books.</p>
          ) : (
            data.recent_activity.map((item) => (
              <div key={item.id} className="border-b border-neutral-200 py-3 last:border-b-0">
                <p className="text-sm text-neutral-900">{item.message}</p>
                <p className="text-xs text-neutral-400">{new Date(item.created_at).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}