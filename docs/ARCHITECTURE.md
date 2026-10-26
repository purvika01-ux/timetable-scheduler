# ARCHITECTURE.md

System architecture for College Timetable Optimizer on a MERN-oriented stack: **MongoDB, Express, React (Next.js), Node.js**, all in TypeScript. Requirements are in `PRODUCT_REQUIREMENTS.md`; this document says how the system is built. It replaces `TECHNICAL_PLAN.md`.

Status: design. Only the frontend prototype (`apps/web`) exists today.

---

## 1. Overview

```
 Phones and desktops (English / ਪੰਜਾਬੀ)
        │  HTTPS
        ▼
 ┌────────────────────────┐        ┌───────────────────────────────────────────┐
 │ apps/web  (Next.js,    │  JSON  │ apps/api  (Express, TypeScript)           │
 │ React, TS)             │──────▶ │  middleware: request id, headers, CORS,   │
 │  UI only, no DB access │  REST  │  limits, rate limit, auth, tenant context,│
 │  service worker cache  │ /api/v1│  Zod validation, policy check             │
 │  demo mode (browser)   │        │  routes → services → repositories         │
 └────────────────────────┘        └──────────────┬────────────────────────────┘
                                                  │ Mongoose (tenant-scoped)
                                                  ▼
                                   ┌───────────────────────────────────────────┐
                                   │ MongoDB Atlas, Mumbai (replica set)       │
                                   │  tenant collections, occupancy, versions, │
                                   │  jobs, outbox, audit (append-only)        │
                                   └──────────────▲────────────────────────────┘
                                                  │ claims jobs, reads outbox
                                   ┌──────────────┴────────────────────────────┐
                                   │ apps/worker (Node, TypeScript)            │
                                   │  generation in worker_threads, exports,   │
                                   │  notification dispatch, scheduled tasks   │
                                   └───────────────────────────────────────────┘
       packages/core: scheduling domain (pure TS) ── used by web, api, worker
       packages/contracts: Zod schemas, error codes, API types, OpenAPI source
```

Principles:

1. **One source of truth for scheduling rules.** `packages/core` holds the clash predicates, validator, capacity check and generator. The browser (instant feedback), the API (authoritative check before commit) and the worker (generation) all run the same code.
2. **The server is authoritative.** The web app never decides validity, permissions or tenancy; it only presents them.
3. **Tenant scope is structural,** not remembered: data access goes through a layer that cannot run a query without a college context (`SECURITY_MODEL.md` section 3).
4. **Every timetable write is serialised per draft** and validated inside a transaction (`DATABASE_DESIGN.md` section 6).
5. **Unreliable networks are normal:** idempotent writes, cached reads, small pages.
6. **No new external service without approval** (CLAUDE.md). Email, SMS, PDF engine, monitoring and hosting choices are listed as open decisions.

## 2. Repository layout (target)

npm workspaces; no other monorepo tool.

```
package.json            workspaces + root scripts (dev, test, lint, typecheck, build)
apps/
  web/                  Next.js app (existing prototype, evolved)
    src/app/            routes by area: (public), (admin), (teacher), (student), demo
    src/components/     UI kit, grid, dialogs (existing components retained)
    src/lib/api/        typed API client (fetch wrapper, retries, idempotency keys)
    src/lib/demo/       localStorage demo mode (existing store.tsx and storage.ts)
    messages/           en.json, pa.json
    public/sw.js        service worker for offline Today/Week
  api/
    src/app.ts          Express app assembly (middleware order in section 4)
    src/server.ts       HTTP entry
    src/config.ts       environment parsing (Zod), fails fast on bad config
    src/middleware/     requestId, security, cors, rateLimit, auth, tenant, validate, policy, errors
    src/modules/<area>/ router.ts, service.ts, repository.ts, policy.ts per area
    src/db/             connection, tenant plugin, transactions helper, migrations
    tests/              integration tests (real MongoDB replica set)
  worker/
    src/main.ts         job loop, outbox dispatcher, scheduled tasks
    src/jobs/           generation, export, import-confirm (if large), notification send
packages/
  core/                 scheduling domain (moved from apps/web/src/lib/timetable)
    src/                types, grid, audience, clash, validator, capacity, generator, moves, queries
    tests/
  contracts/            Zod schemas per endpoint, error codes, shared enums, OpenAPI builder
docs/
```

