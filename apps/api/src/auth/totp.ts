// Time-based one-time codes (RFC 6238: HMAC-SHA1, 6 digits, 30-second steps) for two-step sign-in
// with an authenticator app (S4). Secrets are encrypted at rest with AES-256-GCM; a code is accepted
// once only (the last used step is remembered).

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

import { safeEqual, sha256 } from "./secrets.ts";

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = BASE32.indexOf(ch);
    if (i < 0) throw new Error("invalid base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32 as authenticator apps expect. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCode(secretBase32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function currentStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / STEP_SECONDS);
}

/**
 * Check a code, allowing one step of clock drift either way. Returns the matched step, or null.
 * Codes for steps at or before `lastUsedStep` are refused, so each code works only once.
 */
export function verifyTotp(secretBase32: string, code: string, now: Date, lastUsedStep = -1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const step = currentStep(now);
  for (const s of [step - 1, step, step + 1]) {
    if (s > lastUsedStep && safeEqual(totpCode(secretBase32, s), code)) return s;
  }
  return null;
}

export function otpauthUrl(secretBase32: string, accountName: string): string {
  const label = encodeURIComponent(`College Timetable Optimizer:${accountName}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent("College Timetable Optimizer")}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

export function encryptSecret(secret: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(sealed: string, key: Buffer): string {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !data) throw new Error("invalid sealed secret");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Ten single-use recovery codes like "7K2M-9QXD-4TPA"; returns the codes (shown once) and their hashes. */
export function newRecoveryCodes(): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: 10 }, () => {
    const raw = base32Encode(randomBytes(8)).slice(0, 12);
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
  return { codes, hashes: codes.map(recoveryCodeHash) };
}

export function recoveryCodeHash(code: string): string {
  return sha256(code.toUpperCase().replace(/[\s-]/g, ""));
}
