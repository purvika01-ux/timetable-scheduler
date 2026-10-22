# CLAUDE.md

College Timetable Optimizer: clash-free timetables for colleges in Punjab. Built for the "Scheduling Optimizer: Hackathon 1" brief (Punjab Jobs AI Bootcamp). Judging: no clashes, usability, design, advanced functionality, relevance. Submission: GitHub repo (source, README, CLAUDE.md) and a live link.

## Current state: frontend-only prototype

Owner direction, 2026-10-21 (`docs/DECISIONS.md`, P1 to P8): the product is a **frontend-only prototype** in `apps/web`. It has a teacher experience first and a working timetable-generation demo. There is no backend: the earlier FastAPI, Docker and database skeletons were removed and are in git history (commit `63ab442`) if they are ever needed.

- Stack: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4. No other runtime dependencies. Icons are inline SVG (`src/components/icons.tsx`); dialogs use native `<dialog>`.
- Do not add Python, Docker, databases, Redis, workers, a separate backend, external auth, paid APIs, or new packages without the owner's approval.
- Data is invented sample data (`src/lib/timetable/demo-data.ts`). Persistence is browser localStorage only (`src/lib/storage.ts`, keys `cto.*.v1`). Stored data is parsed defensively; bad data falls back to the sample with a notice.
- The app needs no environment variables or secrets.

### Layout (`apps/web`)

```
src/app/            Pages: / (dashboard), /timetable, /availability, /generate, /profile
src/components/     App shell, week grid, day agenda, class card and dialog, modal, toast, UI kit
src/lib/store.tsx   React context: dataset, availability, current timetable, save/reset
src/lib/storage.ts  localStorage read/write and validating parsers
src/lib/timetable/  Pure TypeScript domain logic (types, grid, demo data, scheduler, validator, moves, queries)
tests/              Node test runner tests (*.test.ts)
```

### Rules

1. **Zero clashes.** No teacher, room or section is double-booked in a saved timetable. `scheduler.ts` places classes; `validator.ts` is an independent checker with no shared placement logic. Never show a timetable as clash-free unless the validator returns `valid: true`. Every manual move revalidates the whole timetable (`moves.ts`).
2. **Unplaced sessions are reported with reasons**, never dropped silently.
3. **Keep `src/lib/timetable/` free of React and browser APIs** so Node can run the tests directly. Import with `.ts` extensions, use `import type` for types, and do not use enums or other non-erasable TypeScript syntax.
4. **Honest UI.** No control that looks functional but does nothing. Say the data is sample data and stored only in this browser.
5. **Accessibility:** keyboard-operable controls, visible focus, labelled grid cells, confirmations for destructive actions (safe choice first).
6. **No real personal data.** Use invented names and `example.edu` addresses only.

### Commands

Run from the repository root (or from `apps/web` without `--prefix`). Needs Node 22.18 or newer.

- `npm run setup`: install dependencies (first time only)
- `npm run dev`: start at http://localhost:3000
- `npm test`: scheduler, validator, moves, storage and query tests
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm start`

Definition of done for a change: `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` pass, and the affected screen has been checked in a browser.

## Decision protocol

- Items marked **OPEN** in `docs/PROJECT_SPEC.md` section 4 are not decided. Do not choose one yourself: ask the owner (Purvika), record the answer in `docs/DECISIONS.md`, then continue.
- Anything important that the docs do not cover (new dependency, provider, data model change, security trade-off) needs the owner's approval first.
- Commits: small, one concern each, with tests alongside the code. Do not commit, push or deploy without asking.

## Future platform (reference, not current work)

`docs/` describes the full production platform the prototype is a step towards:

- `docs/PROJECT_SPEC.md`: roles, features, rules, open decisions
- `docs/TECHNICAL_PLAN.md`: FastAPI + PostgreSQL (Indian region) + Redis/RQ workers + OR-Tools CP-SAT, multi-college tenancy with row-level security, own JWT auth, API conventions, testing
- `docs/UI_UX_GUIDELINES.md`: design system and accessibility; it already guides the prototype
- `docs/IMPLEMENTATION_PLAN.md`: phased plan for that platform
- `docs/ARCHITECTURE_REVIEW.md`: review of that plan

When that work resumes, its rules apply again:

- tenant isolation (RLS plus API checks)
- default-deny routes
- secrets only in environment variables or the host secret store
- Pydantic/Zod validation
- an append-only audit log
- English and Punjabi from day one
- student pages under 150 KB on 3G
- no non-Indian database region
- no access token in browser storage

If those documents disagree with this file about the prototype, this file and `docs/DECISIONS.md` win.
