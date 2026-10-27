"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { apiBaseUrlFromEnv, createApiClient, type ApiClient, ApiRequestError } from "./api/client";
import { singleFlight } from "./single-flight";

export interface AuthUser {
  id: string;
  name: string;
  email?: string;
  mobile?: string;
  platformRoles: string[];
}

export interface AuthMembership {
  collegeId: string;
  collegeName: string;
  roles: string[];
  status: "active" | "suspended";
}

export interface LoginResult {
  twoStepRequired?: boolean;
  challengeToken?: string;
  user?: AuthUser;
  memberships?: AuthMembership[];
}

export interface AuthContextValue {
  status: "loading" | "authenticated" | "unauthenticated";
  user: AuthUser | null;
  memberships: AuthMembership[];
  activeCollege: AuthMembership | null;
  api: ApiClient;
  login: (identifier: string, password: string) => Promise<LoginResult>;
  verifyMfa: (challengeToken: string, code: string) => Promise<{ user?: AuthUser; memberships?: AuthMembership[] }>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  selectCollege: (collegeId: string) => void;
  refreshSession: () => Promise<boolean>;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  // The client reads the token from this ref, so a new token does not create a new client (and with
  // it new callbacks that would refresh again).
  const tokenRef = useRef<string | null>(null);
  const setToken = useCallback((next: string | null) => {
    tokenRef.current = next;
    setTokenState(next);
  }, []);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [memberships, setMemberships] = useState<AuthMembership[]>([]);
  const [activeCollegeId, setActiveCollegeId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");

  const baseUrl = useMemo(() => apiBaseUrlFromEnv() ?? "http://localhost:4000", []);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl,
        // Cookies only go with the calls under /auth that set or use the refresh cookie (below);
        // every other API call is bearer-only, and the API refuses credentials there (CORS).
        getToken: () => tokenRef.current,
      }),
    [baseUrl],
  );

  const loadMe = useCallback(
    async (accessToken: string): Promise<{ user: AuthUser; memberships: AuthMembership[] } | null> => {
      try {
        const data = await api.request<{
          user: AuthUser;
          memberships: AuthMembership[];
        }>("/me", { token: accessToken });
        setUser(data.user);
        setMemberships(data.memberships);
        if (data.memberships.length > 0) {
          setActiveCollegeId((current) => current ?? data.memberships[0]!.collegeId);
        }
        setStatus("authenticated");
        return { user: data.user, memberships: data.memberships };
      } catch {
        setToken(null);
        setUser(null);
        setMemberships([]);
        setStatus("unauthenticated");
        return null;
      }
    },
    [api, setToken],
  );

  const refreshSession = useMemo(
    () =>
      singleFlight(async (): Promise<boolean> => {
        try {
          const data = await api.request<{ accessToken: string }>("/auth/refresh", {
            method: "POST",
            credentials: "include",
            csrfProtection: true,
          });
          if (data.accessToken) {
            setToken(data.accessToken);
            await loadMe(data.accessToken);
            return true;
          }
        } catch {
          // Refresh failed (no cookie or expired)
        }
        setToken(null);
        setUser(null);
        setMemberships([]);
        setStatus("unauthenticated");
        return false;
      }),
    [api, loadMe, setToken],
  );

  // Attempt silent refresh once on mount (refreshSession is stable; overlapping calls share one run)
  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(
    async (identifier: string, password: string): Promise<LoginResult> => {
      const res = await api.request<{
        twoStep?: "required";
        challengeToken?: string;
        accessToken?: string;
        user?: AuthUser;
      }>("/auth/login", {
        method: "POST",
        credentials: "include",
        body: { identifier, password },
      });

      if (res.twoStep === "required" && res.challengeToken) {
        return { twoStepRequired: true, challengeToken: res.challengeToken };
      }

      if (res.accessToken) {
        setToken(res.accessToken);
        const me = await loadMe(res.accessToken);
        return { user: me?.user, memberships: me?.memberships };
      }

      throw new ApiRequestError(500, "login_failed", "Sign-in response missing token.");
    },
    [api, loadMe, setToken],
  );

  const verifyMfa = useCallback(
    async (challengeToken: string, code: string): Promise<{ user?: AuthUser; memberships?: AuthMembership[] }> => {
      const res = await api.request<{ accessToken: string }>("/auth/mfa/verify", {
        method: "POST",
        credentials: "include",
        body: { challengeToken, code },
      });
      if (res.accessToken) {
        setToken(res.accessToken);
        const me = await loadMe(res.accessToken);
        return { user: me?.user, memberships: me?.memberships };
      }
      return {};
    },
    [api, loadMe, setToken],
  );

  const logout = useCallback(async () => {
    try {
      await api.request("/auth/logout", {
        method: "POST",
        credentials: "include",
        csrfProtection: true,
      });
    } catch {
      // Ignore network errors on logout
    } finally {
      setToken(null);
      setUser(null);
      setMemberships([]);
      setStatus("unauthenticated");
    }
  }, [api, setToken]);

  const logoutAll = useCallback(async () => {
    try {
      if (token) {
        await api.request("/auth/logout-all", {
          method: "POST",
          credentials: "include",
          token,
        });
      }
    } catch {
      // Ignore network errors on logout
    } finally {
      setToken(null);
      setUser(null);
      setMemberships([]);
      setStatus("unauthenticated");
    }
  }, [api, token, setToken]);

  const selectCollege = useCallback((collegeId: string) => {
    setActiveCollegeId(collegeId);
  }, []);

  const activeCollege = useMemo(() => {
    if (!memberships.length) return null;
    return memberships.find((m) => m.collegeId === activeCollegeId) ?? memberships[0] ?? null;
  }, [memberships, activeCollegeId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      memberships,
      activeCollege,
      api,
      login,
      verifyMfa,
      logout,
      logoutAll,
      selectCollege,
      refreshSession,
      getAccessToken: () => token,
    }),
    [status, user, memberships, activeCollege, api, login, verifyMfa, logout, logoutAll, selectCollege, refreshSession, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
