# CLAUDE.md

Multi-tenant timetable platform for colleges in Punjab. Started from the "Scheduling Optimizer: Hackathon 1" brief (Punjab Jobs AI Bootcamp). Judging: no clashes, usability, design, advanced functionality, relevance. Submission: GitHub repo (source, README, CLAUDE.md) and a live link.

## Current mode: frontend-only hackathon prototype (temporary)

Owner direction, 2026-10-21 (see `docs/DECISIONS.md`): for the hackathon evaluation, the working product is a **frontend-only prototype** in `apps/web`. Teacher role first, plus a working generation demo.

- Next.js, React, TypeScript and Tailwind only. No Python, FastAPI, Docker, database, Redis, workers, external auth, or paid services. Do not add packages unless absolutely necessary.
- Invented sample data in `apps/web/src/lib/timetable/demo-data.ts`. Persistence is browser localStorage only (`apps/web/src/lib/storage.ts`).
- Scheduling logic is plain TypeScript in `apps/web/src/lib/timetable/`. It must stay free of React and browser APIs so Node tests can import it with `.ts` extensions (`import type` for types; no enums).
- The zero-clash rule still applies. `scheduler.ts` places classes; `validator.ts` is an independent checker. Never show a timetable as clash-free unless the validator returns `valid: true`, and never let the two share placement logic. Any manual move revalidates the whole timetable (`moves.ts`).
- The rest of this file and `docs/` describe the full production platform. That remains the target and is **future work**; `apps/api`, `docker-compose.yml` and the `Makefile` are unused skeletons. Rules that need a server (tenancy, RLS, auth, audit, Zod/Pydantic validation, Punjabi at launch, the 150 KB student budget) apply when that work resumes, not to this prototype.

## Read first (in this order)

1. `docs/PROJECT_SPEC.md`: what to build, roles, rules, decisions, open decisions.
2. `docs/TECHNICAL_PLAN.md`: stack, architecture, schema, API, security, testing.
3. `docs/UI_UX_GUIDELINES.md`: design system, screens, states, accessibility.
4. `docs/IMPLEMENTATION_PLAN.md`: ordered phases. Work one phase at a time.

If documents disagree, PROJECT_SPEC.md wins on behaviour, TECHNICAL_PLAN.md on technology, and you must report the conflict to the owner.

## Decision protocol (important)

- Items marked **OPEN** in PROJECT_SPEC.md section 4 are not decided. Never choose one yourself. Stop, ask the owner (Purvika), record the answer in the decision log, then continue.
- Anything important and not in the docs (new dependency, provider, data model change, security trade-off) needs the owner's approval first.
- Unblocked work continues while you wait; pick the next task that does not depend on the open item.

## Stack (decided)

Next.js + TypeScript + Tailwind + shadcn/ui + Lucide + Zod + React Hook Form (`apps/web`); FastAPI + Pydantic + SQLAlchemy + Alembic (`apps/api`); PostgreSQL in an Indian region (host OPEN, D4); Redis + RQ workers; OR-Tools CP-SAT solver in the worker; own JWT (Argon2id); pandas + openpyxl for import; pytest, Vitest, Playwright; GitHub Actions; Docker. One repo: `apps/web`, `apps/api`, `docs/`.

## Commands

Prototype (run from the repo root; Node 22.18+; Windows-friendly):

- `npm run setup`: install web dependencies (once)
- `npm run dev`: start the app at http://localhost:3000
- `npm test`: Node test runner over `apps/web/tests/*.test.ts`
- `npm run typecheck`, `npm run lint`, `npm run build`

Definition of done for prototype changes: `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` all pass.

Full platform (future, not used by the prototype): `make dev`, `make test`, `make lint`, `make migrate`, `make seed` (needs Docker and uv).

## Non-negotiable rules

1. **Zero clashes.** No teacher, room, or section is ever double-booked in a saved or published timetable. Enforced three ways: solver model, database exclusion constraints, and an independent clash checker used for editing, audit, and publish. Never weaken one to make another pass.
2. **Tenant isolation.** Every tenant table has `college_id`. Row-level security plus API checks (both). The tenant id comes from the URL path and is checked against the user's membership; never trust a body field. Set the RLS context per transaction, never per connection. API and worker use non-owner roles without BYPASSRLS. A cross-college id returns 404.
3. **Default deny.** Every endpoint declares its required role and scope; a test fails if one does not.
4. **Secrets** only in environment variables or the host secret store. Never in code, logs, URLs, or the repo. Commit `.env.example` only.
5. **Validate everything** with Pydantic (server) and Zod (client). Server validation is authoritative. Parameterised queries only.
6. **No personal data in logs, error messages, analytics, or test fixtures.** Use invented data.
7. **Audit log is append-only** for security and timetable events.
8. **Accessibility:** WCAG 2.1 AA; every drag-and-drop action has a keyboard and click alternative.
9. **Student pages:** under 150 KB and 3 seconds on a 3G profile; English and Punjabi from day one; no text baked into images.
10. **No surprises:** destructive actions need confirmation and are reversible where specified; a failed job never leaves half-written data.

## Conventions

- API: `/api/v1/colleges/{college_id}/...`; errors `{error:{code,message,fields[],request_id}}`; `Idempotency-Key` on unsafe creates; `row_version` for optimistic locking (409 `version_conflict`); cursor pagination; long work returns 202 plus a job id.
- Times: store UTC for instants, local (Asia/Kolkata) for grid periods; periods are integers (`start_seq`, `span`).
- Migrations: Alembic only, reversible, reviewed; never edit applied migrations.
- User text: all strings in i18n catalogues (`en`, `pa`); Hindi (`hi`) added at P2.
- Commits: small, one concern; tests with the code. Branch per phase.
- Tests: ids TM-xx and journey tests J1 to J8 from TECHNICAL_PLAN.md section 9; a feature is not done until its listed tests pass.
- Definition of done: acceptance criteria in IMPLEMENTATION_PLAN.md met, tests pass, lint clean, docs updated, no open security TODO.

## Do not

- Do not add features outside the MVP list without approval; P2 and Later items are for design awareness only.
- Do not use Neon (no Indian region) or any non-Indian database region.
- Do not store the access token in browser storage, or send WhatsApp messages (P2).
- Do not generate real-looking personal data; do not commit data exports.
