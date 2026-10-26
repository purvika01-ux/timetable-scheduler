# IMPLEMENTATION_ROADMAP.md

Dependency-aware plan from the working prototype to the multi-college MERN platform. It replaces `IMPLEMENTATION_PLAN.md` and the roadmap in `PRODUCT_AUDIT.md` section 10. Acceptance criteria ids (AC-…) and journeys (J1–J6) are defined in `PRODUCT_REQUIREMENTS.md` section 9; decision ids in its section 12.

Status on 2026-10-26: Phase 0 code complete and merged to `main`; the Vercel demo deploy is pending (owner). Phases 1 onward have not started and need the owner's approval of this sequence.

---

## 1. Principles

1. **Keep the baseline working.** After every phase the demo (sample college in the browser) still works and all tests pass (strangler approach, `PRODUCT_AUDIT.md` section 9).
2. **Rules before screens.** Scheduling rules and isolation are built and tested before the UI that depends on them.
3. **Small commits, one concern each,** with tests alongside the code (CLAUDE.md).
4. **Decisions before the work they block.** A phase does not start its blocked part until the listed decisions are answered and recorded in `DECISIONS.md`.
5. **Definition of done for every phase:** its acceptance criteria pass in automated tests; `npm test`, typecheck, lint and build pass; affected screens checked in a browser (desktop and 375 px phone); docs updated; nothing claimed that has not been verified.

## 2. Phase map

```
P0 ✓ ─▶ P1 (hackathon: any college in the browser)
  │
  └──▶ P2 monorepo, core package, CI, test tooling
          │
          ├──▶ P3 core v2: audiences, batches, electives, combined, co-teaching, validator v2, reference checker
          │        │
          └──▶ P4 API foundation: Express, MongoDB, tenant layer, contracts, errors, audit, outbox
                   │
                   └──▶ P5 identity and access: auth, sessions, invitations, memberships, policies, rate limits
                            │
                            └──▶ P6 master data and import, web on the API, i18n foundation   (needs P3 model)
                                     │
                                     └──▶ P7 generation service: jobs, worker, pre-check, generator v2
                                              │
                                              └──▶ P8 drafts, editor, versions, publish, undo
                                                       │
                                                       └──▶ P9 teacher and student experiences, exceptions,
                                                                notifications (in-app), reports, print/CSV export
                                                                │
                                                                └──▶ P10 hardening and operations
                                                                         │
                                                                         └──▶ P11 pilot and launch gates
```

P1 and P2–P3 can run in parallel (P1 touches `apps/web` screens; P2–P3 touch packaging and `packages/core`), but P2 moves the core files, so P1 should either finish first or rebase onto P2. Recommended order: P1, then P2.

## 3. Phases

### Phase 0: Correctness and submission — done (deploy pending)

Delivered: validator gaps closed (daily limit, duration, requirement consistency, duplicates, integers, completeness); teacher capacity check; incomplete results flagged; saved timetable revalidated on load; PostCSS override; audit and decisions documents. 51 tests passing. Remaining: Vercel deploy of `main` (owner creates the account, M9).

### Phase 1: "Any college" in the browser (hackathon)

Depends on: Phase 0. Decisions: M3, M4 (decided). No new packages.

Scope:
- Coordinator-first demo with a clearly labelled role switcher (Coordinator / Teacher) (M4); only coordinators move classes.
- Setup screens for the browser data set: time grid and breaks, departments, rooms (owned or shared), teachers (limits, availability), subjects, sections, course requirements; inline validation; setup checklist; pre-check using `capacity`.
- Whole-college views by section, teacher, room and department; teacher load and room-use summaries; print stylesheet ("Save as PDF").
- Export and import the whole college as one JSON file.
- Generation in a Web Worker.

Acceptance:
- A first-time user creates a small college from an empty state without help and generates a timetable that is valid and complete, or lists unplaced sessions with reasons (manual test with someone outside the project, plus an automated end-to-end-style test of the pure functions).
- An exported file imported in another browser gives the same timetable for the same seed.
- Keyboard-only run-through of setup and generation; no horizontal page scroll at 375 px.

Risk: Phase 1 screens use the prototype's whole-section model; Phase 6 extends them to batches, electives and combined classes, so forms are built field-by-field to make additions easy.

### Phase 2: Monorepo, shared core and CI

Depends on: Phase 0 (and Phase 1 if done first). Decisions: N7 (test packages), N12 (local and CI database).

