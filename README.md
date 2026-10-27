# College Timetable Optimizer

A web app that builds **clash-free college timetables** for any college: a timetable coordinator enters the college's data (or opens a file), checks it, generates a timetable, adjusts it, and shares it; principals, heads of department, teachers and students see their own views.

Built for the "Scheduling Optimizer: Hackathon 1" brief (Punjab Jobs AI Bootcamp).

**Live app:** https://timetable-scheduler-brown.vercel.app/ · **API:** https://timetable-scheduler-9hmw.onrender.com (health: `/api/v1/health`; the free plan sleeps when idle, so the first request can take up to a minute)

> **Status.** A working prototype in two modes:
>
> - **Without signing in**, the whole app runs in the browser with an invented sample college. A **Role** switch at the top shows the app as the coordinator, principal, a head of department, any teacher or any section's students. Data is saved only in this browser (localStorage); download a college file to keep or move it.
> - **Signed in**, a college's data comes from the server API (`apps/api`: Express, MongoDB) and is kept in memory only, never in browser storage. What each person sees comes from their role in the college; the server checks every request against that role and refuses any timetable with a clash.
>
> The sample colleges are invented. It is not ready for real college data: see [Limitations](#limitations).

## How to test it (about 5 minutes)

No account or data file is needed: the app opens with a complete invented college (4 sections, 8 teachers, 6 rooms, 74 sessions a week).

1. Open the live app. Choose **Timetable Coordinator** on the role page (or in the **Role** switch at the top).
2. **Generate**: the pre-check passes; press **Generate timetable**. Expect 74 of 74 sessions placed and 0 clashes. Press **Use this timetable**.
3. **Timetable**: click a class, choose **Move class**, pick a taken slot and press **Check and move**: it is refused with the reasons. Pick a suggested slot: it is saved, and the whole timetable is revalidated.
4. **Role → a teacher**: their day, week and availability. **Role → Principal**, **Head of Department** or **Student**: their dashboards.
5. **Save and open → Stress-test college**, then **Generate**: the pre-check names three problems and four sessions are reported as unplaced, each with its reasons.
6. **Save and open → Blank college**: set up a new college from scratch with **Set up college** and generate its timetable.

To try sign-in and the multi-college flow, see [Accounts and roles](#accounts-and-roles).

## What it does

**As the timetable coordinator:**

1. **Set up any college** step by step: name and semester; the teaching week (days, period times, breaks, half days); departments; rooms and labs (owned by one department or shared by all); teachers with daily limits and availability; subjects; sections with student numbers; and courses (who teaches what to which section, how many sessions a week, how many periods each). Every form checks its input and explains problems in plain language; records still in use cannot be deleted.
2. Follow the **setup checklist** on the home page, which always shows the next step.
3. Run the **pre-check**: it lists what would stop classes from fitting (no room big enough, a room type the college lacks, rooms owned by another department, a teacher whose load cannot fit their availability or daily limit, a section with more periods than the week has).
4. **Generate** a whole-college timetable (or one section, or a chosen set of courses) in the background (a Web Worker), checked by an **independent validator**; when signed in, the server's validator checks it too. Sessions that cannot fit are listed with their reasons.
5. View the timetable **by section, teacher, room or department**; **move** a class (only moves that keep every rule are accepted; signed in, the server checks the move again); **print or save as PDF**.
6. See **reports**: each teacher's load against their daily limit, gaps, and how much each room is used, including which departments use shared rooms.
7. **Save and open**: download the college as a file, open it in another browser (same timetable for the same seed), or start a blank, sample or stress-test college.

**Other roles:** the principal sees an executive dashboard and the whole timetable (read only); a head of department sees their department; a teacher sees today's classes, the week, their availability and profile; students see their section's routine. Only coordinators and college administrators change data or move classes.

## Features

| Area | What is implemented |
| --- | --- |
| Coordinator home | Setup checklist with next step, timetable status (clash-free, incomplete or broken by data changes), sessions not scheduled, teachers over their daily limit |
| Set up college | College and week (period times, teaching days with their period counts, breaks), departments, rooms (owned or shared), teachers, subjects (with colour and code), sections, courses, teacher availability; inline validation, focus on the first error, delete blocked while in use |
| Generate | Pre-check with links to fix each problem, generation in a Web Worker (falls back to the page), scope by section or course, seeded and reproducible, clash counts, unplaced sessions with reasons, server check when signed in, "use this timetable" with a confirmation that lists anything missing |
| Timetable | Whole-college views with validation status, class details, moves with clash-free suggestions and full revalidation, print stylesheet (A4 landscape) |
| Reports | Teacher load (periods against needs, busiest day against limit, gaps) and room use (periods used, by department) |
| Save and open | Download and open college files (checked; damaged or altered files are refused), blank, sample and stress-test colleges, privacy notes |
| Role views | Principal dashboard, head-of-department dashboard, teacher dashboard (today, week, availability, profile), student routine |
| Accounts | College registration and platform approval, sign-in by email or mobile, two-step sign-in for platform administrators, invitations with roles, password reset links, sign out everywhere |
| Quality | Loading skeletons, empty states, toasts, error and warning banners, keyboard-operable controls, visible focus, screen-reader labels, responsive from 375 px phones to desktop |

### Scheduling rules enforced

- No teacher, room, or section is double-booked.
- Teachers are never placed in periods marked unavailable.
- Room type (lecture, lab or workshop) and seats must fit the section.
- A room owned by a department is used only by that department's sections; shared rooms are open to all.
- Multi-period sessions (labs) are one block and never run across a break or past the end of the day.
- A teacher's daily teaching limit is respected, by the generator and by manual moves.
- Each class lasts as long as its course needs and matches its course's teacher, subject and section; no course gets more sessions than it needs.
- Sessions that cannot be placed are **reported with reasons**, never dropped silently. A result with unplaced sessions is labelled incomplete, can be applied only after a confirmation that lists them, and the home page and teacher dashboards keep warning about them.
- When the college's data changes, classes that no longer match their course are removed (and shown as missing); other rule breaks caused by data changes are shown, not hidden. A saved timetable or opened file containing a clash is refused, and the server refuses to save one (`422 rule_violation`).

Soft preferences (scored, not mandatory): spread a subject across the week, balance daily load for sections and teachers, labs in the afternoon, avoid first and last periods.

### How the generator works

`apps/web/src/lib/timetable/scheduler.ts` expands each course into weekly sessions, places the most constrained sessions first (labs, teachers with few free periods, few suitable rooms), and gives each the lowest-penalty slot that breaks no hard rule. It retries with failed sessions first and keeps the best attempt. A seeded random tie-break makes runs reproducible: the same seed and inputs always give the same timetable.

`apps/web/src/lib/timetable/validator.ts` is a separate checker that shares no placement logic with the generator. It re-checks every pair of classes and every rule. The UI calls a timetable clash-free only when the validator reports zero problems, and complete only when every course has all of its weekly sessions (the validator reports these two separately). The API runs its own copy of the validator before it saves a timetable.

## Accounts and roles

There are no ready-made accounts. To try sign-in, run the API with a database (see [Run it on Windows](#run-it-on-windows)), then:

1. **Create a platform administrator** with your own email, name and password:

   ```bash
   npm run admin:create -- admin@example.edu "Platform Admin" "<a strong password>"
   ```

   It prints a two-step sign-in secret: add it to an authenticator app. Always pass all three values; without them the script uses a built-in default.

2. **Register a college** at `/register` (the link is on the principal dashboard). The applicant becomes the college's administrator once the platform administrator approves the college on the **Platform** page.
3. **Invite people** from the **Account** page with their roles. Each invitation gives a one-time link to share.

Use invented names and `example.edu` addresses: the app is not ready for real personal data.

| Role | Signed-in view | Can change |
| --- | --- | --- |
| College administrator (CA), timetable coordinator (TC) | Coordinator | College data, availability, generation, the timetable; CA also manages members |
| Principal (PR) | Principal dashboard, whole timetable | Nothing (view only) |
| Head of department (HOD) | Whole timetable, read only, until the account is linked to a department | Nothing yet |
| Teacher (TE), student (ST) | A notice until the account is linked to a teacher record or section | Nothing yet |

Teachers and students see the timetable without teachers' contact details. The server decides every request from the membership stored in the database, never from the browser.

## Technology

- **Web app** (`apps/web`): Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4. No other runtime dependencies: icons are inline SVG and dialogs use the native `<dialog>` element. Deployed on Vercel.
- **API** (`apps/api`): Node.js, Express 5, TypeScript, MongoDB through Mongoose, Zod validation, Helmet security headers, CORS for listed origins, pino logging, Argon2id password hashing, signed access tokens (15 minutes) with rotating refresh cookies, rate limits, tenant-scoped data access. Deployed on Render, with MongoDB Atlas.
- **Tests**: Node's built-in test runner (`node:test`) running the TypeScript files directly. API integration tests start their own temporary MongoDB server from your local MongoDB installation.

## Run it on Windows

You need **Node.js 22.18 or newer** (Node 24 recommended; check with `node --version`). The API also needs **MongoDB Community Server 8** installed locally (it provides `mongod`), running as the usual Windows service, set up as a single-member replica set (sign-in uses transactions).

Open a terminal (PowerShell, Command Prompt or Git Bash) in the **repository root**, the folder with this `README.md`. Quote the path if it contains spaces or commas.

### First time

1. Install the dependencies of both apps:

   ```bash
   npm run setup
   ```

2. Create the API's configuration from the example:

   ```bash
   copy apps\api\.env.example apps\api\.env
   ```

   (In Git Bash: `cp apps/api/.env.example apps/api/.env`.)

3. Generate the API's signing keys and paste the three printed lines into `apps/api/.env`:

   ```bash
   npm --prefix apps/api run keys:generate
   ```

4. Turn MongoDB into a single-member replica set (once): add these lines to `mongod.cfg` (in `C:\Program Files\MongoDB\Server\8.x\bin\`), restart the **MongoDB** service, then run `mongosh --eval "rs.initiate()"`:

   ```
   replication:
     replSetName: rs0
   ```

5. Let the web app know where the API is:

   ```bash
   copy apps\web\.env.example apps\web\.env.local
   ```

### Run the web app

```bash
npm run dev
```

Open http://localhost:3000. The first page load compiles for 20 to 30 seconds. Stop with Ctrl+C. The web app works without the API (no sign-in then).

### Run the API

In a second terminal, from the repository root:

```bash
npm run dev:api
```

The API listens on http://127.0.0.1:4000 and restarts when you change its files. Check it:

```bash
curl http://127.0.0.1:4000/api/v1/health
```

`"status": "ok"` means it reached MongoDB and created its collections and indexes. If MongoDB is not running, the API still starts, answers `503` with `"status": "degraded"`, and keeps retrying the connection.

### Production build

```bash
npm run build
npm start
npm run start:api
```

`npm run build` builds both apps (the API compiles to `apps/api/dist`). Do not build while `npm run dev` is running: both use the same `.next` folder.

### Commands

Run from the repository root.

| Command | What it does |
| --- | --- |
| `npm run setup` | Install dependencies for both apps |
| `npm run dev` / `npm run dev:api` | Web app on port 3000 / API on port 4000, in watch mode |
| `npm test` | All tests: web and API (unit and integration) |
| `npm run test:web` | Web tests only |
| `npm run test:api` | API unit and integration tests |
| `npm run test:api:unit` | API tests that need no database |
| `npm run test:api:integration` | API tests against a temporary MongoDB server (needs MongoDB installed; set `MONGOD_PATH` if `mongod` is not on the PATH or in the default install folder) |
| `npm run typecheck` | TypeScript check of both apps |
| `npm run lint` | ESLint for both apps |
| `npm run build` | Production build of both apps |
| `npm run admin:create` | Create a platform administrator (see [Accounts and roles](#accounts-and-roles)) |

## Deployment and environment

Secrets live only in `.env` files (ignored by git) or in the hosting provider's settings. Only the `.env.example` files are committed, and they contain placeholders.

**Web app on Vercel** (root directory `apps/web`):

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | The API origin, e.g. `https://your-api.onrender.com`. Built into the browser bundle: never a secret; redeploy after changing it |

**API on Render** (root directory `apps/api`; build `npm ci --include=dev && npm run build`; start `npm start`; health check `/api/v1/health/live`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `MONGODB_URI` | (required) | MongoDB connection string (Atlas `mongodb+srv://…` in production) |
| `CORS_ORIGINS` | none | Comma-separated exact origins allowed to call the API, e.g. the Vercel URL. Required in production |
| `PUBLIC_APP_URL` | `http://localhost:3000` | The web app's origin, used in invitation and reset links |
| `AUTH_JWT_PRIVATE_KEY`, `AUTH_JWT_KEY_ID`, `MFA_ENCRYPTION_KEY` | (required) | From `npm --prefix apps/api run keys:generate`; new values for production |
| `NODE_ENV` | `development` | `production` on Render |
| `HOST`, `PORT` | `127.0.0.1`, `4000` | Where the API listens; `HOST=0.0.0.0` on Render (Render sets `PORT`) |
| `TRUST_PROXY` | `0` | Number of trusted reverse proxies; `1` on Render |
| `COOKIE_SECURE` | `true` | Refresh cookie only over HTTPS |
| `LOG_LEVEL` | `info` | `fatal` to `trace`, or `silent` |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Access token lifetime |
| `STAFF_IDLE_TIMEOUT_SECONDS`, `STAFF_MAX_SESSION_SECONDS` | `1800`, `43200` | Session limits for CA, PR, TC and HOD |
| `OTHER_IDLE_TIMEOUT_SECONDS`, `OTHER_MAX_SESSION_SECONDS` | `604800`, `2592000` | Session limits for everyone else |
| `SHUTDOWN_TIMEOUT_MS`, `DB_SERVER_SELECTION_TIMEOUT_MS` | `10000`, `5000` | Shutdown wait and database lookup timeout |

Invalid settings stop the API at startup with a message naming each variable (never its value).

## API

Base path `/api/v1`. Every response uses one of two shapes:

```json
{ "data": { }, "meta": { "requestId": "…" } }
{ "error": { "code": "validation_failed", "message": "…", "fields": [{ "path": "body.name", "code": "…", "message": "…" }], "requestId": "…" } }
```

| Area | Endpoints |
| --- | --- |
| Health | `GET /health` (database included), `GET /health/live` |
| Sign-in | `POST /auth/login`, `/auth/mfa/verify`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/invitations/preview`, `/auth/invitations/accept`, `/auth/password/reset` |
| Account | `GET`/`PATCH /me`, `POST /me/password`, `POST /registrations` |
| Platform | `/platform/colleges` (list, approve, reject, suspend, reactivate), account recovery links |
| College | `/colleges/{collegeId}`: settings, memberships (with CSV export and reset links), invitations, audit events |
| Academic data | `/colleges/{collegeId}/academic`: departments, teachers, subjects, sections, rooms, requirements, availability, timetable (get, save, validate, generate, clear) |

Every route declares who may call it; the server takes roles from the database membership. A record of another college returns `404`. Requests carry request ids (`X-Request-Id`); logs contain no personal data; bodies are JSON up to 1 MB and validated with Zod (unknown fields refused); `500` never reveals internal details and database outages return `503` with `Retry-After`.

## Limitations

- **Not for real data yet:** no legal review, security review or penetration test; use invented names only.
- **Sign-in across two domains:** with the web app on `vercel.app` and the API on `onrender.com`, the refresh cookie is not sent after a page reload, so signed-in users must sign in again after reloading. Serving both under one domain fixes this.
- **Accounts are not linked to records yet:** heads of department, teachers and students cannot see "their" department, timetable or section when signed in.
- **Render's free plan sleeps** when idle: the first request after a pause takes up to a minute.
- Whole-section classes only: no lab batches, electives, combined classes, or co-teaching yet (designed in `docs/SCHEDULING_ENGINE.md`).
- The generator is a greedy heuristic with retries, not an optimal solver. It suits a small college; repair and improvement stages for larger colleges are designed in `docs/SCHEDULING_ENGINE.md`.
- One time grid per college. Changing the week clears the current timetable (after a confirmation).
- English only for now. Punjabi is part of the plan.
- PDF is through the browser's print dialog; no spreadsheet import, notifications, or one-day changes (cancellations, substitutes) yet.

## Future development

The design for the full multi-college platform is in `docs/`, starting with `docs/PRODUCT_REQUIREMENTS.md`; decisions are in `docs/DECISIONS.md` and the order of work in `docs/IMPLEMENTATION_ROADMAP.md`. Next steps include linking accounts to teacher records, sections and departments; drafts, versions and publishing; lab batches, electives and combined classes; CSV import; dated changes (substitutes, cancellations); in-app notifications; and English and Punjabi throughout.

## Repository layout

```
package.json     Root scripts for both apps (setup, dev, dev:api, test, build, ...)
apps/web/        The web app (Next.js). Screens in src/app, UI in src/components,
                 scheduling logic in src/lib/timetable, the saved college in src/lib/workspace.ts,
                 sign-in in src/lib/auth-context.tsx, API client in src/lib/api/client.ts
apps/web/tests/  Node tests for the scheduler, validator, rooms, capacity, setup checks, pre-check,
                 reports, college files, moves, queries, roles and the API client
apps/api/        The API (Express, TypeScript, MongoDB): src/routes, services, models, middleware,
                 auth (passwords, tokens, two-step codes, permissions), db (connection, tenant scoping),
                 timetable (server-side generator and validator)
apps/api/tests/  unit/ (no database) and integration/ (temporary MongoDB server) tests
docs/            Product requirements, architecture, database, API, security and scheduling
                 designs, implementation roadmap, UI/UX guidelines, decision log, audit
```
