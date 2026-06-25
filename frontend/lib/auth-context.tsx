"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiJson, setAccessToken, refreshAccessToken, logoutRequest, ApiError } from "./api";
import { connectSocket, disconnectSocket } from "./socket";

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function tryRestoreSession() {
      try {
        const ok = await refreshAccessToken();
        if (!ok) throw new Error("no session");
        const me = await apiJson<User>("/auth/me");
        setUser(me);
        connectSocket();
      } catch {
        setAccessToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    tryRestoreSession();

    return () => {
      disconnectSocket();
    };
  }, []);

  async function login(email: string, password: string) {
    const data = await apiJson<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });
    setAccessToken(data.access_token);
    setUser(data.user);
    connectSocket();
  }

  async function signup(name: string, email: string, password: string) {
    const data = await apiJson<{ access_token: string; user: User }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
      skipAuth: true,
    });
    setAccessToken(data.access_token);
    setUser(data.user);
    connectSocket();
  }

  async function logout() {
    await logoutRequest();
    disconnectSocket();
    setAccessToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };