"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

import { ApiRequestError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth-context";

function getRoleRedirect(user?: { platformRoles?: string[] }, memberships?: { roles: string[] }[]): string {
  if (user?.platformRoles?.includes("PA")) {
    return "/platform";
  }
  const roles = memberships?.[0]?.roles ?? [];
  if (roles.includes("TC")) {
    return "/timetable";
  }
  if (roles.includes("CA") || roles.includes("PR")) {
    return "/account";
  }
  if (roles.includes("HOD") || roles.includes("TE") || roles.includes("ST")) {
    return "/";
  }
  return "/account";
}

export default function LoginPage() {
  const router = useRouter();
  const { login, verifyMfa, status, user } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 2-Step challenge state
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  if (status === "authenticated" && user) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <div className="rounded-xl border border-line bg-white p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-ink">You are already signed in</h2>
          <p className="mt-2 text-sm text-ink-muted">Signed in as {user.name} ({user.email ?? user.mobile})</p>
          <div className="mt-6 flex flex-col gap-2">
            <Link
              href={user.platformRoles?.includes("PA") ? "/platform" : "/account"}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover"
            >
              {user.platformRoles?.includes("PA") ? "Go to Platform Governance" : "Go to Account & Memberships"}
            </Link>
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-surface"
            >
              Go to Timetable Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      const res = await login(identifier.trim(), password);
      if (res.twoStepRequired && res.challengeToken) {
        setChallengeToken(res.challengeToken);
      } else {
        router.push(getRoleRedirect(res.user, res.memberships));
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Could not sign in. Please verify your connection.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    setErrorMessage(null);
    setLoading(true);

    try {
      const res = await verifyMfa(challengeToken, mfaCode.trim());
      router.push(getRoleRedirect(res.user, res.memberships));
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Verification code incorrect or expired. Try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <div className="rounded-xl border border-line bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 text-center">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </span>
          <h1 className="mt-3 text-xl font-bold tracking-tight text-ink">
            {challengeToken ? "Two-Step Verification" : "Sign in to your College"}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {challengeToken
              ? "Enter the 6-digit code from your authenticator app"
              : "Enter your institutional email or Indian mobile number"}
          </p>
        </div>

        {errorMessage && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800" role="alert">
            <div className="flex items-start gap-2">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {challengeToken ? (
          <form onSubmit={handleMfaVerify} className="space-y-4">
            <div>
              <label htmlFor="mfa-code" className="block text-xs font-semibold uppercase tracking-wider text-ink">
                Authentication Code
              </label>
              <input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="mt-1.5 block w-full rounded-lg border border-line px-3 py-2 text-center text-2xl font-mono tracking-widest text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              className="mt-2 flex w-full h-10 items-center justify-center rounded-lg bg-primary font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify Code"}
            </button>

            <button
              type="button"
              onClick={() => {
                setChallengeToken(null);
                setMfaCode("");
                setErrorMessage(null);
              }}
              className="w-full text-center text-xs text-ink-muted hover:text-ink underline pt-2"
            >
              Back to Sign In
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="identifier" className="block text-xs font-semibold uppercase tracking-wider text-ink">
                Email or Indian Mobile
              </label>
              <input
                id="identifier"
                type="text"
                required
                autoFocus
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="teacher@college.example.edu or 9876543210"
                className="mt-1.5 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-ink">
                  Password
                </label>
              </div>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="mt-1.5 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full h-10 items-center justify-center rounded-lg bg-primary font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        )}

        <div className="mt-6 border-t border-line pt-4 text-center text-xs text-ink-muted space-y-2">
          <p>
            New institution?{" "}
            <Link href="/register" className="font-semibold text-primary hover:underline">
              Register college onboarding
            </Link>
          </p>
          <p>
            Want to test without an account?{" "}
            <Link href="/" className="font-semibold text-amber-700 hover:underline">
              Use In-Browser Demo Mode
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
