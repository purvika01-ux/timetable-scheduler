# DECISIONS.md

Decision log. Earlier decisions (D1 to D24, tokens, region, languages) are in PROJECT_SPEC.md section 3; open items are in section 4. This file records decisions taken since, and every scope cut (IMPLEMENTATION_PLAN.md, "Hackathon fast path").

## 2026-10-21: TC dashboard slice (owner: Purvika)

Scope: dev-only login, then the Timetable Coordinator dashboard (setup data, pre-check, generate, view and edit, publish) on a seeded demo college. Other roles, real auth, notifications, SMS, exports and P2 items are out of scope.

### Answers

| Id | Question | Decision |
| --- | --- | --- |
| Q1 | Local environment | Native PostgreSQL 16 on Windows (no Docker). Redis and RQ are not used locally; see C2. |
| Q2 | TC publish (matrix says CA only) | Spec unchanged: TC submits; CA publishes. For the demo, sign in as CA through dev login to publish. |
| Q3 | Batches and parallel groups (ARCHITECTURE_REVIEW 1.1) | Whole-section classes only for this slice: no lab batches, no electives. Labs run for the whole section. |
| Q4 | Unplaced sessions (ARCHITECTURE_REVIEW 1.8) | Allowed: a result may list sessions it could not place, never a clash; they can be placed by hand. |
| Q5 | Grids (ARCHITECTURE_REVIEW 1.2) | One period grid per college, enforced in the schema. |
| Q6 | Co-teaching (ARCHITECTURE_REVIEW 1.6) | One teacher per class. Split teaching uses two assignments. |
| Q7 | Dev placeholders for OPEN items | Access token 15 minutes (S1), one solver run per college (D11), 12-hour time (U2), Noto Sans (U4). Each lives in configuration marked "placeholder, OPEN"; not final. |
| Q8 | Demo data (D21) | Demo college is a separate tenant flagged `is_sample`, with invented data. |
| Q9 | Punjabi copy | Drafted by Claude Code and marked unreviewed until the U9 review. |

### Scope cuts (approved)

| # | Cut | Risk accepted |
| --- | --- | --- |
| C2 | No Redis/RQ locally: jobs use a PostgreSQL job table (`SELECT ... FOR UPDATE SKIP LOCKED`) and a separate worker process. Departs from D3 for this slice. | Revisit D3 at deployment (D4); queue semantics must be re-tested if RQ returns. |
| C3 | Section clash via a `section_id` column on entries with its own exclusion constraint, not a link table and trigger | Combined classes (P2) need a migration. |
| C4 | One seeded active semester; no programmes, academic years or semester screens | Schema migration when added. |
| C5 | Import parsed during the request with strict limits (5 MB, 5,000 rows, safe XML), not in the worker; all-or-nothing mode only | A large file blocks one API request for a few seconds. |
| C6 | No seven-step setup wizard; list pages plus a home checklist | Less guided first use. |
| C7 | No rules screen; two soft preferences with fixed weights (spread across the week, few gaps); no never/only rules | Lower timetable quality. |
| C8 | Generation scope is the whole college only | None at demo size. |
| C9 | No cursor pagination; lists return everything in the `{items, next_cursor}` shape | Very large colleges. |
| C10 | Undo and redo in the browser only | Undo history lost on reload. |
| C11 | No HTML mock-up approval before screens | Design rework later. |
| C12 | No Storybook; hand-typed API client with Zod (T2 stays OPEN) | Client types can drift from the API. |
| C13 | Playwright J3 and J4 in English on desktop with axe only | Punjabi and phone regressions not caught automatically. |
| C14 | `Idempotency-Key` on generate and import-confirm only | Double submits elsewhere (unique keys catch most). |

Kept (not cut): C1 row-level security with a non-owner `api` role, set per transaction.

## 2026-10-21: Frontend-only hackathon prototype (owner: Purvika)

The owner directed a working prototype for the hackathon evaluation in place of the full-platform phases. This supersedes the TC dashboard slice above for now; that slice and the full plan remain future work.

