// /api/v1/auth: sign-in, two-step sign-in, refresh, sign-out, invitations and password reset.
// Tokens in invitation and reset links travel in request bodies, never in URLs, so they do not
// appear in server logs or browser history (the web pages read them from the URL fragment).

import type { Response } from "express";
import { z } from "zod";

import { authOf } from "../auth/context.ts";
import type { Deps } from "../deps.ts";
import { ApiError } from "../http/errors.ts";
import { sendData } from "../http/response.ts";
import { valid } from "../middleware/validate.ts";
import type { AuthService } from "../services/auth.service.ts";
import type { CollegeAccessService } from "../services/college-access.service.ts";
import { REFRESH_COOKIE, readCookie, type IssuedSession, type SessionService } from "../services/session.service.ts";
import type { MeService } from "../services/me.service.ts";
import { password, personName, token } from "./schemas.ts";
import type { ModuleSpec } from "./secure-router.ts";

const loginSchemas = { body: z.strictObject({ identifier: z.string().trim().min(3).max(254), password }) };
const mfaSchemas = { body: z.strictObject({ challengeToken: z.string().min(20).max(2000), code: z.string().trim().min(6).max(20) }) };
const tokenOnly = { body: z.strictObject({ token }) };
const acceptSchemas = { body: z.strictObject({ token, name: personName.optional(), password: password.optional() }) };
const resetSchemas = { body: z.strictObject({ token, newPassword: password }) };

export function authRoutes(deps: Deps, s: { auth: AuthService; sessions: SessionService; access: CollegeAccessService; me: MeService }): ModuleSpec {
  async function signedIn(res: Response, session: IssuedSession, extra: Record<string, unknown> = {}, status = 200) {
    s.sessions.setCookie(res, session.refreshToken, session.expiresAt);
    res.setHeader("Cache-Control", "no-store");
    const me = await s.me.summary(session.sessionId);
    sendData(res, { accessToken: session.accessToken, expiresIn: deps.tokens.accessTokenTtlSeconds, ...me, ...extra }, status);
  }

  return {
    mount: "/auth",
    routes: [
      {
        method: "post",
        path: "/login",
        access: { kind: "public" },
        limit: "login",
        schemas: loginSchemas,
        handler: async (req, res) => {
          const { body } = valid(req, loginSchemas);
          const result = await s.auth.login(body.identifier, body.password, String(res.locals.requestId));
          res.setHeader("Cache-Control", "no-store");
          if (result.kind === "signedIn") return signedIn(res, result.session);
          if (result.kind === "mfaRequired") return sendData(res, { twoStep: "required", challengeToken: result.challengeToken });
          sendData(res, { twoStep: "enrol", challengeToken: result.challengeToken, secret: result.secret, otpauthUrl: result.otpauthUrl });
        },
      },
      {
        method: "post",
        path: "/mfa/verify",
        access: { kind: "public" },
        limit: "mfa",
        schemas: mfaSchemas,
        handler: async (req, res) => {
          const { body } = valid(req, mfaSchemas);
          const result = await s.auth.verifyMfa(body.challengeToken, body.code, String(res.locals.requestId));
          await signedIn(res, result.session, result.recoveryCodes ? { recoveryCodes: result.recoveryCodes } : {});
        },
      },
      {
        method: "post",
        path: "/refresh",
        access: { kind: "public" },
        csrf: true,
        limit: "refresh",
        handler: async (req, res) => {
          const value = readCookie(req.get("cookie"), REFRESH_COOKIE);
          if (!value) {
            s.sessions.clearCookie(res);
            throw new ApiError(401, "unauthenticated", "You are not signed in.");
          }
          try {
            await signedIn(res, await s.sessions.rotate(value, String(res.locals.requestId)));
          } catch (err) {
            s.sessions.clearCookie(res);
            throw err;
          }
        },
      },
      {
        method: "post",
        path: "/logout",
        access: { kind: "public" },
        csrf: true,
        handler: async (req, res) => {
          const value = readCookie(req.get("cookie"), REFRESH_COOKIE);
          if (value) await s.sessions.revokeByRefreshToken(value, "signed_out");
          s.sessions.clearCookie(res);
          res.status(204).end();
        },
      },
      {
        method: "post",
        path: "/logout-all",
        access: { kind: "user" },
        handler: async (_req, res) => {
          await s.sessions.revokeAll(authOf(res).userId, "signed_out_everywhere");
          s.sessions.clearCookie(res);
          res.status(204).end();
        },
      },
      {
        method: "post",
        path: "/invitations/preview",
        access: { kind: "public" },
        limit: "invitation",
        schemas: tokenOnly,
        handler: async (req, res) => {
          sendData(res, await s.access.previewInvitation(valid(req, tokenOnly).body.token));
        },
      },
      {
        method: "post",
        path: "/invitations/accept",
        access: { kind: "public" },
        optionalAuth: true,
        limit: "invitation",
        schemas: acceptSchemas,
        handler: async (req, res) => {
          const { body } = valid(req, acceptSchemas);
          const userId = res.locals.auth?.userId ?? null;
          sendData(res, await s.access.acceptInvitation(body.token, userId, { name: body.name, password: body.password }, String(res.locals.requestId)), 201);
        },
      },
      {
        method: "post",
        path: "/password/reset",
        access: { kind: "public" },
        limit: "passwordReset",
        schemas: resetSchemas,
        handler: async (req, res) => {
          const { body } = valid(req, resetSchemas);
          await s.auth.resetPassword(body.token, body.newPassword, String(res.locals.requestId));
          res.status(204).end();
        },
      },
    ],
  };
}
