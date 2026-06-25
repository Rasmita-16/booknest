const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

// Access token lives only in memory — never localStorage, never a
// cookie the frontend manages itself. A page refresh loses it on
// purpose; the silent-refresh flow in auth-context.tsx gets a new one
// from the httpOnly refresh cookie instead.
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
}

async function rawRequest(path: string, options: ApiOptions = {}) {
  const headers = new Headers(options.headers);
  if (!options.skipAuth && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include", // always sends the httpOnly refresh cookie
  });
}

// The refresh endpoint needs the refresh cookie (sent automatically by
// the browser) plus a matching CSRF header read from the separate,
// non-httpOnly CSRF cookie the backend sets alongside it — the
// "double submit cookie" pattern that protects against CSRF on an
// endpoint a cookie alone can trigger.
export async function refreshAccessToken(): Promise<boolean> {
  const csrfToken = getCookie("csrf_refresh_token");
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: csrfToken ? { "X-CSRF-TOKEN": csrfToken } : {},
  });

  if (!res.ok) return false;

  const data = await res.json();
  setAccessToken(data.access_token);
  return true;
}

export async function logoutRequest(): Promise<void> {
  const csrfToken = getCookie("csrf_refresh_token");
  await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: csrfToken ? { "X-CSRF-TOKEN": csrfToken } : {},
  }).catch(() => {});
}

export async function apiRequest(path: string, options: ApiOptions = {}) {
  let res = await rawRequest(path, options);

  // Item 5: an expired access token returns 401, and the client
  // transparently refreshes and retries — the caller never sees it.
  if (res.status === 401 && !options.skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await rawRequest(path, options);
    }
  }

  return res;
}

export async function apiJson<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const res = await apiRequest(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || "Something went wrong", res.status);
  }
  return data as T;
}