Rules carried from the prototype: `packages/core` has no React, browser, database or Node-only APIs; imports use `.ts` extensions; only erasable TypeScript syntax (no enums, namespaces, parameter properties or decorators) so Node's type stripping can run files directly.

## 3. Components

### 3.1 Web (`apps/web`)

- **Next.js App Router, React, TypeScript, Tailwind.** Retained to avoid rewriting working screens (M2).
- **UI only.** No database driver, no secrets, no business rules in Next.js server code. Pages are static or client-rendered; data comes from the API. This keeps the MERN boundary clean and lets the web app be hosted as static assets plus a thin server.
- **Two shells.** Admin shell (left navigation, editor, imports, reports) for CA, PR, TC, HOD; light shell (Today, Week, Alerts, Profile) for teachers and students, with no heavy libraries so it meets the 150 KB budget.
- **API client** in `src/lib/api/`: typed from `packages/contracts`; attaches the in-memory access token; refreshes it once on 401; adds an `Idempotency-Key` to every mutating request and reuses it on retry; retries network failures with backoff for idempotent requests only; surfaces `version_conflict` to the UI.
- **Offline:** a service worker caches the app shell and the user's Today/Week responses (Cache Storage). Offline views show the cached data and its age; actions that need the network are disabled with an explanation. Nothing is cached for admin screens. Cache is cleared on sign-out.
- **Forms** keep unsaved input in memory and in `sessionStorage` per form, so a dropped connection or accidental reload does not lose work. No tokens or personal data beyond the form itself are stored.
- **Demo mode:** the current prototype (sample college in the browser, localStorage) stays available at a `/demo` area for the public showcase. It uses the same `packages/core`.
- **i18n:** message catalogues `messages/en.json` and `messages/pa.json`; library per N8. Language from the user profile, else a non-personal cookie, else browser preference.

### 3.2 API (`apps/api`)

- **Express + TypeScript**, REST under `/api/v1` (`API_DESIGN.md`).
- **Layering:** router (HTTP, Zod validation, policy) → service (business rules, transactions, calls `packages/core`) → repository (Mongoose models through the tenant-scoped layer). Routers never touch models directly.
- **Validation:** every request body, query and parameter is parsed with a Zod schema from `packages/contracts`; unknown fields are rejected (`strict`). Responses are typed from the same contracts.
- **Stateless:** any instance can serve any request; sessions live in MongoDB.
- **Long work goes to jobs:** generation, bulk exports and notification sending are jobs; the API returns `202` with a job id.

### 3.3 Worker (`apps/worker`)

- A separate Node process (one or more instances) sharing the API's code for repositories and services.
- **Job queue in MongoDB** (M6): a `jobs` collection. A worker claims a job with an atomic `findOneAndUpdate` (status `queued` → `running`, sets `leaseUntil` and `workerId`), renews the lease with a heartbeat, and marks it `succeeded`, `failed` or `cancelled`. Expired leases are reclaimed; each job type declares its maximum attempts. Cancellation is a flag the job checks between steps.
- **Generation** runs in a `worker_threads` thread with time and memory limits (D11), so the job loop stays responsive and a runaway run can be terminated.
- **Outbox dispatcher:** reads `outbox` events written in the same transactions as the changes they describe, and turns them into in-app notifications and (once providers are approved) email/SMS. Honours the publish hold window.
- **Scheduled tasks:** expire stale jobs, release held notifications after the undo window, purge expired tokens (most expiry uses TTL indexes).

### 3.4 Shared packages

- **`packages/core`:** the scheduling domain (`SCHEDULING_ENGINE.md`). Pure functions over plain data; deterministic for a given input and seed; fully unit- and property-tested.
- **`packages/contracts`:** Zod schemas for every request and response, error codes, enums (roles, states, issue kinds), and the OpenAPI document builder (N6). The web client and API both import from here, so they cannot drift.

## 4. Request lifecycle (API)

Middleware order:

1. `requestId`: accept a well-formed incoming id or create one; add to logs and the response header.
2. `security`: security headers, no `x-powered-by`.
3. `cors`: exact allowed origins from configuration; credentials only for the auth endpoints that use the refresh cookie.
4. `bodyLimits`: JSON 1 MB; CSV upload 5 MB (`text/csv` body); reject other content types.
5. `rateLimit`: per IP and per account for sensitive routes; counters in MongoDB with TTL (no Redis, M6).
6. `authenticate`: verify the bearer access token (algorithm, issuer, audience, expiry, key id). Anonymous only on public routes.
7. `tenantContext`: for `/colleges/:collegeId/...` and `/me/colleges/:collegeId/...`, load the caller's active membership in that college **from the database** (not from the token); 404 if none or suspended. Routes without a college in the path (sign-in, `/me/memberships`, `/me/notifications`, invitation and share-link tokens) use the restricted helpers in `SECURITY_MODEL.md` section 3. Put `{ userId, collegeId, roles, scope }` into an `AsyncLocalStorage` context used by the data layer.
8. `validate`: parse params, query and body with the route's Zod schemas.
9. `authorize`: the route's declared policy (`SECURITY_MODEL.md` section 4); routes without a policy fail at startup.
10. handler → service → repository.
11. `errors`: map known errors to the error format (`API_DESIGN.md` section 2); log unknown errors with the request id and return a generic 500.

## 5. Key flows

### 5.1 Edit a draft (move, swap, room change, lock)

1. Web computes valid targets locally with `packages/core` for instant feedback.
2. Web sends the operation with `baseRevision` and an idempotency key.
3. API service starts a transaction: bumps the draft revision only if it equals `baseRevision` (else `409 version_conflict`), applies the entry changes and their occupancy cells, runs the full validator on the draft as read inside the transaction, and commits only if there are no hard violations. Audit and outbox records are written in the same transaction.
4. Response: new revision, changed entries, validation summary. Details in `DATABASE_DESIGN.md` section 6.

### 5.2 Generate

1. TC runs the pre-check (synchronous, read-only).
2. `POST /generations` creates a job with an input snapshot (hash and copy) and seed; returns 202.
3. Worker runs the generator in a thread, reports progress and best-so-far into the job document; the web app polls (D12).
4. Result is stored as a **candidate**, validated by the validator (separately from the generator). It never touches the draft by itself.
5. TC applies the candidate: an edit transaction (5.1) that replaces unlocked entries, with the revision check.

### 5.3 Submit and publish

1. Submit: transaction checks the revision and zero hard violations, writes an immutable **version** (status `submitted`).
2. Publish (PR/CA): transaction re-validates the version against current master data, checks N2, sets it `published`, sets the previous published version `superseded`, records the undo deadline, writes audit and held outbox events. A partial unique index guarantees one published version per college and term.
3. Undo within 15 minutes: transaction swaps the states back and cancels the held outbox events.

### 5.4 Dated exception

Transaction: load the published version and existing exceptions for that date, check the exception with the same clash predicates (on that date), write it with its occupancy cells for the date, write outbox events (urgent: not held).

### 5.5 Import

1. Upload CSV (≤ 5 MB) → parsed in memory with limits → preview stored as an `importPreviews` document (TTL 24 h) with per-cell errors; the file itself is not stored (D15 proposal).
2. Confirm → one transaction upserts all rows by natural key; all-or-nothing.

## 6. Data and consistency (summary)

Details in `DATABASE_DESIGN.md`.

- MongoDB replica set (Atlas) with multi-document transactions: `readConcern: snapshot`, `writeConcern: majority`, retry on transient errors with a bounded retry count.
- Every tenant document has `collegeId`; every index on tenant collections starts with `collegeId`.
- Timetable consistency: per-draft revision check (serialises writers), occupancy cells with unique indexes for teachers and rooms (defence in depth), and the full validator inside the transaction for everything an index cannot express (audiences, batches, electives, limits, availability, completeness).
- Optimistic concurrency (`rowVersion`) on every editable master-data document.

## 7. Environments and configuration

| Environment | Purpose | Database |
| --- | --- | --- |
| Local | Development | Local MongoDB replica set or a dedicated Atlas development project (N12); never production data |
| CI | Automated tests | Ephemeral replica set per test run (N7) |
| Staging | Pilot rehearsal, end-to-end tests, restore drills | Separate Atlas project, invented or consented data |
| Production | Real colleges | Atlas, Mumbai region (M8) |

- Configuration only through environment variables, parsed and validated at startup (`config.ts`); an `.env.example` lists every variable without values.
- Secrets (database credentials, token signing keys) live in the host's secret store (N13), never in the repository.
- The prototype needs no configuration and keeps working without the API (demo mode).

## 8. Deployment shape (provider-neutral)

- **Web:** static assets plus a thin Next.js server or static export. Vercel is decided for the demo link only (M9). Production web hosting is part of N13.
- **API:** at least two instances behind HTTPS for zero-downtime deploys.
- **Worker:** at least one instance; generation concurrency limited per college (D11).
- **Database:** MongoDB Atlas, Mumbai (M8), replica set, backups per S7.
- **Same registrable domain** for web and API is proposed so the refresh cookie can be `SameSite=Strict` (N14, S9).
- Region and provider for API and worker: **OPEN** (D4, N13). Because they process personal data, the default proposal is an Indian region.

## 9. Observability

- Structured JSON logs (approved logging package) with request id, college id, user id (no names, phone numbers or emails), route, status and duration.
- `/health` (process up) and `/ready` (database reachable, migrations current).
- Metrics from logs at first: request rate and latency by route, error rate, job queue depth and duration, generation outcomes, outbox backlog, notification failures.
- Error tracking and alerting provider: **OPEN** (N11).
- Audit events are separate from logs and stored in the database (`DATABASE_DESIGN.md`).

## 10. Testing strategy

| Layer | Scope | Tooling |
| --- | --- | --- |
| Unit | `packages/core` (grid, audiences, clash predicates, validator, capacity, generator, moves), contracts, policy functions, utilities | Node's built-in test runner (P6, already used) |
| Property | Validator agrees with a brute-force reference on random timetables; generator output always passes the validator; audience clash rules are symmetric | Approved property-testing package (fast-check, M10) |
| Integration | Every API route against a real MongoDB replica set: validation, authorization matrix, two-college isolation, transactions, concurrent edits, idempotency, rate limits, job lifecycle, import all-or-nothing | HTTP test client + ephemeral replica set (N7) |
| End-to-end | Journeys J1 to J6 in English and Punjabi, desktop and a 360 px phone | Browser runner (N7) |
| Accessibility | Automated scan on every screen in end-to-end runs; manual keyboard and screen-reader passes per release | Scanner with the browser runner (N7) |
| Performance | Bundle size budget check in CI; 3G profile run for student pages; load test before launch (T5) | Build output check; tooling to approve |
| Security | Dependency audit in CI, secret scan, authorization matrix tests, penetration test before launch | npm audit; others to approve |

CI (when added in Phase 2) runs lint, typecheck, unit, property and integration tests, and the build on every push; end-to-end tests on the main branch and before releases.

## 11. Architectural decisions and rationale

| # | Decision | Why |
| --- | --- | --- |
| A1 | Keep Next.js as the React layer; no data access in Next.js | Reuses working screens (M2); keeps business logic in one server (Express) |
| A2 | Separate Express API and worker processes | Long CPU-bound generation must not block request handling |
| A3 | Shared `packages/core` for rules | Browser feedback, API enforcement and generator cannot disagree |
| A4 | Shared `packages/contracts` with Zod | One definition for validation, types and API documentation |
| A5 | Tenant-scoped data layer with AsyncLocalStorage context | MongoDB has no row-level security; isolation must not depend on each query remembering a filter (M7) |
| A6 | Per-draft revision + transaction + validator, with occupancy indexes as a backstop | Unique indexes cannot express batch, elective, combined-class, limit or availability rules; serialising writers per draft makes the validator's check race-free |
| A7 | MongoDB-backed job queue and rate-limit store | No Redis to host (M6) |
| A8 | Outbox pattern for notifications and side effects | Notifications are sent only for committed changes, survive crashes, and can be held for the undo window |
| A9 | TypeScript heuristic generator with repair, in worker threads | Pure MERN, deterministic, already proven on the sample college (M5) |
| A10 | Browser print for PDF at MVP | Renders Gurmukhi correctly with the page's fonts and needs no server dependency (D23 deferred) |