Scope:
- npm workspaces: `apps/web`, `packages/core` (moved from `apps/web/src/lib/timetable`), `packages/contracts` (empty skeleton), placeholders for `apps/api`, `apps/worker`.
- CI on every push: install, lint, typecheck, unit tests, build; `npm audit` gate.
- Property-testing package (fast-check, M10) and the first property tests on the current validator.
- Rewrite `CLAUDE.md` commands for the workspace layout.

Acceptance: all existing tests run from `packages/core` unchanged in behaviour; the six demo steps work (manual regression); CI blocks a failing test and a high-severity audit finding.

### Phase 3: Core v2 (pure TypeScript, no database)

Depends on: Phase 2. Decisions: N3 (launch scope), D9 (time zone assumption).

Scope:
- Types and functions in `packages/core` for audiences (sections, batches, electives, combined), co-teaching, room features and access, parallel groups, never/only rules, avoid/prefer availability (`SCHEDULING_ENGINE.md` sections 2–5).
- Validator v2 with bucketing; `reference` brute-force checker; score module; pre-check.
- Generator stage 1 extended to the new model; stage 2 (repair) for unplaced sessions.
- Demo data extended with a batch set and an elective group.

Acceptance: AC-S2, AC-S3, AC-S4, AC-S5 (core level), AC-S6; every row of the audience table has pass and fail tests; validator under 200 ms on the 20× fixture.

### Phase 4: API foundation

Depends on: Phase 2 (and Phase 3 types for contracts). Decisions: N6 (OpenAPI generation), N12. Packages (M10, confirm versions): express, mongoose, zod, helmet, pino.

Scope:
- `apps/api` Express app with the middleware chain (`ARCHITECTURE.md` section 4), configuration validation, health and readiness.
- MongoDB connection, tenant-scoped Mongoose plugin with `AsyncLocalStorage`, collection validators, transaction helper with retries, in-house migration runner, lint rules against raw driver access.
- Error format, idempotency-key middleware, audit and outbox writers.
- `packages/contracts`: Zod schemas, error codes, OpenAPI generation committed to `docs/api/openapi.json`.
- First tenant resources without auth for internal testing only (behind a test-only flag): colleges, departments, rooms.

Acceptance: AC-T1 for every implemented route (two-college suite); a query without tenant context throws; a document without `collegeId` is refused by the database; idempotent retry returns the stored response; OpenAPI document generated in CI.

### Phase 5: Identity and access

Depends on: Phase 4. Decisions: N4, N14 and S9 (one registrable domain), N16, S1, S4, S10, D19. Packages (M10): @node-rs/argon2, jose, express-rate-limit (with a MongoDB-backed store written in-house).

Scope:
- Sign-in by email or mobile, lockout, rate limits (fail closed), access and refresh tokens with rotation and reuse detection, sign out everywhere.
- Two-step sign-in for PA (TOTP, recovery codes).
- Colleges created by PA; invitations (link shown once); acceptance; memberships, roles and scope; CA-issued reset links; last-CA protection; PA-assisted recovery.
- Policy declarations on every route; capability mapping in `packages/contracts`; authorization matrix suite.
- Remove the test-only unauthenticated flag.

Acceptance: AC-T1–AC-T4, AC-A1–AC-A4, J1 (API level); token tests in `SECURITY_MODEL.md` section 11.

### Phase 6: Master data, import, and the web app on the API

Depends on: Phases 3 and 5. Decisions: N8 (i18n library), N9 (CSV only), N17 (components), D15 (no file storage), U2–U4.

Scope:
- CRUD for calendar, grid, departments, programmes, rooms, teachers, subjects, sections, batch sets, elective groups, offerings, assignments, requirements, availability, rules; `rowVersion` everywhere; inputs-revision transaction (`DATABASE_DESIGN.md` 6.4).
- CSV templates, preview with per-cell errors, all-or-nothing confirm; CSV export with formula escaping.
- Web: sign-in, college switcher, admin shell, setup checklist and forms (reusing Phase 1 screens), typed API client with idempotency keys and retries; demo mode moved to `/demo`.
- i18n foundation: catalogues for English and Punjabi, every new string through keys, catalogue coverage test; Punjabi drafts marked unreviewed (Q9) until U9.

Acceptance: AC-D1–AC-D4, J2; AC-X2 for the new screens; demo mode unchanged.

### Phase 7: Generation service

Depends on: Phase 6 (and Phase 3 generator). Decisions: D8, D11, D12 (polling), N3.

