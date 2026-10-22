# TECHNICAL_PLAN.md

> **Scope note (2026-10-21).** This document describes the full production platform, which is future work. The current build is a frontend-only prototype (Next.js, sample data, browser storage; no backend, database or Docker). For what exists now, see `CLAUDE.md`, `README.md` and `docs/DECISIONS.md` (P1 to P8); they win where this document disagrees about the prototype.

Architecture, data, API, security, and testing. Decisions and open items: PROJECT_SPEC.md sections 3 and 4.

## 1. Architecture

```
Browser (Next.js, TS)  --HTTPS-->  FastAPI (REST /api/v1)  --SQL-->  PostgreSQL (Indian region, RLS)
        |                               |                                  ^
        |                               +--enqueue--> Redis (RQ) --> Worker (OR-Tools solver,
        |                                                             import, export/PDF, notifications)
        +-- cached Today/Week (service worker)       Worker --> SMS / email providers, file storage
```

- Browser calls FastAPI directly; exact-origin CORS; app and API on the same registrable domain (S9, OPEN) so SameSite cookies work.
- API is stateless. Workers run separately; solver jobs are isolated from the API process.
- Job progress by polling `GET /jobs/{id}` (D12 default); results in the database.
- External services behind interfaces (`SmsProvider`, `EmailProvider`, `FileStore`, `PdfRenderer`) so providers can change.

## 2. Repository layout

```
apps/web/   Next.js app (app router), i18n catalogues, tests
apps/api/   app/{api,core,models,schemas,services,solver,workers,i18n}, alembic/, tests/
docs/       the planning documents
.github/    CI workflows
Makefile, docker-compose.yml (local Postgres, Redis), .env.example
```

## 3. Authentication and sessions

- Passwords: Argon2id (parameters S10, OPEN); minimum 10 characters, common-password check, not the last 3.
- Access token: short-lived JWT (lifetime S1, 15 minutes proposed), held in memory only. Refresh token: opaque, stored hashed, delivered in a Secure, HttpOnly, SameSite cookie, rotated on each use; reuse of an old token revokes the whole session family. CSRF: SameSite plus a custom header and Origin check on cookie-authenticated endpoints.
- OTP: 6 digits, 5 minutes, stored hashed, attempt cap (S2), resend after 30 seconds, constant-time compare.
- Login lockout: 5 failures, 15 minutes; identical response for unknown account and wrong password; rate limits per IP and per account.
- Invites: 7 days, single use, hashed token.
- Google sign-in only for emails matching an invite or roster.
- Idle timeout: 30 minutes for staff roles, 7 days for students.
- Roles are checked against the database membership on every request (also needed for the RLS context); tokens carry identity only, so removing a role takes effect at once.
- JWT: pinned algorithm, key ids with rotation, issuer, audience, and expiry validated; no secrets or role lists trusted from claims.
- Rate limits for auth fail closed if Redis is unavailable. Public endpoints (register, OTP request) use CAPTCHA and per-number, per-IP, and per-college daily caps with a monthly SMS budget alert.
- Idempotency keys are stored per user and route for 24 hours.

## 4. Multi-tenancy

- Every tenant table has `college_id NOT NULL`; composite foreign keys `(college_id, id)` stop cross-college references.
- RLS policy on every tenant table: `college_id = current_setting('app.college_id')::uuid`. Set with `SET LOCAL` inside each transaction after the API verified membership.
- Roles: `api` and `worker` (non-owner, no BYPASSRLS), `migrator` (owner), `reporting` (read-only). Platform operations use explicit, audited code paths.
- A test creates two colleges and tries every endpoint with the other's ids: expect 404 and no rows.

## 5. Data model

Types: UUID primary keys, `timestamptz`, `row_version int` on editable records, soft delete (`deleted_at`) where a recycle bin is planned, JSONB only for rule parameters and snapshots.

Groups and tables:

- **Platform:** universities, colleges (status: pending, verified, rejected, suspended), college_documents, templates, users, memberships (user, college, role, scope), invites, otp_challenges, auth_sessions, consents, support_access_grants (P2), audit_log (append-only).
- **Academic structure:** academic_years, semesters, departments, programmes, sections, batches, students (minimal roster), subjects, subject_offerings, teachers, teacher_subjects, teacher_availability, rooms, room_shared_departments, room_blocks, time_grids, periods, shifts, holidays_events, teaching_assignments, elective_groups and subjects (P2), combined_classes and sections (P2), student_enrolments (P2).
- **Rules and runs:** rule_settings, custom_rules, generation_runs (status, scope, seed, input snapshot, score, error).
- **Timetable:** timetable_versions, timetable_entries, timetable_entry_sections, timetable_exceptions, timetable_reviews (P2), entry_comments (P2).
- **Operations (P2):** leave_requests, substitutions, swap_requests, room_booking_requests, cross_college_busy.
- **Added after review:** setup_progress (wizard state per college), availability_windows (collection deadline and reminders), idempotency_keys, problem_reports; `is_sample` flag on tenant data; `UPDATE` and `DELETE` revoked on audit_log for the API role.
- **Messaging and files:** notification_events, notifications, notification_preferences, device_tokens (P2), import_jobs, export_jobs, share_links (P2), calendar_feeds (P2).

Timetable entry:

- Columns: `id, college_id, version_id, subject_offering_id, teacher_id, room_id, grid_id, weekday, start_seq, span, slot int4range, locked, source (solver|manual), row_version`.
- `slot = int4range(start_seq, start_seq + span)`.
- Exclusion constraints (extension `btree_gist`), scoped to a version: `EXCLUDE USING gist (version_id WITH =, teacher_id WITH =, weekday WITH =, slot WITH &&)`, and the same for `room_id`.
- The teacher and room exclusion constraints are `DEFERRABLE INITIALLY DEFERRED` so swaps can pass through a clashing state inside one transaction (they cannot be used with `ON CONFLICT`); a test covers a swap.
- Grid handling: one grid per college at MVP (D6 keeps the schema ready for more, but the constraints assume one); periods and breaks are locked once a draft exists.
- Exceptions are keyed by (section or batch, date, period, subject); the entry id is only a hint.
- Section clashes involve many sections per entry (combined classes), so they use a deferred constraint trigger over `timetable_entry_sections` plus service-layer checks.
- Lab sessions: one entry with `span >= 2`; a CHECK ensures it does not cross a break (validated by the clash checker using the grid).

Key indexes: `(college_id, ...)` leading on every tenant index; entries by `(version_id, weekday)`, `(teacher_id)`, `(room_id)`; memberships by `(user_id)`; notifications by `(user_id, created_at)`; audit by `(college_id, created_at)`. Unique natural keys per college (subject code, room code, teacher employee id, section code).

Constraints worth stating: one active semester per programme; one published version per college and semester (partial unique index); batch strengths sum to section strength; a room is owned by a department or shared, never both; period grids do not overlap.

Important queries (all need an index plan): timetable by section, teacher, room, department for a version; "free room at slot"; teacher load per week; clash audit; today's classes for a student with exceptions overlaid; pre-check aggregates.

## 6. Solver

- OR-Tools CP-SAT, one model per generation run, run in an RQ worker with time limit (2, 5, 10 minutes), memory cap, and a per-college concurrency limit (D11, OPEN).
- Variables: assignment of each required session to (weekday, start period, room, teacher where not fixed). Hard constraints from PROJECT_SPEC.md section 7; soft constraints become weighted objective terms (core five at MVP).
- Locked entries are fixed inputs. Output is verified by the independent clash checker before it can be saved; a result with any violation is discarded, never shown.
- Pre-check (pure Python, fast): required hours versus available teacher and room capacity, missing assignments, empty availability, room kind shortages. Returns blocking and warning items with fix links.
- Determinism: input snapshot and seed stored per run (reproducible runs at P2, T3).
- Failure handling: crash gives one automatic retry; timeout returns best-so-far when feasible; infeasible returns the pre-check explanation.

## 7. API conventions

