"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";

import { ApiRequestError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth-context";

interface InvitationPreview {
  college: { id: string; name: string };
  roles: string[];
  sentTo: string;
  accountExists: boolean;
  expiresAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  CA: "College Administrator",
  PR: "Principal",
  TC: "Timetable Coordinator",
  HOD: "Head of Department",
  TE: "Teacher",
  ST: "Student",
};

export default function InvitationsPage() {
  const { api, user } = useAuth();

  const [token, setToken] = useState<string>("");
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // New user form fields
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const loadPreview = useCallback(
    async (inviteToken: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.request<InvitationPreview>("/auth/invitations/preview", {
          method: "POST",
          body: { token: inviteToken },
        });
        setPreview(data);
      } catch (err) {
        if (err instanceof ApiRequestError) setError(err.message);
        else setError("Invalid or expired invitation link.");
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    // Extract token from hash `#token=...` or query `?token=...`
    let t = "";
    if (window.location.hash.startsWith("#token=")) {
      t = decodeURIComponent(window.location.hash.slice("#token=".length));
    } else {
      const urlParams = new URLSearchParams(window.location.search);
      t = urlParams.get("token") ?? "";
    }

    if (t) {
      setToken(t);
      void loadPreview(t);
    } else {
      setLoading(false);
      setError("No invitation token found in URL. Please check your invitation link.");
    }
  }, [loadPreview]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await api.request("/auth/invitations/accept", {
        method: "POST",
        body: {
          token,
          ...(preview?.accountExists ? {} : { name: name.trim(), password }),
        },
      });
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.message);
      else setError("Failed to accept invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-md py-16 text-center text-ink-muted">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
        <p className="mt-3 text-sm">Validating invitation link...</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Invitation Accepted!</h1>
          <p className="mt-2 text-sm text-ink-muted">
            You are now an active member of <strong className="text-ink">{preview?.college.name}</strong>.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Sign in to your account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <div className="rounded-xl border border-line bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-primary mb-2">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </span>
          <h1 className="text-xl font-bold tracking-tight text-ink">College Membership Invitation</h1>
          <p className="mt-1 text-sm text-ink-muted">You have been invited to join an academic workspace.</p>
        </div>

        {error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800" role="alert">
            {error}
          </div>
        )}

        {preview && (
          <div className="space-y-5">
            <div className="rounded-lg border border-line bg-surface p-4 text-xs space-y-2">
              <div>
                <span className="text-ink-muted block text-[11px] font-semibold uppercase">Institution</span>
                <span className="text-sm font-bold text-ink">{preview.college.name}</span>
              </div>
              <div>
                <span className="text-ink-muted block text-[11px] font-semibold uppercase">Assigned Roles</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {preview.roles.map((r) => (
                    <span key={r} className="rounded-full bg-white px-2 py-0.5 font-medium text-ink border border-line">
                      {ROLE_LABELS[r] ?? r}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-ink-muted block text-[11px] font-semibold uppercase">Sent To</span>
                <span className="font-mono text-ink">{preview.sentTo}</span>
              </div>
            </div>

            <form onSubmit={handleAccept} className="space-y-4">
              {preview.accountExists ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900">
                  {user ? (
                    <p>You are signed in as <strong>{user.name}</strong>. Click below to add this membership to your account.</p>
                  ) : (
                    <p>An account with this email/mobile already exists. Please <Link href="/login" className="font-bold underline">Sign in first</Link>, then revisit this link to accept.</p>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="user-name" className="block text-xs font-semibold text-ink uppercase tracking-wider">
                      Your Full Name *
                    </label>
                    <input
                      id="user-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Dr. Harpreet Kaur"
                      className="mt-1.5 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="user-password" className="block text-xs font-semibold text-ink uppercase tracking-wider">
                      Choose a Password (min 10 characters) *
                    </label>
                    <input
                      id="user-password"
                      type="password"
                      required
                      minLength={10}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="mt-1.5 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={submitting || (preview.accountExists && !user)}
                className="w-full flex h-10 items-center justify-center rounded-lg bg-primary font-medium text-white transition hover:bg-primary-hover disabled:opacity-50 text-sm"
              >
                {submitting ? "Accepting..." : "Accept Invitation & Join College"}
              </button>
            </form>
          </div>
        )}

        <div className="mt-6 border-t border-line pt-4 text-center text-xs text-ink-muted">
          <Link href="/" className="hover:underline">
            Return to Timetable Home
          </Link>
        </div>
      </div>
    </div>
  );
}
