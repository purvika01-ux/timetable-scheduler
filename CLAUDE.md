# CLAUDE.md

College Timetable Optimizer: clash-free timetables for colleges in Punjab. Started for the "Scheduling Optimizer: Hackathon 1" brief (Punjab Jobs AI Bootcamp; judging: no clashes, usability, design, advanced functionality, relevance; submission: GitHub repo with source, README and CLAUDE.md, plus a live link). The product is growing into a multi-college platform on a MERN-oriented stack (decisions M1 to M11, `docs/DECISIONS.md`).

## Where things stand

- **Built:** a frontend-only prototype in `apps/web` (Next.js, browser storage): Phase 0 correctness fixes and Phase 1, where a coordinator sets up any college, checks it, generates, adjusts, prints and saves it as a file, and a Demo view shows any teacher's view. It is the baseline: nothing in it is removed until its replacement passes its acceptance criteria.
- **Designed, not built:** the platform (Express API, MongoDB, worker, shared packages). See the documents below.
- **Next work:** the sequence in `docs/IMPLEMENTATION_ROADMAP.md`, once the owner approves it. Until Phase 2 starts, the prototype rules below apply in full (no backend, no database, no new packages).

## Documents (source of truth)

| Document | Use it for |
| --- | --- |
| `docs/DECISIONS.md` | What has been decided, by whom and when. Wins over every other document |
| `docs/PRODUCT_REQUIREMENTS.md` | Roles, permission matrix, academic model, lifecycle, features, hard and soft rules, acceptance criteria, **open decisions (section 12)** |
| `docs/ARCHITECTURE.md` | Components, repository layout, request lifecycle, flows, testing strategy |
| `docs/DATABASE_DESIGN.md` | MongoDB collections, indexes, tenant scoping, transactions and concurrency |
| `docs/API_DESIGN.md` | REST conventions and endpoints |
| `docs/SECURITY_MODEL.md` | Authentication, sessions, recovery, isolation, authorization, rate limits |
| `docs/SCHEDULING_ENGINE.md` | Audience (student-clash) rules, hard constraints, validator, generator |
| `docs/IMPLEMENTATION_ROADMAP.md` | Phases, dependencies, acceptance gates, decision schedule |
| `docs/UI_UX_GUIDELINES.md` | Visual design, components, accessibility details |
| `docs/PRODUCT_AUDIT.md` | Audit of the prototype (2026-10-26); historical |
| `docs/ARCHITECTURE_REVIEW.md` | Review of the earlier plan; historical, partly superseded |

`docs/PROJECT_SPEC.md`, `docs/TECHNICAL_PLAN.md` and `docs/IMPLEMENTATION_PLAN.md` are superseded pointers; their old FastAPI/PostgreSQL content is in git history and must not be implemented. If two current documents disagree, stop and ask the owner.

## Target stack (approved direction)

- Web: Next.js (React, TypeScript, Tailwind), UI only, no database access (M2).
- API: Node.js, Express, TypeScript; Zod validation from shared contracts; documented REST API.
- Database: MongoDB Atlas, Mumbai region (M8), via Mongoose (M10), tenant-scoped data layer (M7).
- Worker: Node process with a MongoDB-backed job queue (M6); generation in worker threads.
- Scheduling: TypeScript heuristic generator with repair and improvement (M5), in `packages/core`.
- Tests: unit (Node test runner), property, integration against a real MongoDB replica set, end-to-end in the browser.

## Prototype (`apps/web`) today

- Stack: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4. No other runtime dependencies. Icons are inline SVG (`src/components/icons.tsx`); dialogs use native `<dialog>`. PostCSS is pinned through npm `overrides`.
- The college being worked on (data plus timetable) is one "workspace" in browser localStorage (`cto.workspace.v1`; the demo role in `cto.role.v1`). It opens with invented sample data (`src/lib/timetable/demo-data.ts`). Stored data and opened files are parsed strictly (`src/lib/workspace.ts`); a clash or damaged data is refused with a notice. Data edits reconcile the timetable (classes that no longer match their course are removed and shown as missing).
- There is no sign-in: the Demo view switch (coordinator or any teacher) stands in for roles (M4). Only coordinators edit data or move classes.
- The prototype needs no environment variables or secrets.

