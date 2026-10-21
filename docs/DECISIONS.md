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
