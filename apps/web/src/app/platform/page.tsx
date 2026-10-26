"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";

import { ApiRequestError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth-context";

interface PendingRegistration {
  id: string;
  name: string | { en: string; hi?: string; pa?: string };
  code: string;
  district?: string | null;
  kind?: string | null;
  status: string;
  submittedAt?: string | null;
  decidedAt?: string | null;
  reason?: string | null;
  address?: { city?: string; state?: string; pincode?: string };
  affiliation?: string;
  website?: string;
  applicant?: {
    id?: string;
    name: string;
    email?: string | null;
    mobile?: string | null;
    designation?: string;
  } | null;
  createdAt?: string;
}

export default function PlatformDashboardPage() {
  const { user, status, api } = useAuth();
  const [registrations, setRegistrations] = useState<PendingRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isPA = Boolean(user?.platformRoles?.includes("PA"));

  const loadRegistrations = useCallback(async () => {
    if (!isPA) return;
    setError(null);
    try {
      const data = await api.request<PendingRegistration[]>("/platform/colleges?status=pending");
      setRegistrations(data);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError("Failed to load registrations.");
      }
    } finally {
      setLoading(false);
    }
  }, [api, isPA]);

  useEffect(() => {
    if (status === "authenticated" && isPA) {
      void loadRegistrations();
    } else if (status !== "loading") {
      setLoading(false);
    }
  }, [status, isPA, loadRegistrations]);

  if (status === "loading" || loading) {
    return (
      <div className="mx-auto max-w-4xl py-12 text-center text-ink-muted">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
        <p className="mt-3 text-sm">Loading pending college registrations...</p>
      </div>
    );
  }

  if (status !== "authenticated" || !user || !isPA) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-ink">Access Denied</h2>
          <p className="mt-2 text-sm text-ink-muted">
            The Platform Dashboard requires verified Platform Administrator (PA) credentials with 2-step TOTP MFA.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Sign in as Platform Administrator
            </Link>
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-surface"
            >
              Return to Timetable Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  async function handleApprove(collegeId: string) {
    setActionId(collegeId);
    setError(null);
    setSuccess(null);
    try {
      await api.request(`/platform/colleges/${collegeId}/approve`, { method: "POST" });
      setSuccess("College registration approved successfully! The institution and applicant are now active.");
      await loadRegistrations();
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.message);
      else setError("Failed to approve college registration.");
    } finally {
      setActionId(null);
    }
  }

  async function handleReject(collegeId: string) {
    const reason = window.prompt("Reason for rejecting this registration (required):");
    if (!reason?.trim()) return;

    setActionId(collegeId);
    setError(null);
    setSuccess(null);
    try {
      await api.request(`/platform/colleges/${collegeId}/reject`, {
        method: "POST",
        body: { reason: reason.trim() },
      });
      setSuccess("College registration rejected.");
      await loadRegistrations();
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.message);
      else setError("Failed to reject registration.");
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink">Platform Administrator Dashboard</h1>
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800">
              PA Verified
            </span>
          </div>
          <p className="text-sm text-ink-muted">
            Institutional onboarding verification, tenancy approvals, and system-wide governance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadRegistrations()}
          className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface"
        >
          Refresh List
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800">
          {success}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
            Pending College Registrations ({registrations.length})
          </h2>
        </div>

        {registrations.length === 0 ? (
          <div className="rounded-xl border border-line bg-white p-8 text-center shadow-sm">
            <svg className="mx-auto h-10 w-10 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="mt-3 font-semibold text-ink">No registrations pending review</p>
            <p className="mt-1 text-sm text-ink-muted">All submitted institutional applications have been processed.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {registrations.map((reg) => {
              const inProgress = actionId === reg.id;
              const collegeName = typeof reg.name === "string" ? reg.name : reg.name?.en ?? "College Application";
              const submittedDate = reg.submittedAt || reg.createdAt;
              return (
                <div key={reg.id} className="rounded-xl border border-line bg-white p-6 shadow-sm space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-ink">{collegeName}</h3>
                        <span className="rounded bg-surface px-2 py-0.5 font-mono text-xs font-semibold text-ink border border-line">
                          {reg.code}
                        </span>
                      </div>
                      {submittedDate && (
                        <p className="mt-1 text-xs text-ink-muted">
                          Submitted: {new Date(submittedDate).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={inProgress}
                        onClick={() => void handleApprove(reg.id)}
                        className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {inProgress ? "Processing..." : "Approve & Activate"}
                      </button>
                      <button
                        type="button"
                        disabled={inProgress}
                        onClick={() => void handleReject(reg.id)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                    <div className="space-y-1.5">
                      <span className="font-semibold text-ink uppercase tracking-wider text-[10px]">Campus Details</span>
                      <p className="text-ink">
                        Location: {reg.district ? `${reg.district} District` : reg.address ? `${reg.address.city ?? "–"}, ${reg.address.state ?? "–"}` : "Not specified"}
                      </p>
                      <p className="text-ink">Category: {reg.kind || reg.affiliation || "Higher Education Institution"}</p>
                      {reg.website && (
                        <p>
                          Website:{" "}
                          <a href={reg.website} target="_blank" rel="noreferrer" className="text-primary underline">
                            {reg.website}
                          </a>
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <span className="font-semibold text-ink uppercase tracking-wider text-[10px]">Primary Applicant</span>
                      <p className="text-ink font-medium">{reg.applicant?.name ?? "–"}</p>
                      <p className="text-ink-muted">Email: {reg.applicant?.email ?? "–"}</p>
                      <p className="text-ink-muted">Mobile: {reg.applicant?.mobile ?? "–"}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
