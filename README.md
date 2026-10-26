# College Timetable Optimizer

A web app that builds **clash-free college timetables** for any college: a timetable coordinator enters the college's data (or opens a file), checks it, generates a timetable, adjusts it, and shares it; teachers see their own day and week.

Built for the "Scheduling Optimizer: Hackathon 1" brief (Punjab Jobs AI Bootcamp).

> **Prototype status.** The screens run entirely in the browser: there is no sign-in, and a **Demo view** switch shows the app as the coordinator or as any teacher. Data is saved only in this browser (localStorage); download a college file to keep or move it. It opens with an invented sample college. The foundation of the server API (`apps/api`: Express, MongoDB) now exists, with health checks and the database setup, but no screen uses it yet. The multi-college platform described in `docs/` is future work.

## What it does

**As the timetable coordinator** (the default view):

1. **Set up any college** step by step: name and semester; the teaching week (days, period times, breaks, half days); departments; rooms and labs (owned by one department or shared by all); teachers with daily limits and availability; subjects; sections with student numbers; and courses (who teaches what to which section, how many sessions a week, how many periods each). Every form checks its input and explains problems in plain language; records still in use cannot be deleted.
2. Follow the **setup checklist** on the home page, which always shows the next step.
3. Run the **pre-check**: it lists what would stop classes from fitting (no room big enough, a room type the college lacks, rooms owned by another department, a teacher whose load cannot fit their availability or daily limit, a section with more periods than the week has).
4. **Generate** a whole-college timetable in the background (a Web Worker), checked by an **independent validator**. Sessions that cannot fit are listed with their reasons.
5. View the timetable **by section, teacher, room or department**; **move** a class (only moves that keep every rule are accepted); **print or save as PDF**.
6. See **reports**: each teacher's load against their daily limit, gaps, and how much each room is used, including which departments use shared rooms.
7. **Save and open**: download the college as a file, open it in another browser (same timetable for the same seed), or start a blank, sample or stress-test college.

**As a teacher** (choose a teacher in Demo view): today's classes and next class, week and day views, marking periods they cannot teach, and their profile. Teachers cannot move classes.

## Features

| Area | What is implemented |
| --- | --- |
| Coordinator home | Setup checklist with next step, timetable status (clash-free, incomplete or broken by data changes), sessions not scheduled, teachers over their daily limit |
| Set up college | College and week (period times, teaching days with their period counts, breaks), departments, rooms (owned or shared), teachers, subjects (with colour and code), sections, courses, teacher availability; inline validation, focus on the first error, delete blocked while in use |
| Generate | Pre-check with links to fix each problem, generation in a Web Worker (falls back to the page), seeded and reproducible, clash counts, unplaced sessions with reasons, views by section/teacher/room/department, "use this timetable" with a confirmation that lists anything missing |
| Timetable | Whole-college views with validation status, class details, moves with clash-free suggestions and full revalidation, print stylesheet (A4 landscape) |
| Reports | Teacher load (periods against needs, busiest day against limit, gaps) and room use (periods used, by department) |
| Save and open | Download and open college files (checked; damaged or altered files are refused), blank, sample and stress-test colleges, privacy notes |
| Teacher view | Dashboard, my timetable (week and day), my availability, profile |
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
- When the college's data changes, classes that no longer match their course are removed (and shown as missing); other rule breaks caused by data changes are shown, not hidden. A saved timetable or opened file containing a clash is refused.

Soft preferences (scored, not mandatory): spread a subject across the week, balance daily load for sections and teachers, labs in the afternoon, avoid first and last periods.

### How the generator works

`apps/web/src/lib/timetable/scheduler.ts` expands each course into weekly sessions, places the most constrained sessions first (labs, teachers with few free periods, few suitable rooms), and gives each the lowest-penalty slot that breaks no hard rule. It retries with failed sessions first and keeps the best attempt. A seeded random tie-break makes runs reproducible: the same seed and inputs always give the same timetable.

`apps/web/src/lib/timetable/validator.ts` is a separate checker that shares no placement logic with the generator. It re-checks every pair of classes and every rule. The UI calls a timetable clash-free only when the validator reports zero problems, and complete only when every course has all of its weekly sessions (the validator reports these two separately).

## Technology

- **Web app** (`apps/web`): Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4. No other runtime dependencies: icons are inline SVG and dialogs use the native `<dialog>` element. Every screen still keeps its data in the browser (localStorage).
- **API** (`apps/api`, new foundation): Node.js, Express 5, TypeScript, MongoDB through Mongoose, Zod validation, Helmet security headers, CORS for listed origins, pino logging. It is not used by the screens yet; `apps/web/src/lib/api/client.ts` is the documented client the screens will use.
- **Tests**: Node's built-in test runner (`node:test`) running the TypeScript files directly. API integration tests start their own temporary MongoDB server from your local MongoDB installation.

## Run it on Windows

You need **Node.js 22.18 or newer** (Node 24 recommended; check with `node --version`). The API also needs **MongoDB Community Server 8** installed locally (it provides `mongod`), running as the usual Windows service for development.

Open a terminal (PowerShell, Command Prompt or Git Bash) in the **repository root**, the folder with this `README.md`. On this machine that is `C:\Users\anand\Desktop\timetable, hackathon 1`. Quote the path, because it contains a comma and a space:

```bash
cd "C:\Users\anand\Desktop\timetable, hackathon 1"
```

### First time

1. Install the dependencies of both apps:

   ```bash
   npm run setup
   ```

2. Create the API's configuration from the example (placeholders only; edit if your MongoDB is not on the default address):

   ```bash
   copy apps\api\.env.example apps\api\.env
   ```

   (In Git Bash: `cp apps/api/.env.example apps/api/.env`.)

3. Optional: let the web app know where the API is (no screen needs it yet):

   ```bash
   copy apps\web\.env.example apps\web\.env.local
   ```

### Run the web app

```bash
npm run dev
```

Open http://localhost:3000. The first page load compiles for 20 to 30 seconds. Stop with Ctrl+C. The web app works without the API.

### Run the API

In a second terminal, from the repository root:

```bash
npm run dev:api
```

The API listens on http://127.0.0.1:4000 and restarts when you change its files. Check it:

```bash
curl http://127.0.0.1:4000/api/v1/health
```

`"status": "ok"` with `"database": { "status": "up", ... }` means it reached MongoDB and created its collections and indexes. If MongoDB is not running, the API still starts, answers `503` with `"status": "degraded"`, and keeps retrying the connection. Stop it with Ctrl+C; it finishes open requests, then closes the database connection.

### Production build

```bash
npm run build
npm start
npm run start:api
```

`npm run build` builds both apps (the API compiles to `apps/api/dist`). `npm start` serves the web app on port 3000; `npm run start:api` runs the compiled API with the settings in `apps/api/.env`.

### Commands

Run from the repository root.

| Command | What it does |
| --- | --- |
| `npm run setup` | Install dependencies for both apps |
| `npm run dev` / `npm run dev:api` | Web app on port 3000 / API on port 4000, in watch mode |
| `npm test` | All tests: web (scheduling, setup checks, college files, API client) and API (unit and integration) |
| `npm run test:web` | Web tests only |
| `npm run test:api` | API unit and integration tests |
| `npm run test:api:unit` | API tests that need no database |
| `npm run test:api:integration` | API tests against a temporary MongoDB server (needs MongoDB installed; set `MONGOD_PATH` if `mongod` is not on the PATH or in the default install folder) |
| `npm run typecheck` | TypeScript check of both apps |
| `npm run lint` | ESLint for both apps |
| `npm run build` | Production build of both apps |

### Environment configuration

Secrets live only in your local `.env` files, which git ignores. Only the `.env.example` files are committed, and they contain placeholders.