Scope:
- `apps/worker`: MongoDB job queue with leases, heartbeats, retries and cancellation; generation in `worker_threads`; input snapshots; progress.
- Pre-check endpoint and screen; generation screen with progress, cancel, result views, unplaced reasons; stage 3 (improve) of the generator; benchmarks on the realistic fixture.

Acceptance: AC-S1, AC-S5, AC-S6, AC-S7 end to end; J6 (needs the pre-check screen); one active run per college; killing the worker mid-run leaves the draft untouched and the job reclaimable.

### Phase 8: Drafts, editing, versions and publishing

Depends on: Phase 7. Decisions: N2, N15, U6.

Scope:
- Draft creation (locks the grid); edit transaction with revision compare-and-set, occupancy cells and in-transaction validation; copy-on-write entry sets for apply and restore (`DATABASE_DESIGN.md` 6.3–6.6).
- Editor: valid/invalid targets, move, swap, room change, lock, add, remove, undo/redo, keyboard operation, presence indicator, conflict handling.
- Versions: save, submit, return, publish with N2 acknowledgement, undo within 15 minutes, held notifications, history list and view.

Acceptance: AC-E1–AC-E5, J3, J4 (without notifications delivery beyond in-app); concurrency tests run real parallel transactions against the test replica set.

### Phase 9: Role experiences, exceptions, notifications, reports

Depends on: Phase 8. Decisions: N1 (student access), Ext1/Ext2 (only for email/SMS; in-app does not need them).

Scope:
- Teacher home, Today and Week; student Today and Week (share links or accounts per N1); offline cache via service worker; light shell within 150 KB.
- Dated exceptions (cancel, room change, substitute with suggestions, move); review after a new publish (D10).
- In-app notifications from the outbox; email/SMS adapters only if providers are approved.
- Reports: clash audit, teacher load, room utilisation; printable pages and CSV exports for all views.
- HOD department views.

Acceptance: AC-E6, AC-X3, AC-X4, J5; student page budget measured on a 3G profile.

### Phase 10: Hardening and operations

Depends on: Phase 9. Decisions: D4/N13 (hosting and region for API, worker, web), N11 (monitoring), T5/T6, S6/S7.

Scope:
- Security headers and CSP, dependency and secret scanning, end-to-end suite in English and Punjabi on desktop and phone, accessibility scans and manual passes, load test, backup and restore drill, monitoring and alerts, staging environment, runbooks.

Acceptance: AC-X1 across all MVP screens; production-readiness items 1–7 in `PRODUCT_REQUIREMENTS.md` section 10.

### Phase 11: Pilot and launch gates

Depends on: Phase 10. Decisions: S11–S15, U9.

Scope: Punjabi copy review, legal review, penetration test and fixes, pilot with one college on staging, then production onboarding.

Acceptance: production-readiness items 8–12. Only then may the product be described as production-ready.

## 4. Decision schedule

| Needed before | Decisions |
| --- | --- |
| Phase 2 | N7, N12 |
| Phase 3 | N3, D9 |
| Phase 4 | N6 |
| Phase 5 | N4, N14, S9, N16, S1, S4, S10, D19 |
| Phase 6 | N8, N9, N17, D15, U2–U4 |
| Phase 7 | D8, D11, D12 |
| Phase 8 | N2, N15, U6 |
| Phase 9 | N1; Ext1, Ext2 if email/SMS are wanted at MVP |
| Phase 10 | D4/N13, N11, T5, T6, S6, S7 |
| Phase 11 | S11–S15, U9 |

## 5. Risks

| Risk | Phase | Mitigation |
| --- | --- | --- |
| Transaction size when applying large generation results | 8 | Copy-on-write entry sets (`DATABASE_DESIGN.md` 6.6); measure with the realistic fixture |
| Validator too slow inside transactions for large colleges | 3, 8 | Bucketing; benchmark gate in CI |
| Heuristic generator quality on elective-heavy colleges | 7 | Repair and improve stages; fixtures from real (anonymised, consented) structures; solver service only by a new decision |
| Student page budget with Next.js and Punjabi fonts | 9 | Light shell, subsetted fonts loaded only for Punjabi, budget check in CI |
| SMS registration lead time (DLT) | 9 | In-app first; start registration early if SMS is wanted (Ext1) |
| Data residency if API runs outside India | 10 | Decide D4/N13 before real data |
| Scope creep from the full vision delaying a usable pilot | all | MVP tags in `PRODUCT_REQUIREMENTS.md`; P2 items wait |
