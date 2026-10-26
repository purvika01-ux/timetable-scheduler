// Sessions and refresh tokens (SECURITY_MODEL.md section 2.4).
//
// - The refresh token is a random value sent only in an HttpOnly, Secure, SameSite=Strict cookie
//   scoped to /api/v1/auth; only its hash is stored.
// - Every refresh replaces the token. The old one is marked replaced in one atomic update, so of two
//   concurrent uses only one wins.
// - Presenting a replaced token again (after a short grace period for two tabs refreshing at once)
//   means it was stolen: the whole session family is revoked and the event is audited.
// - Idle and absolute timeouts depend on the roles held (M19).

import type { Response } from "express";
import { trusted, Types, type ClientSession } from "mongoose";

import { STAFF_ROLES } from "../auth/permissions.ts";
import { randomToken, sha256 } from "../auth/secrets.ts";
import type { Deps } from "../deps.ts";
import { ApiError } from "../http/errors.ts";
import { auditPlatform } from "./audit.service.ts";

export const REFRESH_COOKIE = "cto_rt";
export const REFRESH_COOKIE_PATH = "/api/v1/auth";
/** Two tabs refreshing at the same moment is not theft: allow this long before treating reuse as theft. */
const REUSE_GRACE_MS = 10_000;

export interface IssuedSession {
  sessionId: Types.ObjectId;
  refreshToken: string;
  accessToken: string;
  expiresAt: Date;
}

export function createSessionService(
  deps: Deps,
  hooks?: { onRevoke?: (sessionId?: Types.ObjectId, userId?: Types.ObjectId) => void },
) {
  const { models, config, tokens, now } = deps;

  async function policyFor(userId: Types.ObjectId): Promise<{ idleSeconds: number; maxSeconds: number }> {
    const user = await models.User.findById(userId, { platformRoles: 1 }).lean();
    if (user?.platformRoles?.includes("PA")) return config.auth.staff;
    const memberships = await models.Membership.find({ userId, status: "active" }, { roles: 1 }).setOptions({ platformScope: true }).lean();
    const staff = memberships.some((m) => (m.roles as string[]).some((r) => STAFF_ROLES.includes(r)));
    return staff ? config.auth.staff : config.auth.other;
  }

  async function issue(userId: Types.ObjectId, opts: { mfaVerified: boolean; familyId?: string; parentId?: Types.ObjectId; expiresAt?: Date; deviceLabel?: string }, session?: ClientSession): Promise<IssuedSession> {
    const policy = await policyFor(userId);
    const at = now();
    const refreshToken = randomToken();
    const expiresAt = opts.expiresAt ?? new Date(at.getTime() + policy.maxSeconds * 1000);
    const [doc] = await models.Session.create(
      [
        {
          userId,
          familyId: opts.familyId ?? randomToken(16),
          tokenHash: sha256(refreshToken),
          parentId: opts.parentId,
          lastUsedAt: at,
          idleTimeoutSeconds: policy.idleSeconds,
          expiresAt,
          mfaVerified: opts.mfaVerified,
          deviceLabel: opts.deviceLabel,
        },
      ],
      { session },
    );
    const accessToken = await tokens.signAccess(String(userId), String(doc!._id));
    return { sessionId: doc!._id, refreshToken, accessToken, expiresAt };
  }

  /** Exchange a refresh token for a new one plus an access token. */
  async function rotate(refreshToken: string, requestId?: string): Promise<IssuedSession> {
    const signedOut = () => new ApiError(401, "unauthenticated", "Your sign-in has ended. Please sign in again.");
    const tokenHash = sha256(refreshToken);
    const current = await models.Session.findOne({ tokenHash }).lean();
    if (!current) throw signedOut();
    const at = now();

    if (current.replacedById) {
      const replacedAt = current.revokedAt?.getTime() ?? 0;
      if (at.getTime() - replacedAt > REUSE_GRACE_MS) {
        await models.Session.updateMany({ familyId: current.familyId, revokedAt: null }, { $set: { revokedAt: at, revokeReason: "reuse_detected" } });
        await auditPlatform(models, {
          action: "session.reuse_detected",
          target: { kind: "user", id: String(current.userId) },
          actorUserId: current.userId,
          summary: { familyId: current.familyId },
          requestId,
        });
      }
      throw signedOut();
    }
    if (current.revokedAt) throw signedOut();
    const idleExpired = at.getTime() - current.lastUsedAt.getTime() > current.idleTimeoutSeconds * 1000;
    if (idleExpired || current.expiresAt.getTime() <= at.getTime()) {
      await models.Session.updateOne({ _id: current._id, revokedAt: null }, { $set: { revokedAt: at, revokeReason: idleExpired ? "idle" : "expired" } });
      throw signedOut();
    }
    const user = await models.User.findById(current.userId, { status: 1 }).lean();
    if (!user || user.status !== "active") throw signedOut();

    const nextId = new Types.ObjectId();
    const claimed = await models.Session.findOneAndUpdate(
      { _id: current._id, replacedById: null, revokedAt: null },
      { $set: { replacedById: nextId, revokedAt: at, revokeReason: "rotated", lastUsedAt: at } },
    ).lean();
    if (!claimed) throw signedOut(); // another request rotated it a moment ago

    const refreshed = randomToken();
    const [doc] = await models.Session.create([
      {
        _id: nextId,
        userId: current.userId,
        familyId: current.familyId,
        tokenHash: sha256(refreshed),
        parentId: current._id,
        lastUsedAt: at,
        idleTimeoutSeconds: current.idleTimeoutSeconds,
        expiresAt: current.expiresAt,
        mfaVerified: current.mfaVerified,
        deviceLabel: current.deviceLabel,
      },
    ]);
    const accessToken = await tokens.signAccess(String(current.userId), String(doc!._id));
    return { sessionId: doc!._id, refreshToken: refreshed, accessToken, expiresAt: current.expiresAt };
  }

  async function revoke(sessionId: Types.ObjectId, reason: string): Promise<void> {
    await models.Session.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: now(), revokeReason: reason } });
    hooks?.onRevoke?.(sessionId, undefined);
  }

  async function revokeByRefreshToken(refreshToken: string, reason: string): Promise<void> {
    const s = await models.Session.findOneAndUpdate({ tokenHash: sha256(refreshToken), revokedAt: null }, { $set: { revokedAt: now(), revokeReason: reason } });
    if (s) hooks?.onRevoke?.(s._id, s.userId);
  }

  /** Every session of a user, optionally keeping one (e.g. the one changing the password). */
  async function revokeAll(userId: Types.ObjectId, reason: string, except?: Types.ObjectId, session?: ClientSession): Promise<void> {
    const filter = except ? { userId, revokedAt: null, _id: trusted({ $ne: except }) } : { userId, revokedAt: null };
    await models.Session.updateMany(filter, { $set: { revokedAt: now(), revokeReason: reason } }, { session });
    hooks?.onRevoke?.(undefined, userId);
  }

  function setCookie(res: Response, refreshToken: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: config.auth.cookieSecure,
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
      expires: expiresAt,
    });
  }

  function clearCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: config.auth.cookieSecure, sameSite: "strict", path: REFRESH_COOKIE_PATH });
  }

  return { issue, rotate, revoke, revokeByRefreshToken, revokeAll, setCookie, clearCookie };
}

export type SessionService = ReturnType<typeof createSessionService>;

/** Read one cookie from the Cookie header without a parsing library. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) {
      const value = part.slice(at + 1).trim();
      return /^[A-Za-z0-9_-]{20,100}$/.test(value) ? value : null;
    }
  }
  return null;
}