| Id | Decision |
| --- | --- |
| P1 | Frontend only: Next.js, React, TypeScript, Tailwind in `apps/web`. No Python, Docker, database, Redis, workers, external auth or paid services. No new packages. |
| P2 | Primary role is the Teacher (sample teacher "Dr. Amandeep Singh", CSE). A generation demo covers the core requirement. |
| P3 | Invented sample data; browser localStorage for availability and the teacher's timetable; reset with confirmation. |
| P4 | Deterministic greedy TypeScript scheduler plus an independent validator; unplaced sessions reported with reasons; whole-section classes only (consistent with Q3, Q4, Q6). |
| P5 | Teachers may move their own classes in the prototype to demonstrate live clash checking (in the product, moves belong to the coordinator). |
| P6 | Tests use Node's built-in test runner instead of Vitest (not installed; no new packages). |
| P7 | English only and 12-hour time in the prototype; Punjabi stays in the full plan. |
| P8 | Backend and infrastructure removed from the working tree to keep the prototype simple: `apps/api` (FastAPI skeleton and tests), `docker-compose.yml`, `Makefile`, Dockerfiles, `.env.example`. They remain in git history (commit `63ab442`). The full-platform documents stay as the future design. |

## 2026-10-26: MERN platform direction (owner: Purvika)

Answers to the decisions in `PRODUCT_AUDIT.md` section 11. The product becomes a multi-college platform on MERN (MongoDB, Express, React, Node).

| Id | Decision |
| --- | --- |
| M1 | MERN supersedes D1 (JWT issued by FastAPI; now issued by Express), D2 and C1 (PostgreSQL row-level security), D3 and C2 (Redis + RQ; PostgreSQL job table), C3 (exclusion constraints), Q1 (native PostgreSQL), the "PostgreSQL in an Indian region" wording (now: MongoDB in an Indian region), and P8 for the platform. CLAUDE.md, TECHNICAL_PLAN.md and IMPLEMENTATION_PLAN.md are to be rewritten for MERN. Rules that do not depend on the stack stay: Indian data region, tenant isolation with API checks, no access token in browser storage, append-only audit log, English and Punjabi, roles, permissions and business rules. |
| M2 | Front end stays Next.js (React), talking to a separate Express API (D24 pattern). |
| M3 | Order of work: Phase 0 (correctness fixes, push, deploy), then Phase 1 (browser-only "any college" setup), then the MERN backend (Phases 2 onwards in PRODUCT_AUDIT.md section 10). P1 (frontend only, no backend) stays in force until Phase 2 starts. |
| M4 | The demo opens as the Coordinator, with a clearly marked demo role switcher to the Teacher view. Only coordinators move classes; teachers view their timetable and set availability. Supersedes P2 and P5. |
| M5 | Solver: keep and improve the TypeScript heuristic (repair and local search), run in a Node worker thread. No Python solver service. Supersedes the OR-Tools CP-SAT plan. |
| M6 | Job queue: stored in MongoDB (a jobs collection or a MongoDB-backed library). No Redis. |
| M7 | Tenancy: shared collections with `collegeId` on every tenant document, enforced in one data-access layer, tested with two colleges on every endpoint. |
| M8 | Database host: MongoDB Atlas, Mumbai region, after confirming region availability and pricing. Resolves the database part of D4. |
| M9 | Live link on Vercel (the owner creates the account and connects the repository). Prototype reaches GitHub by pushing `hackathon-prototype` and merging a pull request into `main` (default chosen; owner had no preference). Each push and deploy is still confirmed with the owner first. |
| M10 | Packages: the list in the 2026-10-26 walkthrough is approved in principle (fast-check; express, mongoose, zod, helmet, express-rate-limit, pino; @node-rs/argon2, jose); exact packages and versions are confirmed at the start of each phase. MongoDB library: Mongoose. PostCSS advisory: pin a fixed PostCSS through npm `overrides` in Phase 0 if tests and build pass; upgrade to Next 16 in Phase 2. |
