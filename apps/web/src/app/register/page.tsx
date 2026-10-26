"use client";

import Link from "next/link";
import React, { useState } from "react";

import { ApiRequestError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth-context";

export default function RegisterPage() {
  const { api } = useAuth();

  const [collegeName, setCollegeName] = useState("");
  const [collegeCode, setCollegeCode] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [website, setWebsite] = useState("");

  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminMobile, setAdminMobile] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      await api.request("/registrations", {
        method: "POST",
        body: {
          college: {
            name: { en: collegeName.trim() },
            code: collegeCode.trim().toUpperCase(),
            address: {
              city: city.trim(),
              state: state.trim(),
              pincode: pincode.trim(),
            },
            affiliation: affiliation.trim() || undefined,
            website: website.trim() || undefined,
          },
          applicant: {
            name: adminName.trim(),
            email: adminEmail.trim(),
            mobile: adminMobile.trim(),
            password: adminPassword,
          },
        },
      });

      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Could not submit registration. Please verify your connection.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl py-12">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Registration Submitted!</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
            Your application for <strong className="text-ink">{collegeName}</strong> has been received and queued for Platform Administrator review.
          </p>
          <div className="mt-6 rounded-lg border border-line bg-white p-4 text-left text-xs text-ink-muted space-y-1.5">
            <p><strong>Next steps:</strong></p>
            <p>• The platform administration team verifies institutional credentials.</p>
            <p>• Once approved, your account will be activated and an email notification sent.</p>
            <p>• You can then sign in and begin configuring your campus departments and timetables.</p>
          </div>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="rounded-xl border border-line bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-ink">Register Your College</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Onboard your institution to set up clash-free scheduling and multi-tenant college timetables.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800" role="alert">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-primary border-b border-line pb-2">
              1. Institutional Details
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="college-name" className="block text-xs font-semibold text-ink">
                  College / Institute Name *
                </label>
                <input
                  id="college-name"
                  type="text"
                  required
                  value={collegeName}
                  onChange={(e) => setCollegeName(e.target.value)}
                  placeholder="e.g. DAV College, Jalandhar"
                  className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="college-code" className="block text-xs font-semibold text-ink">
                  College Code (Uppercase alphanumeric) *
                </label>
                <input
                  id="college-code"
                  type="text"
                  required
                  value={collegeCode}
                  onChange={(e) => setCollegeCode(e.target.value.toUpperCase())}
                  placeholder="e.g. DAV-JAL"
                  className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm font-mono text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="affiliation" className="block text-xs font-semibold text-ink">
                  Affiliating University / Board
                </label>
                <input
                  id="affiliation"
                  type="text"
                  value={affiliation}
                  onChange={(e) => setAffiliation(e.target.value)}
                  placeholder="e.g. Panjab University"
                  className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="city" className="block text-xs font-semibold text-ink">
                  City *
                </label>
                <input
                  id="city"
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Jalandhar"
                  className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="state" className="block text-xs font-semibold text-ink">
                  State *
                </label>
                <input
                  id="state"
                  type="text"
                  required
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="Punjab"
                  className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="pincode" className="block text-xs font-semibold text-ink">
                  Pincode (6 digits) *
                </label>
                <input
                  id="pincode"
                  type="text"
                  required
                  maxLength={6}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
                  placeholder="144008"
                  className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="website" className="block text-xs font-semibold text-ink">
                  Official Website
                </label>
                <input
                  id="website"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://davjalandhar.com"
                  className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-primary border-b border-line pb-2">
              2. Primary Administrator (Principal / CA)
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="admin-name" className="block text-xs font-semibold text-ink">
                  Full Name *
                </label>
                <input
                  id="admin-name"
                  type="text"
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Dr. Rajesh Kumar"
                  className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="admin-email" className="block text-xs font-semibold text-ink">
                  Institutional Email *
                </label>
                <input
                  id="admin-email"
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="principal@davjalandhar.com"
                  className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="admin-mobile" className="block text-xs font-semibold text-ink">
                  Indian Mobile Number *
                </label>
                <input
                  id="admin-mobile"
                  type="tel"
                  required
                  value={adminMobile}
                  onChange={(e) => setAdminMobile(e.target.value)}
                  placeholder="9876543210 or +91 9876543210"
                  className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="admin-pass" className="block text-xs font-semibold text-ink">
                  Initial Password (minimum 10 characters, upper/lower/number) *
                </label>
                <input
                  id="admin-pass"
                  type="password"
                  required
                  minLength={10}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          </section>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex w-full h-11 items-center justify-center rounded-lg bg-primary font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Submitting Registration..." : "Submit Registration for Approval"}
            </button>
          </div>
        </form>

        <div className="mt-6 border-t border-line pt-4 text-center text-xs text-ink-muted">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Sign in to your account
          </Link>
        </div>
      </div>
    </div>
  );
}
