"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

import { ApiRequestError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth-context";

const ROLE_LABELS: Record<string, string> = {
  PA: "Platform Administrator",
  CA: "College Administrator / Principal",
  TC: "Timetable Coordinator",
  HOD: "Head of Department",
  TE: "Teacher",
  ST: "Student",
};

export default function AccountPage() {
  const router = useRouter();
  const { user, memberships, activeCollege, selectCollege, logout, logoutAll, status, api } = useAuth();
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Invitation workflow state
  const [inviteTarget, setInviteTarget] = useState("");
  const [inviteRole, setInviteRole] = useState("TE");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-xl py-16 text-center text-ink-muted">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent align-[-0.125em]" />
        <p className="mt-4 text-sm">Loading your account details...</p>
      </div>
    );
  }

  if (status === "unauthenticated" || !user) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <div className="rounded-xl border border-line bg-white p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-ink">Sign in required</h2>
          <p className="mt-2 text-sm text-ink-muted">
            You must be signed in with institutional credentials to view real college data and account memberships.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Sign in to your College
            </Link>
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-surface"
            >
              Continue in In-Browser Demo Mode
            </Link>
          </div>
        </div>
      </div>
    );
  }

  async function handleLogout() {
    setActionLoading(true);
    await logout();
    router.push("/login");
  }

  async function handleLogoutAll() {
    setActionLoading(true);
    await logoutAll();
    router.push("/login");
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCollege) return;
    setInviteError(null);
    setInviteLink(null);
    setInviteLoading(true);

    const isEmail = inviteTarget.includes("@");
    const payload = isEmail ? { email: inviteTarget.trim(), roles: [inviteRole] } : { mobile: inviteTarget.trim(), roles: [inviteRole] };

    try {
      const res = await api.request<{ link: string }>(`/colleges/${activeCollege.collegeId}/invitations`, {
        method: "POST",
        body: payload,
      });
      // Replace localhost link origin with current window origin if needed
      const rawLink = res.link;
      const tokenMatch = /#token=(.+)$/.exec(rawLink);
      const appLink = tokenMatch ? `${window.location.origin}/invitations#token=${tokenMatch[1]}` : rawLink;
      setInviteLink(appLink);
      setInviteTarget("");
    } catch (err) {
      if (err instanceof ApiRequestError) setInviteError(err.message);
      else setInviteError("Failed to create invitation.");
    } finally {
      setInviteLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Account & College Memberships</h1>
          <p className="text-sm text-ink-muted">Manage your institutional identity, roles and active sessions.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={actionLoading}
            onClick={handleLogout}
            className="inline-flex h-9 items-center rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-surface disabled:opacity-50"
          >
            Sign out
          </button>
          <button
            type="button"
            disabled={actionLoading}
            onClick={handleLogoutAll}
            className="inline-flex h-9 items-center rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            Sign out all devices
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {feedback}
        </div>
      )}

      {/* User Information */}
      <section className="rounded-xl border border-line bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">Personal Profile</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className="block text-xs font-medium text-ink-muted">Full Name</span>
            <span className="text-sm font-medium text-ink">{user.name}</span>
          </div>
          <div>
            <span className="block text-xs font-medium text-ink-muted">Email</span>
            <span className="text-sm font-medium text-ink">{user.email ?? "None registered"}</span>
          </div>
          <div>
            <span className="block text-xs font-medium text-ink-muted">Mobile</span>
            <span className="text-sm font-medium text-ink">{user.mobile ?? "None registered"}</span>
          </div>
          <div>
            <span className="block text-xs font-medium text-ink-muted">Platform Role</span>
            <span className="text-sm font-medium text-ink">
              {user.platformRoles.length > 0 ? (
                <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800">
                  Platform Administrator (PA)
                </span>
              ) : (
                "Standard College User"
              )}
            </span>
          </div>
        </div>
      </section>

      {/* College Memberships */}
      <section className="rounded-xl border border-line bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
            College Memberships ({memberships.length})
          </h2>
          <span className="text-xs text-ink-muted">Server-validated access permissions</span>
        </div>

        {memberships.length === 0 ? (
          <div className="mt-4 rounded-lg border border-line bg-surface p-6 text-center text-sm text-ink-muted">
            You do not currently belong to any active college tenant.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {memberships.map((m) => {
              const isSelected = activeCollege?.collegeId === m.collegeId;
              return (
                <div
                  key={m.collegeId}
                  className={`flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 transition ${
                    isSelected ? "border-primary bg-blue-50/30" : "border-line bg-white hover:border-ink-muted"
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-ink">{m.collegeName}</h3>
                      {isSelected && (
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          Active College
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.roles.map((r) => (
                        <span
                          key={r}
                          className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-ink border border-line"
                        >
                          {ROLE_LABELS[r] ?? r}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        m.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                      }`}
                    >
                      {m.status === "active" ? "Active" : "Suspended"}
                    </span>
                    {!isSelected && (
                      <button
                        type="button"
                        onClick={() => {
                          selectCollege(m.collegeId);
                          setFeedback(`Switched active college to ${m.collegeName}`);
                        }}
                        className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface"
                      >
                        Switch to this college
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* College Administrator Invitation Tool */}
      {activeCollege?.roles.includes("CA") && (
        <section className="rounded-xl border border-line bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
              Invite Member to {activeCollege.collegeName}
            </h2>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
              CA Action
            </span>
          </div>

          <p className="text-xs text-ink-muted">
            Generate an invitation link for a new Timetable Coordinator, HOD, Teacher or Student.
          </p>

          {inviteError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {inviteError}
            </div>
          )}

          {inviteLink && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-2">
              <span className="text-xs font-semibold text-emerald-800">Invitation Link Generated:</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  className="w-full rounded border border-line bg-white px-2 py-1 font-mono text-xs text-ink select-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(inviteLink);
                    setFeedback("Copied invitation link to clipboard!");
                  }}
                  className="rounded bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-hover shrink-0"
                >
                  Copy Link
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSendInvite} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="invite-target" className="block text-[11px] font-semibold text-ink uppercase">
                Email or Indian Mobile
              </label>
              <input
                id="invite-target"
                type="text"
                required
                value={inviteTarget}
                onChange={(e) => setInviteTarget(e.target.value)}
                placeholder="colleague@college.example.edu or 9876543210"
                className="mt-1 block w-full rounded-lg border border-line px-3 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="invite-role" className="block text-[11px] font-semibold text-ink uppercase">
                Role to Assign
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
              >
                <option value="TC">Timetable Coordinator (TC)</option>
                <option value="HOD">Head of Department (HOD)</option>
                <option value="TE">Teacher (TE)</option>
                <option value="ST">Student (ST)</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={inviteLoading}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-50"
              >
                {inviteLoading ? "Generating Link..." : "Create & Issue Invitation Link"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Security & Token Scope */}
      <section className="rounded-xl border border-line bg-white p-6 shadow-sm text-xs text-ink-muted space-y-2">
        <h3 className="font-semibold text-ink text-sm">Security & Multi-Tenant Isolation Guarantee</h3>
        <p>• Access tokens are held exclusively in JavaScript memory and are never persisted in localStorage or cookies.</p>
        <p>• Session refresh tokens are stored in HttpOnly, SameSite=Strict cookies with automatic rotation and token-reuse revocation.</p>
        <p>• All college database queries are isolated at the server level; cross-tenant requests are refused with 404.</p>
      </section>
    </div>
  );
}
