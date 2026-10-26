import { trusted, Types } from "mongoose";

import { MAX_PASSWORD_LENGTH, PASSWORD_HISTORY, hashPassword, passwordProblems, verifyAgainstDummy, verifyPassword } from "../auth/passwords.ts";
import { normalizeEmail, normalizeMobile, randomToken, sha256 } from "../auth/secrets.ts";
import { TokenError } from "../auth/tokens.ts";
import { decryptSecret, encryptSecret, newRecoveryCodes, newTotpSecret, otpauthUrl, recoveryCodeHash, verifyTotp } from "../auth/totp.ts";
import { withTransaction } from "../db/transaction.ts";
import type { Deps } from "../deps.ts";
import { ApiError } from "../http/errors.ts";
import { auditPlatform } from "./audit.service.ts";
import type { IssuedSession, SessionService } from "./session.service.ts";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
export const RESET_LINK_MINUTES = 30;

const INVALID_CREDENTIALS = () =>
  new ApiError(401, "unauthenticated", "That sign-in did not work. Check your email or mobile number and password. After several failed attempts, sign-in pauses for 15 minutes.");

export type LoginResult =
  | { kind: "signedIn"; session: IssuedSession }
  | { kind: "mfaRequired"; challengeToken: string }
  | { kind: "mfaEnrolment"; challengeToken: string; secret: string; otpauthUrl: string };

/** Find a user by email or mobile number, as typed. */
export function identifierFilter(identifier: string): { emailNormalized: string } | { mobileNormalized: string } | null {
  if (identifier.includes("@")) {
    const email = normalizeEmail(identifier);
    return email ? { emailNormalized: email } : null;
  }
  const mobile = normalizeMobile(identifier);
  return mobile ? { mobileNormalized: mobile } : null;
}

