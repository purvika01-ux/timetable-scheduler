// Authentication and access control (SECURITY_MODEL.md sections 2 to 4).
//
// - authenticate: bearer access token -> session still valid -> user still active.
// - requireCsrf: for the two cookie-authenticated endpoints (refresh, logout).
// - requireMember: the caller's membership of the college in the URL, read from the database. Any
//   problem (bad id, no membership, suspended, college not active, another college) is a 404, so a
//   caller cannot learn which colleges exist. The rest of the request runs in that college's tenant
//   scope, so every tenant query is limited to it whatever ids the client sends.
// - authorize: the route's capability, from the membership's roles.
// - requirePlatformAdmin: platform administrator role AND a session that passed two-step sign-in.

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Types } from "mongoose";

import type { AuthContext, MemberContext } from "../auth/context.ts";
import { can, type Capability } from "../auth/permissions.ts";
import { TokenError } from "../auth/tokens.ts";
import { enterTenant } from "../db/tenant.ts";
import type { Deps } from "../deps.ts";
import { ApiError } from "../http/errors.ts";

const unauthenticated = (message = "Please sign in to continue.") => new ApiError(401, "unauthenticated", message);
const collegeNotFound = () => new ApiError(404, "not_found", "We couldn't find that college, or you are not a member of it.");

interface CachedSession {
  userId: string;
  revoked: boolean;
  expiresAt: number;
  mfaVerified: boolean;
  checkedAt: number;
}

/**
 * Session validity is cached per instance for `cacheMs` (default 60 s, SECURITY_MODEL.md 2.4), so a
 * revoked session stops working on other instances within that time. User status and memberships
 * are never cached: suspending a person or changing their roles takes effect on the next request.
 */
export function createAuthenticator(deps: Deps, cacheMs = 60_000) {
  const cache = new Map<string, CachedSession>();

  async function loadSession(sessionId: string): Promise<CachedSession | null> {
    const now = deps.now().getTime();
    const hit = cache.get(sessionId);
    if (hit && now - hit.checkedAt < cacheMs) return hit;
    if (!Types.ObjectId.isValid(sessionId)) return null;
    const s = await deps.models.Session.findById(sessionId, { userId: 1, revokedAt: 1, expiresAt: 1, mfaVerified: 1 }).lean();
    if (!s) {
      cache.delete(sessionId);
      return null;
    }
    const entry = { userId: String(s.userId), revoked: Boolean(s.revokedAt), expiresAt: s.expiresAt.getTime(), mfaVerified: s.mfaVerified, checkedAt: now };
    if (cacheMs > 0) cache.set(sessionId, entry);
    return entry;
  }

  const authenticate: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
    const header = req.get("authorization") ?? "";
    const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header);
    if (!match?.[1]) return next(unauthenticated());
    let claims;
    try {
      claims = await deps.tokens.verifyAccess(match[1]);
    } catch (err) {
      if (err instanceof TokenError && err.expired) return next(new ApiError(401, "unauthenticated", "Your sign-in has expired. Please sign in again."));
      return next(unauthenticated());
    }
    const session = await loadSession(claims.sessionId);
    if (!session || session.revoked || session.userId !== claims.userId || session.expiresAt <= deps.now().getTime()) {
      return next(unauthenticated("You have been signed out. Please sign in again."));
    }
    const user = await deps.models.User.findById(claims.userId, { status: 1, platformRoles: 1 }).lean();
    if (!user || user.status !== "active") return next(unauthenticated("This account cannot be used. Contact your college administrator."));
    const auth: AuthContext = {
      userId: new Types.ObjectId(claims.userId),
      sessionId: new Types.ObjectId(claims.sessionId),
      platformRoles: user.platformRoles ?? [],
      mfaVerified: session.mfaVerified,
    };
    res.locals.auth = auth;
    next();
  };

  const optionalAuthenticate: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
    const header = req.get("authorization");
    if (!header) return next();
    return authenticate(req, res, next);
  };

  function invalidate(sessionId?: Types.ObjectId | string, userId?: Types.ObjectId | string): void {
    if (sessionId) cache.delete(String(sessionId));
    if (userId) {
      const u = String(userId);
      for (const [k, v] of cache.entries()) {
        if (v.userId === u) cache.delete(k);
      }
    }
  }

  return { authenticate, optionalAuthenticate, clearCache: () => cache.clear(), invalidate };
}

/**
 * Cookie-authenticated endpoints only. A custom header forces browsers to send a CORS preflight,
 * which other origins fail, and the Origin must be one of the configured origins
 * (SECURITY_MODEL.md section 6).
 */
export function requireCsrf(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    const origin = req.get("origin");
    if (req.get("x-csrf-protection") !== "1" || origin === undefined || !allowed.has(origin)) {
      return next(new ApiError(403, "forbidden", "This request was refused because it did not come from the app."));
    }
    next();
  };
}

/** Load the caller's membership of :collegeId and scope the rest of the request to that college. */
export function requireMember(deps: Deps): RequestHandler {
  return async (req, res, next) => {
    const auth = res.locals.auth as AuthContext | undefined;
    if (!auth) return next(unauthenticated());
    const raw = req.params.collegeId;
    if (typeof raw !== "string" || !/^[a-f0-9]{24}$/.test(raw)) return next(collegeNotFound());
    const collegeId = new Types.ObjectId(raw);
    const [college, membership] = await Promise.all([
      deps.models.College.findById(collegeId, { status: 1 }).lean(),
      deps.models.Membership.findOne({ collegeId, userId: auth.userId }, { roles: 1, status: 1 }).setOptions({ platformScope: true }).lean(),
    ]);
    if (!college || college.status !== "active" || !membership || membership.status !== "active") return next(collegeNotFound());
    const member: MemberContext = { collegeId, membershipId: membership._id, roles: membership.roles as string[] };
    res.locals.member = member;
    enterTenant(collegeId, () => next());
  };
}

export function authorize(capability: Capability): RequestHandler {
  return (_req, res, next) => {
    const member = res.locals.member as MemberContext | undefined;
    if (!member || !can(member.roles, capability)) {
      return next(new ApiError(403, "forbidden", "Your role in this college does not allow this. Ask your college administrator if you need it."));
    }
    next();
  };
}

export const requirePlatformAdmin: RequestHandler = (_req, res, next) => {
  const auth = res.locals.auth as AuthContext | undefined;
  // Not found rather than forbidden: platform routes are not advertised to other users.
  if (!auth || !auth.platformRoles.includes("PA") || !auth.mfaVerified) {
    return next(new ApiError(404, "not_found", "We couldn't find what you asked for. Check the address and try again."));
  }
  next();
};
