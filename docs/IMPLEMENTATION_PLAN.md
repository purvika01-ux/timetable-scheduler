# IMPLEMENTATION_PLAN.md

Ordered phases. Work one phase at a time; do not start a phase until its dependencies pass acceptance. Each phase ends with tests green, lint clean, and docs updated. Items marked **ASK** need an owner decision first (see PROJECT_SPEC.md section 4); work on unblocked tasks meanwhile.

Strategy: a thin end-to-end slice first (register, import, generate, edit, publish, student sees it), built on the real multi-college and security foundations, then widen. P2 and Later items are not in scope.

Phase map:

| # | Phase | Depends on |
| --- | --- | --- |
| 0 | Setup and spikes | none |
| 1 | Database foundation | 0 |
| 2 | Backend core (auth, tenancy, authz) | 1 |
| 3 | Onboarding and master data | 2 |
| 4 | Import | 3 |
| 5 | Rules, pre-check, solver | 3 |
| 6 | Timetable editing and publishing | 1, 5 |
| 7 | Frontend shell, design system, i18n | 0, 2 (can start after Phase 2 contracts exist) |
| 8 | Frontend screens | 3 to 7 |
| 9 | Views, exports, notifications, exceptions, student/teacher experience | 6, 7 |
| 10 | Hardening, testing, accessibility, performance | 8, 9 |
| 11 | Deployment and launch | 10, ASK D4 |

Phases 7 and 8 proceed alongside 3 to 6 using the OpenAPI contract; keep each branch small.

---

## Phase 0: Setup and spikes

Deliverables:

- Monorepo (`apps/web`, `apps/api`, `docs/`), Docker Compose (Postgres, Redis), Makefile, `.env.example`, pre-commit (formatters, secret scan), CI skeleton (lint, type-check, tests).
- `docs/TEST_MATRIX.md` built from the Testing Strategy (TM-01 to TM-48), `docs/DECISIONS.md` seeded from PROJECT_SPEC.md sections 3 and 4.
- README with run instructions; CLAUDE.md commands section filled in.
- Spike notes in `docs/spikes/`: (a) Next.js student page size on a 3G profile; (b) Gurmukhi/Devanagari PDF with WeasyPrint and ReportLab (D23); (c) solver on a realistic 20-section college (D11); (d) RLS with composite indexes at 1 million rows.

Acceptance:

- `make dev` starts web, API, worker, database, Redis; `/health` returns 200; CI is green on an empty test.
- Each spike has a written result and recommendation; owner picks the PDF engine and confirms the web approach.
- ASK: D4 hosting and region, S9 domain, D15 file storage, Ext1 SMS provider and DLT registration start, Ext2 email provider, U1 brand.

## Phase 1: Database foundation

Deliverables:

- Alembic baseline; roles (`api`, `worker`, `migrator`, `reporting`); extensions (`btree_gist`, `pgcrypto`).
- Tables for platform, structure, rules, runs, timetable, messaging groups (TECHNICAL_PLAN.md section 5; P2 tables only when needed) with `college_id`, composite FKs, `row_version`, indexes, unique keys.
- RLS policies and the per-transaction context helper.
- Exclusion constraints and the section-clash trigger.
- Seed script: two sample colleges with invented data, one realistic 20-section set.

Acceptance:

- TM-01 to TM-05 pass (teacher, room, section clash rejected; cross-college read blocked; missing RLS context returns zero rows).
- A swap of two classes in one transaction succeeds (deferred constraints) while a final clashing state is rejected.
- Migrations apply and roll back on an empty database; the `api` role cannot bypass RLS (verified by test).

## Phase 2: Backend core

Dependencies: Phase 1.

Deliverables:

- FastAPI app structure, config, structured logging with request ids, error format, OpenAPI export.
- Auth: password login, OTP request and verify, invites, password reset, refresh rotation with reuse detection, lockout, rate limits (ASK D19, S1, S2, S10), Google sign-in.
- Membership and role dependency, tenant resolver from the URL path, default-deny route registry test.
- Audit log writer; job framework (RQ) with job status endpoint and idempotency keys.
- Provider interfaces with fake implementations for SMS, email, file store, PDF.

Acceptance:

- Auth and authz tests pass (TM-04, TM-08, TM-09 plus the matrix in TEST_MATRIX.md): refresh reuse revokes the family, OTP attempt cap, lockout, cross-college 404 for every route, every route declares a policy.
- Coverage on the auth module at least 90 percent.

## Phase 3: Onboarding and master data

Dependencies: Phase 2.

Deliverables:

- College registration, document upload (ASK D15; fake store until chosen), platform verification queue with reasons, status transitions and notifications.
- Templates (seeded for the major Punjab universities and boards; ASK owner for the list), apply-template action.
- Setup endpoints, academic years and semesters, settings.
- CRUD with validation for departments, programmes, sections, batches, subjects, offerings, teachers, rooms, periods and grid, holidays, teaching assignments, availability.
- Sample college generator (D21 ASK).

Acceptance:

- J1 passes at API level. Validation rules in PROJECT_SPEC.md section 5.4 each have a test (batch sums, lab minimum, room ownership, overlapping periods).
- Unique-key and duplicate errors return 409 with field messages.

## Phase 4: Import

Dependencies: Phase 3.

Deliverables:

- Template downloads, upload endpoint (5 MB, 5,000 rows, magic-byte check, formula stripping), parse in worker, row-level error report, preview, confirm step, all-or-nothing and skip-bad-rows modes, re-import by natural key.
- Kinds: teachers, rooms, subjects, sections, students, users.

Acceptance:

- J2 at API level; malformed, oversized, duplicated, and wrong-type files give clear errors; a failed import leaves no partial data; Excel serial dates, merged cells, and Unicode (Gurmukhi) names import correctly.

## Phase 5: Rules, pre-check, solver

Dependencies: Phase 3 (data), Phase 0 spike (c).

Deliverables:

- Independent clash checker module (pure function, no database dependency).
- Rule settings (hard constraints, five core soft preferences with weights), never/only rules, locked slots.
- Pre-check returning blocking and warning items with fix links.
- CP-SAT model, worker task with time limit, memory cap, concurrency limit (ASK D11), progress updates, cancel, one retry on crash, best-so-far on timeout.
- Generation endpoints, result stored as a draft version.

Acceptance:

- Solver tests (TM-06 plus the solver ids in TEST_MATRIX.md): property test agrees with a brute-force checker; fixtures feasible and infeasible; locked slots respected; output with any violation discarded; 20-section benchmark finishes within the selected limit with zero clashes.
- Cancel and crash do not leave a partial draft.

## Phase 6: Timetable editing and publishing

Dependencies: Phases 1 and 5.

Deliverables:

- Entry read and edit endpoints with `row_version`, validate and score endpoints, swap, lock, undo and redo support (server snapshot per session).
- Save version, submit, publish (zero clashes required), unpublish within 15 minutes, one published version per semester.
- D10 exception review on publish.
- Clash audit report and quality score.

Acceptance:

- J3, J4, J5 at API level. Stale edit returns 409. Publish with a clash is refused. Publishing supersedes the old version atomically. Unpublish after 15 minutes is refused with a clear message.

## Phase 7: Frontend shell, design system, i18n

Dependencies: Phase 0, Phase 2 contract.

Deliverables:

- Next.js app with typed API client generated from OpenAPI, auth flow (in-memory access token, silent refresh), route guards by role, error boundary, offline-aware fetch.
- Tokens, typography, components from UI_UX_GUIDELINES.md section 8 (including the timetable grid and class card), Storybook or MDX component pages.
- i18n with `en` and `pa`; language toggle; key-coverage test.
- Student shell and service worker (Today and Week cache).

Acceptance:

- Axe passes on every component story; keyboard walk-through of the grid works (select, move, confirm, cancel); the student shell meets 150 KB and 3 s on the 3G profile (Lighthouse CI).
- ASK: approve the four HTML mock-ups (editor, student Today, import preview, generation result) before Phase 8 screens begin.

## Phase 8: Frontend screens

Dependencies: Phases 3 to 7.

Deliverables, in this order: login and invites, registration, platform verification; setup wizard; master-data lists and forms; import flow; availability grid and inputs tracker; rules; generate (pre-check, progress, result); timetable editor with live clash feedback; submit, publish confirmation, exceptions review; reports; user management.