Base `/api/v1`. Tenant routes `/api/v1/colleges/{college_id}/...`; platform routes `/api/v1/platform/...`.

| Group | Examples |
| --- | --- |
| Auth | `POST /auth/otp/request`, `/auth/otp/verify`, `/auth/login`, `/auth/google`, `/auth/refresh`, `/auth/logout`, `/auth/password/forgot`, `/auth/password/reset`, `/auth/invites/{token}/accept` |
| Me | `GET /me`, `PATCH /me`, `GET /me/memberships` |
| Colleges | `POST /colleges/register`, `GET /platform/colleges?status=`, `POST /platform/colleges/{id}/verify`, `/reject`, `/suspend` |
| College admin | `GET/POST /colleges/{id}/users`, `/invites`, `PATCH /memberships/{id}` |
| Setup | `GET/PATCH /setup`, `/semesters`, `/settings`, `/templates/{id}/apply` |
| Master data | CRUD for departments, programmes, sections, batches, subjects, offerings, teachers, rooms, periods, holidays, assignments; bulk `POST .../import` |
| Availability | `GET/PUT /teachers/{id}/availability` |
| Imports | `POST /imports` (multipart, 202), `GET /imports/{id}`, `POST /imports/{id}/confirm` |
| Rules | `GET/PUT /rules`, CRUD `/rules/custom`, `POST /entries/{id}/lock` |
| Generation | `POST /generations/precheck`, `POST /generations` (202), `GET /generations/{id}`, `POST /generations/{id}/cancel`, `/select` |
| Timetable | `GET /timetables/{version}/entries`, `PATCH /entries/{id}` (row_version), `POST /timetables/{version}/validate`, `/score`, `/save-version`, `/submit`, `/publish`, `/unpublish` |
| Views | `GET /views/section/{id}`, `/teacher/{id}`, `/room/{id}`, `/department/{id}`, `/today` |
| Exports | `POST /exports` (202), `GET /exports/{id}` |
| Exceptions | `POST /exceptions` (cancel, room change), `GET /exceptions`, `POST /exceptions/review` (D10) |
| Notifications | `GET /notifications`, `POST /notifications/{id}/read`, preferences |
| Reports | `GET /reports/clash-audit`, `/quality` |
| Jobs and health | `GET /jobs/{id}`, `GET /health`, `GET /ready` |

Conventions:

- Authentication on every route except health, register, OTP request, login, invite accept, and public share views (P2).
- Errors: `{error:{code,message,fields:[{field,message}],request_id}}`. Codes: 400 bad input, 401 unauthenticated, 403 forbidden role, 404 unknown or cross-college, 409 `version_conflict` / `duplicate` / `state_conflict`, 413 too large, 422 validation, 423 locked, 429 rate limited, 500, 503.
- `Idempotency-Key` on POSTs that create jobs or send messages; `row_version` required on PATCH/PUT; list endpoints use cursor pagination (`limit`, `cursor`); OpenAPI generated and used to type the web client (T2, OPEN).
- Request size limits: JSON 1 MB; uploads 5 MB; reject by content type and magic bytes.

## 8. Security requirements (summary)

- **AUTH:** section 3. 2FA for PA at MVP is S4 (OPEN).
- **AUTHZ:** role checks via one dependency per route; scope checks (department, own record); test that every route declares a policy.
- **APP:** output encoding, strict CSP, HSTS, `X-Content-Type-Options`, frame denial, no inline scripts; CSRF as in section 3; file uploads scanned and stored outside the web root (D15, OPEN); import files parsed with limits (rows, columns, formula injection stripped, CSV cells beginning with `=+-@` escaped in exports).
- **DATA:** encrypt in transit and at rest; minimal roster only; mobile numbers and emails masked in UI where not needed; consent recorded; export and deletion on request (P2); legal review before launch (S11).
- **INFRA:** secrets in host store; least-privilege roles; private DB network; backups with tested restore (S7); separate staging and production.
- **Parsing and rendering:** uploaded xlsx/csv are parsed in the worker with limits on decompressed size, rows, and columns, and safe XML parsing; PDF rendering uses local templates only with external fetching disabled and all user text escaped; development fake providers write to a local inbox and are disabled elsewhere.
- **LOG:** structured logs with request id, no personal data; append-only audit for logins, role changes, publishes, exports, support access.
- **BCK:** daily backups, point-in-time recovery if the host supports it, restore drill before launch.
- **3P:** dependency pinning, automated vulnerability scan in CI (tool T1, OPEN), SBOM at release; providers reviewed before use.
- Rate limits (values D19, OPEN) on login, OTP, invites, import, generation.
- Independent penetration test before the first real college (S12).

