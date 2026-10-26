// Random tokens and their hashes. Tokens (refresh tokens, invitation and reset links, recovery
// codes) are shown to their owner once; only a SHA-256 hash is stored, so a database leak does not
// reveal usable tokens.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256 bits of randomness, URL-safe. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Constant-time comparison of two strings. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Lower-case, trimmed email; null when absent. */
export function normalizeEmail(email: string | undefined | null): string | null {
  const v = email?.trim().toLowerCase();
  return v ? v : null;
}

/**
 * Indian mobile numbers to E.164: "98765 43210", "+91 98765-43210" and "098765 43210" all become
 * "+919876543210". Returns null for anything that is not a valid number.
 */
export function normalizeMobile(mobile: string | undefined | null): string | null {
  if (!mobile) return null;
  const digits = mobile.replace(/[\s()-]/g, "");
  const m = /^(?:\+91|0091|91|0)?([6-9]\d{9})$/.exec(digits);
  return m ? `+91${m[1]}` : null;
}