export function createAuthService(deps: Deps, sessions: SessionService) {
  const { models, config, tokens, now, db } = deps;

  async function login(identifier: string, password: string, requestId?: string): Promise<LoginResult> {
    if (password.length > MAX_PASSWORD_LENGTH) throw INVALID_CREDENTIALS();
    const filter = identifierFilter(identifier);
    const user = filter ? await models.User.findOne(filter).lean() : null;
    if (!user || !user.passwordHash) {
      await verifyAgainstDummy(password);
      throw INVALID_CREDENTIALS();
    }
    const at = now();
    if (user.lockedUntil && user.lockedUntil.getTime() > at.getTime()) {
      await verifyAgainstDummy(password);
      throw INVALID_CREDENTIALS();
    }
    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok || user.status !== "active") {
      if (!ok) {
        const failures = (user.failedLogins ?? 0) + 1;
        if (failures >= MAX_FAILED_LOGINS) {
          await models.User.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockedUntil: new Date(at.getTime() + LOCK_MINUTES * 60_000) } });
          await auditPlatform(models, { action: "account.locked", target: { kind: "user", id: String(user._id) }, requestId });
        } else {
          await models.User.updateOne({ _id: user._id }, { $set: { failedLogins: failures } });
        }
      }
      throw INVALID_CREDENTIALS();
    }
    await models.User.updateOne({ _id: user._id }, { $set: { failedLogins: 0 }, $unset: { lockedUntil: 1 } });

    if (user.platformRoles?.includes("PA")) {
      if (user.mfa?.enabled) return { kind: "mfaRequired", challengeToken: await tokens.signChallenge(String(user._id), "verify") };
      const secret = newTotpSecret();
      await models.User.updateOne({ _id: user._id }, { $set: { "mfa.pendingSecretEncrypted": encryptSecret(secret, config.auth.mfaEncryptionKey) } });
      return {
        kind: "mfaEnrolment",
        challengeToken: await tokens.signChallenge(String(user._id), "enrol"),
        secret,
        otpauthUrl: otpauthUrl(secret, user.emailNormalized ?? user.mobileNormalized ?? user.name),
      };
    }
    const session = await sessions.issue(user._id, { mfaVerified: false });
    await auditPlatform(models, { action: "auth.signed_in", target: { kind: "user", id: String(user._id) }, actorUserId: user._id, requestId });
    return { kind: "signedIn", session };
  }

  /** Second step for platform administrators: a code from the app, or a recovery code. */
  async function verifyMfa(challengeToken: string, code: string, requestId?: string): Promise<{ session: IssuedSession; recoveryCodes?: string[] }> {
    let challenge;
    try {
      challenge = await tokens.verifyChallenge(challengeToken);
    } catch (err) {
      throw new ApiError(401, "unauthenticated", err instanceof TokenError && err.expired ? "The sign-in took too long. Start again." : "Start sign-in again.");
    }
    const user = await models.User.findById(challenge.userId).lean();
    if (!user || user.status !== "active") throw new ApiError(401, "unauthenticated", "Start sign-in again.");
    const wrong = () => new ApiError(401, "unauthenticated", "That code did not work. Check the time on your phone and try the newest code.");
    const at = now();
    const userId = user._id;

    if (challenge.purpose === "enrol") {
      if (!user.mfa?.pendingSecretEncrypted) throw new ApiError(401, "unauthenticated", "Start sign-in again.");
      const secret = decryptSecret(user.mfa.pendingSecretEncrypted, config.auth.mfaEncryptionKey);
      const step = verifyTotp(secret, code, at);
      if (step === null) throw wrong();
      const recovery = newRecoveryCodes();
      const session = await withTransaction(db.connection, async (tx) => {
        await models.User.updateOne(
          { _id: userId },
          { $set: { "mfa.enabled": true, "mfa.secretEncrypted": user.mfa!.pendingSecretEncrypted, "mfa.lastUsedStep": step, "mfa.recoveryCodeHashes": recovery.hashes }, $unset: { "mfa.pendingSecretEncrypted": 1 } },
          { session: tx },
        );
        await auditPlatform(models, { action: "auth.mfa_enrolled", target: { kind: "user", id: String(userId) }, actorUserId: userId, requestId }, tx);
        return sessions.issue(userId, { mfaVerified: true }, tx);
      });
      return { session, recoveryCodes: recovery.codes };
    }

    if (!user.mfa?.enabled || !user.mfa.secretEncrypted) throw new ApiError(401, "unauthenticated", "Start sign-in again.");
    const secret = decryptSecret(user.mfa.secretEncrypted, config.auth.mfaEncryptionKey);
    const step = verifyTotp(secret, code, at, user.mfa.lastUsedStep ?? -1);
    if (step !== null) {
      // Claim the step atomically so the same code cannot be used twice, even concurrently.
      const claimed = await models.User.updateOne(
        { _id: userId, $or: [{ "mfa.lastUsedStep": trusted({ $lt: step }) }, { "mfa.lastUsedStep": trusted({ $exists: false }) }] },
        { $set: { "mfa.lastUsedStep": step } },
      );
      if (claimed.modifiedCount !== 1) throw wrong();
    } else {
      const hash = recoveryCodeHash(code);
      const used = await models.User.updateOne({ _id: userId, "mfa.recoveryCodeHashes": hash }, { $pull: { "mfa.recoveryCodeHashes": hash } });
      if (used.modifiedCount !== 1) throw wrong();
      await auditPlatform(models, { action: "auth.recovery_code_used", target: { kind: "user", id: String(userId) }, actorUserId: userId, requestId });
    }
    const session = await sessions.issue(userId, { mfaVerified: true });
    await auditPlatform(models, { action: "auth.signed_in", target: { kind: "user", id: String(userId) }, actorUserId: userId, summary: { mfa: true }, requestId });
    return { session };
  }

  async function newPasswordHash(userId: Types.ObjectId, password: string): Promise<{ hash: string; history: string[] }> {
    const user = await models.User.findById(userId).lean();
    if (!user) throw new ApiError(404, "not_found", "Account not found.");
    const previous = [user.passwordHash, ...(user.passwordHistory ?? [])].filter((h): h is string => typeof h === "string");
    const problems = await passwordProblems(password, { name: user.name, email: user.emailNormalized, mobile: user.mobileNormalized, previousHashes: previous });
    if (problems.length > 0) {
      throw new ApiError(400, "validation_failed", "Choose a different password.", problems.map((message) => ({ path: "body.newPassword", code: "password_policy", message })));
    }
    return { hash: await hashPassword(password), history: previous.slice(0, PASSWORD_HISTORY) };
  }

  async function changePassword(userId: Types.ObjectId, keepSessionId: Types.ObjectId, currentPassword: string, newPassword: string, requestId?: string): Promise<void> {
    const user = await models.User.findById(userId, { passwordHash: 1 }).lean();
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, currentPassword))) {
      throw new ApiError(400, "validation_failed", "Your current password is not right.", [{ path: "body.currentPassword", code: "incorrect", message: "is not your current password" }]);
    }
    const next = await newPasswordHash(userId, newPassword);
    await withTransaction(db.connection, async (tx) => {
      await models.User.updateOne({ _id: userId }, { $set: { passwordHash: next.hash, passwordHistory: next.history, passwordChangedAt: now() } }, { session: tx });
      await sessions.revokeAll(userId, "password_changed", keepSessionId, tx);
      await auditPlatform(models, { action: "auth.password_changed", target: { kind: "user", id: String(userId) }, actorUserId: userId, requestId }, tx);
    });
  }

  /** A one-time, 30-minute link; returns the raw token (shown once). Caller checks who may issue it. */
  async function issueResetLink(userId: Types.ObjectId, issuedBy: Types.ObjectId, collegeId: Types.ObjectId | null): Promise<{ token: string; expiresAt: Date; url: string }> {
    const token = randomToken();
    const expiresAt = new Date(now().getTime() + RESET_LINK_MINUTES * 60_000);
    await models.PasswordReset.updateMany({ userId, usedAt: null }, { $set: { usedAt: now() } }); // older links stop working
    await models.PasswordReset.create({ userId, tokenHash: sha256(token), expiresAt, issuedBy, collegeId: collegeId ?? undefined });
    return { token, expiresAt, url: `${config.auth.publicAppUrl}/reset-password#token=${token}` };
  }

  async function resetPassword(token: string, newPassword: string, requestId?: string): Promise<void> {
    const at = now();
    const reset = await models.PasswordReset.findOne({ tokenHash: sha256(token) }).lean();
    if (!reset || reset.usedAt || reset.expiresAt.getTime() <= at.getTime()) {
      throw new ApiError(400, "bad_request", "This reset link is not valid any more. Ask your college administrator for a new one.");
    }
    const next = await newPasswordHash(reset.userId, newPassword);
    await withTransaction(db.connection, async (tx) => {
      const claimed = await models.PasswordReset.updateOne({ _id: reset._id, usedAt: null }, { $set: { usedAt: at } }, { session: tx });
      if (claimed.modifiedCount !== 1) throw new ApiError(400, "bad_request", "This reset link has already been used.");
      await models.User.updateOne(
        { _id: reset.userId },
        { $set: { passwordHash: next.hash, passwordHistory: next.history, passwordChangedAt: at, failedLogins: 0 }, $unset: { lockedUntil: 1 } },
        { session: tx },
      );
      await sessions.revokeAll(reset.userId, "password_reset", undefined, tx);
      await auditPlatform(models, { action: "auth.password_reset", target: { kind: "user", id: String(reset.userId) }, actorUserId: reset.userId, collegeId: reset.collegeId, requestId }, tx);
    });
  }

  return { login, verifyMfa, changePassword, issueResetLink, resetPassword, newPasswordHash };
}

export type AuthService = ReturnType<typeof createAuthService>;

/** The only user fields ever returned by the API: no hashes, secrets, tokens or counters. */
export function publicUser(user: {
  _id: Types.ObjectId;
  name: string;
  email?: string | null;
  mobile?: string | null;
  locale?: string | null;
  platformRoles?: string[] | null;
  mfa?: { enabled?: boolean | null } | null;
}) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email ?? null,
    mobile: user.mobile ?? null,
    locale: user.locale ?? "en",
    platformRoles: user.platformRoles ?? [],
    twoStepEnabled: Boolean(user.mfa?.enabled),
  };
}

/** Show only enough of a contact detail to recognise it: "am••••@example.edu", "+91••••••3210". */
export function maskContact(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.includes("@")) {
    const [local, domain] = value.split("@");
    return `${(local ?? "").slice(0, 2)}••••@${domain}`;
  }
  return `${value.slice(0, 3)}••••••${value.slice(-4)}`;
}

export const ObjectId = Types.ObjectId;