Acceptance:

- J1, J2, J3, J4, J5, J6 pass in Playwright in English and Punjabi on desktop and a 360 px phone. All states (loading, empty, error, offline, permission) exist for each screen. No hard-coded user-facing strings.

## Phase 9: Views, exports, notifications, exceptions, student and teacher experience

Dependencies: Phases 6 and 7.

Deliverables:

- View endpoints and screens (section, teacher, room, department, Today); change badges.
- PDF export with the chosen engine (Gurmukhi proven); a download job with expiry.
- Notification pipeline: events, templates in `en` and `pa`, in-app, email, SMS for urgent only, delivery status, retries, preferences; quiet failures logged and surfaced to PA.
- Cancellation and room-change exceptions with targeted alerts.
- Student sign-in by roll number, mobile, and code; teacher Today and Week; offline cache with age banner.
- SMS and email providers integrated (needs Ext1 DLT approval and Ext2).

Acceptance:

- J6, J7, J8 pass. SMS goes only to affected people for urgent events. Student pages meet the performance budget. PDF renders Gurmukhi correctly (visual check against a reference). Provider failure triggers retry and an alert, never a lost message silently.

## Phase 10: Hardening, testing, accessibility, performance

Dependencies: Phases 8 and 9.

Deliverables:

- Full authz matrix test across roles and routes; rate limits on; security headers and CSP; dependency and secret scans (ASK T1 tool); upload scanning (ASK D15).
- Accessibility audit (automated plus keyboard plus screen-reader of J3 and J7); fix findings.
- Load tests (k6) at target (ASK T5): API p95 under 300 ms on views; solver queue behaviour with several colleges at once.
- Browser and device matrix run (ASK T6); chaos checks (Redis down, worker killed, provider down).
- Backup and restore drill; runbooks for incidents, SMS failure, and failed deploy.
- Independent penetration test booked (ASK S12) and findings fixed.
- Legal review complete (S11), consent text and privacy notice live, Punjabi copy reviewed (U9).

Acceptance:

- Release gate in TECHNICAL_PLAN.md section 9 satisfied; no high or critical findings open; test matrix 100 percent of MVP ids passing.

## Phase 11: Deployment and launch

Dependencies: Phase 10, ASK D4, S9, S6, S7.

Deliverables:

- Infrastructure on the chosen Indian-region host; staging and production; secrets in the host store; managed PostgreSQL with backups and point-in-time recovery; Redis; worker service with resource caps.
- CI/CD with approval to production; migration step; health checks and rollback.
- Domain, TLS, HSTS, same-site cookie domain; error tracking, metrics, alerts.
- Pilot onboarding of one college with a support channel; seeded templates; sample data off in production unless D21 says otherwise.
- Hackathon submission pack: public repo (source, README, CLAUDE.md), live link, short demo script.

Acceptance:

- A real pilot coordinator completes the thin slice with a real spreadsheet unaided; a student on a mid-range phone opens Today within 3 seconds on a 3G profile; restore drill repeated on production-like data; rollback rehearsed.

---

## Hackathon fast path (if the submission date arrives first)

Ship Phases 0 to 3, a reduced 4, 5, 6, a minimal 7 and 8 (wizard, import preview, generate, editor, publish), and the student Today view from Phase 9 with email and in-app only. Keep isolation, zero-clash, and accessibility rules intact. Record cut items in `docs/DECISIONS.md`. Ask the owner before cutting anything.

## Phase risks

| Risk | Phase | Mitigation |
| --- | --- | --- |
| DLT approval delays SMS | 9 | Start registration in Phase 0; ship with email and in-app if late |
| Gurmukhi PDF shaping | 9 | Spike in Phase 0; fall back to image-based export if both engines fail |
| Solver too slow on large colleges | 5 | Spike in Phase 0; decomposition by department; larger worker |
| Next.js too heavy for 150 KB | 7 | Spike in Phase 0; static student shell |
| Indian-region hosting limits | 11 | Decide D4 before Phase 3 uploads and before worker sizing |
| Scope growth | all | MVP list in PROJECT_SPEC.md; changes need owner approval |
