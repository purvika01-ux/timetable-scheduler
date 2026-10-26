// Every route declares who may call it (SECURITY_MODEL.md section 4: default deny). The access level
// is a required part of the route definition, so a route cannot be added without one, and the route
// table is exported for the authorization-matrix and isolation tests.

import { Router, type RequestHandler } from "express";

import type { Capability } from "../auth/permissions.ts";
import type { Deps } from "../deps.ts";
import { authorize, requireCsrf, requireMember, requirePlatformAdmin } from "../middleware/auth.ts";
import { limiter, type LimitName } from "../middleware/rate-limit.ts";
import { validate, type RequestSchemas } from "../middleware/validate.ts";
import type { ApiModule } from "./module.ts";

export type Access =
  | { kind: "public" }
  /** Signed in; the route acts only on the caller's own records. */
  | { kind: "user" }
  /** Signed-in member of the college in the URL, holding the capability. */
  | { kind: "member"; capability: Capability }
  /** Platform administrator who completed two-step sign-in. */
  | { kind: "platform" };

export interface RouteSpec {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  access: Access;
  /** Public routes: accept a bearer token when present (e.g. accepting an invitation while signed in). */
  optionalAuth?: boolean;
  /** Cookie-authenticated routes. */
  csrf?: boolean;
  limit?: LimitName;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schemas?: RequestSchemas<any, any, any>;
  handler: RequestHandler;
}

export interface ModuleSpec {
  /** Mount path under /api/v1; college routes use "/colleges/:collegeId". */
  mount: string;
  routes: RouteSpec[];
}

export interface RouteTableEntry {
  method: RouteSpec["method"];
  path: string;
  access: Access;
}

export interface AuthMiddleware {
  authenticate: RequestHandler;
  optionalAuthenticate: RequestHandler;
}

export function buildModule(deps: Deps, auth: AuthMiddleware, spec: ModuleSpec): ApiModule & { table: RouteTableEntry[] } {
  const router = Router({ mergeParams: true });
  const table: RouteTableEntry[] = [];
  for (const r of spec.routes) {
    const chain: RequestHandler[] = [];
    switch (r.access.kind) {
      case "public":
        if (r.limit) chain.push(limiter(deps, r.limit));
        if (r.csrf) chain.push(requireCsrf(deps.config.corsOrigins));
        if (r.optionalAuth) chain.push(auth.optionalAuthenticate);
        break;
      case "user":
        chain.push(auth.authenticate, limiter(deps, r.limit ?? "authenticated", "user"));
        break;
      case "member":
        chain.push(auth.authenticate, limiter(deps, r.limit ?? "authenticated", "user"), requireMember(deps), authorize(r.access.capability));
        break;
      case "platform":
        chain.push(auth.authenticate, requirePlatformAdmin, limiter(deps, r.limit ?? "authenticated", "user"));
        break;
    }
    if (r.schemas) chain.push(validate(r.schemas));
    router[r.method](r.path, ...chain, r.handler);
    table.push({ method: r.method, path: `${spec.mount}${r.path === "/" ? "" : r.path}`, access: r.access });
  }
  return { path: spec.mount, router, table };
}