```
src/app/              / (coordinator home or teacher dashboard), /setup/* (college and week, departments,
                      rooms, teachers, subjects, sections, courses, availability), /generate, /timetable,
                      /reports, /data (save and open), /availability and /profile (teacher)
src/components/       App shell and role switch, entity editor, setup checklist, timetable explorer,
                      availability editor, week grid, day agenda, class card and dialog, modal, toast, UI kit
src/lib/store.tsx     React context: workspace, role, data updates, timetable save
src/lib/workspace.ts  Strict parsing of stored data and college files, export format, reconciliation
src/lib/run-generation.ts, src/workers/  Generation in a Web Worker with a main-thread fallback
src/lib/timetable/    Pure TypeScript domain logic (types, grid, demo data, college checks, rooms,
                      scheduler, validator, capacity, pre-check, reports, moves, queries);
                      becomes packages/core in Phase 2
tests/                Node test runner tests (*.test.ts)
```

## Rules

1. **Zero clashes.** No edit, generation result or exception may introduce a hard-constraint violation (`docs/PRODUCT_REQUIREMENTS.md` 6.1). The generator places classes; the validator is an independent checker that shares no placement logic with it. Never show a timetable as clash-free unless the validator returns `valid: true`, nor as complete unless it returns `complete: true`. Every manual move revalidates the whole timetable. On the platform, the server's check inside the transaction is authoritative.
2. **Unplaced sessions are reported with reasons**, never dropped silently.
3. **Keep the scheduling core pure:** no React, browser, database or Node-only APIs; `.ts` import extensions; `import type` for types; no enums or other non-erasable TypeScript syntax.
4. **Tenant isolation** (platform): every college-owned document has `collegeId`; all data access goes through the tenant-scoped layer; another college's ids return 404; every route is covered by the two-college test.
5. **Server-side authorization, default deny:** every route declares a policy; roles come from the database membership, not the token.
6. **Validate every input with Zod** at the API boundary; never pass request values as query objects.
7. **Concurrency:** timetable edits carry the draft revision and run in a transaction with the validator; master data carries `rowVersion`; mutating requests carry idempotency keys (`docs/DATABASE_DESIGN.md` section 6).
8. **Security basics:** no access token or personal data in browser storage; secrets only in environment variables or the host's secret store; no personal data in logs; append-only audit events.
9. **Honest UI.** No control that looks functional but does nothing. Sample data is labelled as sample data. Never describe the system as production-ready or secure for real data until `docs/PRODUCT_REQUIREMENTS.md` section 10 is verified and recorded.
10. **Accessibility:** keyboard-operable controls, visible focus, labelled grid cells, confirmations for destructive actions (safe choice first); WCAG 2.1 AA target.
11. **English and Punjabi:** from Phase 6, every new user-facing string goes through the message catalogues; Punjabi drafts are marked unreviewed until U9.
12. **No real personal data** before the legal review (S11). Use invented names and `example.edu` addresses.
13. **Data in India:** the database is in Atlas Mumbai; do not add services, regions or providers that store or process college data elsewhere without approval.

## Decision protocol

- Open decisions are listed in `docs/PRODUCT_REQUIREMENTS.md` section 12.1. Do not choose one yourself: ask the owner (Purvika), record the answer in `docs/DECISIONS.md`, then continue.
- Never introduce an external service provider, hosting region, paid integration or new package without the owner's approval. Packages listed in M10 are approved in principle; confirm exact packages and versions at the start of each phase.
- Anything important the documents do not cover (data model change, security trade-off, scope change) needs approval first.
- Commits: small, one concern each, with tests alongside the code. Do not commit, push or deploy without asking.

## Commands (prototype; they change in Phase 2)

Run from the repository root (or from `apps/web` without `--prefix`). Needs Node 22.18 or newer.

- `npm run setup`: install dependencies (first time only)
- `npm run dev`: start at http://localhost:3000
- `npm test`: scheduling, setup-check, college-file and query tests
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm start`

Definition of done for a change: `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` pass; the affected screen has been checked in a browser (desktop and a 375 px phone); documentation reflects the change.
