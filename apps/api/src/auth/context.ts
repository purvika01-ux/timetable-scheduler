// Who is calling, as established by the authentication and membership middleware. Handlers read
// these instead of anything the client sends.

import type { Response } from "express";
import type { Types } from "mongoose";

import { ApiError } from "../http/errors.ts";

export interface AuthContext {
  userId: Types.ObjectId;
  sessionId: Types.ObjectId;
  platformRoles: string[];
  mfaVerified: boolean;
}

export interface MemberContext {
  collegeId: Types.ObjectId;
  membershipId: Types.ObjectId;
  roles: string[];
}

export function authOf(res: Response): AuthContext {
  const auth = res.locals.auth as AuthContext | undefined;
  if (!auth) throw new ApiError(401, "unauthenticated", "Please sign in to continue.");
  return auth;
}

export function memberOf(res: Response): MemberContext {
  const member = res.locals.member as MemberContext | undefined;
  if (!member) throw new Error("memberOf() used on a route without requireMember()");
  return member;
}
