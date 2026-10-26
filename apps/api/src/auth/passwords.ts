// Password hashing (Argon2id with the library's recommended parameters, S10) and the password
// policy (SECURITY_MODEL.md section 2.1).

import { hash, verify } from "@node-rs/argon2";

import { isCommonPassword } from "./common-passwords.ts";

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;
export const PASSWORD_HISTORY = 3;

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;
/**
 * Verify against a fixed hash when the account does not exist, so a wrong identifier takes as long
 * as a wrong password and the response time does not reveal which accounts exist.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("not-a-real-password-just-for-timing");
  await verifyPassword(await dummyHash, password);
  return false;
}

export interface PolicyContext {
  name?: string | null;
  email?: string | null;
  mobile?: string | null;
  /** Hashes of the current and recent passwords; the new one may not match any. */
  previousHashes?: string[];
}

/** Plain-language problems with a proposed password; an empty list means it is acceptable. */
export async function passwordProblems(password: string, ctx: PolicyContext = {}): Promise<string[]> {
  const problems: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) problems.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password.length > MAX_PASSWORD_LENGTH) problems.push(`Use at most ${MAX_PASSWORD_LENGTH} characters.`);
  if (password.trim().length === 0) problems.push("The password cannot be only spaces.");
  if (isCommonPassword(password)) problems.push("This password is too common. Choose something harder to guess, such as a short sentence.");
  const lower = password.toLowerCase();
  const personal = [ctx.email?.split("@")[0], ctx.mobile?.replace(/\D/g, "").slice(-10), ...(ctx.name ?? "").toLowerCase().split(/\s+/)]
    .filter((v): v is string => typeof v === "string" && v.length >= 4)
    .map((v) => v.toLowerCase());
  if (personal.some((v) => lower.includes(v))) problems.push("Do not use your name, email or mobile number in your password.");
  if (problems.length === 0 && ctx.previousHashes?.length) {
    for (const previous of ctx.previousHashes.slice(0, PASSWORD_HISTORY)) {
      if (await verifyPassword(previous, password)) {
        problems.push(`Choose a password you have not used for your last ${PASSWORD_HISTORY} passwords.`);
        break;
      }
    }
  }
  return problems;
}