## 9. Testing strategy

Pyramid: many unit tests, focused integration tests against a real PostgreSQL (with RLS on), a few Playwright journeys.

| Layer | Tooling | Must cover |
| --- | --- | --- |
| Unit | pytest, Vitest | Clash checker, grid maths, validators, permission policies, rule parsing, i18n key coverage |
| Property tests | Hypothesis | Clash checker agrees with a brute-force reference on random timetables; solver output never has violations |
| Integration | pytest + Postgres | Constraints (exclusion, unique, composite FK), RLS with two colleges, every route's authz, import all-or-nothing, job lifecycle, idempotency, optimistic locking |
| Solver | pytest | Known feasible and infeasible fixtures, locked slots, time-limit best-so-far, 20-section benchmark in under 2 minutes |
| End to end | Playwright | Journeys J1 to J8 below, in English and Punjabi, on desktop and a 360 px phone |
| Accessibility | axe in Playwright, manual keyboard and screen-reader pass | WCAG 2.1 AA on every screen |
| Performance | Lighthouse CI, k6 | Student page 150 KB / 3 s on 3G profile; API p95 under 300 ms for views |
| Security | Pipeline scans, authz matrix tests, pen test | Section 8 |

Journey tests:

- J1 college registers, is verified, and activates.
- J2 coordinator imports data with errors, fixes, confirms.
- J3 coordinator generates, a clash-free draft appears, an edit is rejected when it would clash.
- J4 stale edit gives a version conflict.
- J5 coordinator submits, principal publishes, undo works within 15 minutes.
- J6 teacher sets availability and sees the published timetable.
- J7 student signs in with roll number and SMS code, sees Today, sees a change badge, opens offline.
- J8 cancellation sends SMS only to affected people.

Required test ids (TM-01 to TM-48) are tracked in `docs/TEST_MATRIX.md`, created in Phase 0 from the Testing Strategy document; each phase's acceptance lists the ids it must pass. The first ten to write: TM-01 teacher clash rejected by the database; TM-02 room clash rejected; TM-03 section clash rejected; TM-04 cross-college read returns 404; TM-05 RLS blocks a missing context; TM-06 solver output equals clash-checker verdict; TM-07 publish with a clash refused; TM-08 refresh-token reuse revokes the session; TM-09 OTP attempt cap; TM-10 upload with wrong magic bytes refused.

Release gate: all tests green, no high or critical scan findings, restore drill done, pen-test findings closed, legal review done (S11), Punjabi copy reviewed (U9).

## 10. Deployment and operations

- Environments: local (Docker Compose), staging, production. Host and region are OPEN (D4): must have an Indian region and managed PostgreSQL with backups.
- CI (GitHub Actions): lint, type-check, unit, integration (service containers), build, scan; deploy from main after approval.
- Observability: error tracking (provider OPEN), structured logs, `/health` and `/ready`, queue depth and job-duration metrics, alerts on failed jobs and SMS delivery failures.
- Migrations run by the `migrator` role as a deploy step; backwards-compatible changes only.
- Feature flags for P2 items; configuration through environment variables; `.env.example` documents each.

## 11. Known risks to verify early (spikes)

1. Next.js student page within 150 KB on 3G; fall back to static HTML plus a small script if not.
2. Gurmukhi and Devanagari PDF shaping (D23).
3. DLT registration lead time for SMS (Ext1); start before Phase 2.
4. Solver speed on a realistic 20-section, 40-teacher, 30-room college (D11).
5. RLS performance with composite indexes under load.