**API** (`apps/api/.env`, see `apps/api/.env.example`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `MONGODB_URI` | (required) | MongoDB connection string, e.g. `mongodb://127.0.0.1:27017/timetable_dev` |
| `CORS_ORIGINS` | none | Comma-separated exact origins allowed to call the API, e.g. `http://localhost:3000`. Required in production |
| `NODE_ENV` | `development` | `development`, `test` or `production` |
| `HOST`, `PORT` | `127.0.0.1`, `4000` | Where the API listens |
| `LOG_LEVEL` | `info` | `fatal` to `trace`, or `silent` |
| `TRUST_PROXY` | `0` | Number of trusted reverse proxies in front of the API |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | How long shutdown waits for open requests |
| `DB_SERVER_SELECTION_TIMEOUT_MS` | `5000` | How long to look for a MongoDB server before reporting it unavailable |

Invalid settings stop the API at startup with a message naming each variable (never its value).

**Web app** (`apps/web/.env.local`, optional, see `apps/web/.env.example`): `NEXT_PUBLIC_API_BASE_URL`, the API origin. It is built into the browser bundle, so it must never contain a secret.

## API

Base path `/api/v1`. Every response uses one of two shapes:

```json
{ "data": { }, "meta": { "requestId": "…" } }
{ "error": { "code": "validation_failed", "message": "…", "fields": [{ "path": "body.name", "code": "…", "message": "…" }], "requestId": "…" } }
```

| Endpoint | Meaning |
| --- | --- |
| `GET /api/v1/health` | `200` with `status: "ok"` when the API is up and MongoDB answers a ping and has its collections and indexes; `503` with `status: "degraded"` and the reason otherwise |
| `GET /api/v1/health/live` | `200` while the process is running (no database check) |

Built in for every future endpoint: request ids (`X-Request-Id`), structured request logs without personal data, security headers, CORS for listed origins only, JSON-only bodies up to 1 MB, Zod validation of path, query and body (unknown fields refused), and safe error responses (`500` never reveals internal details; database outages return `503` with `Retry-After`). Collections and indexes for the first platform and college-owned records (colleges, users, sessions, memberships, invitations, audit events, idempotency keys, rate limits) are created at startup, with tenant scoping enforced in the data layer and by the database. There is no sign-in yet, so there are no data endpoints yet.

The frontend client (`apps/web/src/lib/api/client.ts`) wraps these conventions: it returns `data`, throws `ApiRequestError` with `code`, `message`, `fields` and `requestId`, retries GET requests after network failures or `503`, times out slow requests, and adds an `Idempotency-Key` to changes. Usage is documented at the top of the file.

## Demo walkthrough (about 4 minutes)

1. **Home** (coordinator view): the sample college's setup checklist and timetable status.
2. **Set up college → Rooms**: open the Networks Lab and see it belongs to CSE; try deleting a teacher who has courses: it is refused with the list of courses.
3. **Generate**: the pre-check passes; press **Generate timetable**. Expect 74 of 74 sessions placed, 0 clashes. Switch the view to a teacher, room or department. Press **Use this timetable**.
4. **Timetable**: click a class, choose **Move class**, pick a taken slot and press **Check and move**: refused with the reasons. Pick a green suggestion: saved. **Print or save as PDF** prints the current view.
5. **Reports**: teacher loads against limits and room use by department.
6. **Demo view → a teacher**: their day, week and availability. Mark a period with a class as unavailable and save: the page warns about the clash.
7. **Save and open → Stress-test college**, then **Generate**: the pre-check names three problems, and four sessions are reported as unplaced with reasons (no room seats 85 students, no workshop room, a visiting teacher available for only 2 of 3 periods).
8. **Save and open → Blank college**: set up a new college from scratch and generate its timetable.

## What is demo-only

- The sample colleges are invented data. Data you enter stays in this browser only.
- There is no sign-in: Demo view switches between the coordinator and any teacher. In the planned product each person signs in and sees only their own view.
- Data lives in one browser. It is not shared between users or devices and is not backed up unless you download a college file.

## Limitations

- Whole-section classes only: no lab batches, electives, combined classes, or co-teaching yet (designed in `docs/SCHEDULING_ENGINE.md`).
- The generator is a greedy heuristic with retries, not an optimal solver. It suits a small college; repair and improvement stages for larger colleges are designed in `docs/SCHEDULING_ENGINE.md`.
- One time grid per college. Changing the week clears the current timetable (after a confirmation).
- English only for now. Punjabi is part of the plan.
- PDF is through the browser's print dialog; no spreadsheet import, notifications, or one-day changes (cancellations, substitutes) yet.

## Future development

The prototype is growing into a multi-college platform on a MERN-oriented stack: Next.js (React) front end, Node.js and Express API with Zod validation, MongoDB (Atlas, Mumbai region), and a background worker. The design is in `docs/`, starting with `docs/PRODUCT_REQUIREMENTS.md`. It covers, among other items:

- strict data isolation between colleges, enforced by the server
- roles for administrators, principals, coordinators, HODs, teachers and students
- lab batches, electives, combined classes and co-teaching, with explicit clash rules
- drafts, versions, publishing with an undo window, and dated changes (cancellations, substitutes)
- CSV import and export, printable timetables, in-app notifications
- an offline-capable student and teacher view in English and Punjabi

The API foundation exists (`apps/api`); everything else in that list is not built yet. The order of work is in `docs/IMPLEMENTATION_ROADMAP.md`.

## Repository layout

```
package.json     Root scripts for both apps (setup, dev, dev:api, test, build, ...)
apps/web/        The web app (Next.js). Screens in src/app, UI in src/components,
                 scheduling logic in src/lib/timetable, the saved college in src/lib/workspace.ts,
                 API client in src/lib/api/client.ts
apps/web/tests/  Node tests for the scheduler, validator, rooms, capacity, setup checks, pre-check,
                 reports, college files, moves, queries and the API client
apps/api/        The API (Express, TypeScript, MongoDB): src/routes, controllers, services,
                 models, middleware, db (connection, tenant scoping, setup), http (responses, errors)
apps/api/tests/  unit/ (no database) and integration/ (temporary MongoDB server) tests
docs/            Product requirements, architecture, database, API, security and scheduling
                 designs, implementation roadmap, UI/UX guidelines, decision log, audit
```
