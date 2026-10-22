# College Timetable Optimizer

A hackathon prototype showing how a college can produce **clash-free timetables** automatically instead of building them by hand, with a teacher-facing app on top.

Built for the "Scheduling Optimizer: Hackathon 1" brief (Punjab Jobs AI Bootcamp).

> **Prototype status.** This version runs entirely in the browser with invented sample data. There is no server, database, or login. Changes are saved only in your browser (localStorage). The full multi-college platform described in `docs/` is future work.

## What it does

You are signed in as a sample teacher, **Dr. Amandeep Singh** (Computer Science and Engineering) at an invented college. You can:

1. See today's classes, the next class (subject, time, room, section), weekly load and free periods.
2. Browse a weekly timetable (Monday to Saturday, with a half-day Saturday and a lunch break) or a day-by-day view.
3. Mark periods as available or unavailable, save them, and see them again after a refresh.
4. Run a **working timetable generator** on a whole sample college (4 sections, 8 teachers, 6 rooms, 74 weekly sessions) that uses your saved availability.
5. See the result validated by an **independent clash checker**: teacher, room and section clash counts, plus a list of any sessions that could not be placed and why.
6. Open any class for its details and **move** it. A move is saved only if the whole timetable stays clash-free; otherwise the reasons are shown.

## Features

| Area | What is implemented |
| --- | --- |
| Teacher dashboard | Profile and department, today's date, next class with countdown, today's agenda (classes, free periods, lunch), upcoming classes this week, weekly load, day-by-day load bars, clash status |
| My Timetable | Week grid (period rail, lab blocks span 2 periods, hatched lunch break, free cells, today highlighted) and a Day view with day switcher; subject colour plus code on every card; legend |
| Class details | Dialog with subject, section, room, teacher, day, time and duration; "Move class" with clash-free suggestions and full revalidation before saving |
| My Availability | Tap grid per period, whole-day toggle, unsaved-changes guard, validation (cannot drop below your weekly teaching load), warnings when a saved choice clashes with your current timetable, persisted in localStorage |
| Generate Timetable | Two sample data sets (standard, over-constrained stress test), deterministic seeded generator, regenerate with a new seed, results by teacher, section or room, clash counts, unplaced sessions with reasons, "use as my timetable" (only for a validated result, with confirmation) |
| Profile | Teaching assignments, sample-data notice, reset demo data (with confirmation) |
| Quality | Loading skeletons, empty states, success toasts, error and warning banners, keyboard-operable controls, visible focus, screen-reader labels on grid cells, responsive from 375 px phones to desktop |

### Scheduling rules enforced

- No teacher, room, or section is double-booked.
- Teachers are never placed in periods they marked unavailable.
- Room type (lecture or lab) and capacity must fit the section.
- Labs are one 2-period block and never run across the lunch break or past the end of the day.
- A teacher's daily teaching limit is respected.
- Sessions that cannot be placed are **reported with reasons**, never dropped silently.

Soft preferences (scored, not mandatory): spread a subject across the week, balance daily load for sections and teachers, labs in the afternoon, avoid first and last periods.

### How the generator works

`apps/web/src/lib/timetable/scheduler.ts` expands each course requirement into weekly sessions, places the most constrained sessions first (labs, teachers with few free periods, few suitable rooms), and gives each the lowest-penalty slot that breaks no hard rule. It retries with failed sessions first and keeps the best attempt. A seeded random tie-break makes runs reproducible: the same seed and inputs always give the same timetable.

`apps/web/src/lib/timetable/validator.ts` is a separate checker that shares no placement logic with the generator. It re-checks every pair of classes and every rule. The UI calls a timetable clash-free only when the validator reports zero problems.

## Technology

- Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4
- No other runtime dependencies: icons are inline SVG and dialogs use the native `<dialog>` element
- Tests use Node's built-in test runner (`node:test`) running the TypeScript files directly
- Persistence: browser localStorage only

## Run it on Windows

You need **Node.js 22.18 or newer** (Node 24 recommended). Check with `node --version`.

1. Open a terminal (PowerShell, Command Prompt or Git Bash) in the **repository root**: the folder that contains this `README.md`, `package.json` and `apps\`. On this machine that is `C:\Users\anand\Desktop\timetable, hackathon 1`. Quote the path when changing into it, because it contains a comma and a space:

   ```bash
   cd "C:\Users\anand\Desktop\timetable, hackathon 1"
   ```

2. Install dependencies (first time only):

   ```bash
   npm run setup
   ```

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open http://localhost:3000. The first page load compiles for 20 to 30 seconds; after that it is fast. Stop the server with Ctrl+C.

The root scripts forward to the app in `apps\web`. You can also run `npm install` and `npm run dev` directly inside `apps\web`.

Other commands (run from the repository root):

| Command | What it does |
| --- | --- |
| `npm test` | Scheduler, validator, move, storage and query tests |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run build` then `npm start` | Production build and server |

No environment variables, API keys, Docker, Python, database or backend server are needed.

## Demo walkthrough (about 3 minutes)

1. **Dashboard** opens with the sample teacher's day: next class, today's agenda, weekly load.
2. **My Timetable**: switch between Week and Today/Day. Click a lab card, choose **Move class**, pick a slot that is taken (for example the same time on another day with a class) and press **Check and move**. The move is refused with the exact clashes. Pick a green suggestion instead and it saves.
3. **My Availability**: mark a period where you have a class as unavailable and save. The page warns that it clashes with your current timetable. Refresh: the choice is still there.
4. **Generate Timetable**: keep **Standard semester** and press **Generate timetable**. Expect 74 of 74 sessions placed and 0 teacher, room and section clashes, with your new unavailable period left free. Switch the view to a section or room. Press **Use as my timetable** to apply it.
5. Choose **Over-constrained (stress test)** and generate. Four sessions are reported as unplaced, each with a reason: no room seats 85 students, no workshop room exists, and a visiting teacher is available for only 2 of the 3 periods needed.
6. **Profile → Reset demo data** restores the original sample.

## What is demo-only

- All people, rooms, subjects, and the college are invented sample data.
- There is no sign-in. You are always the one sample teacher.
- Data lives in one browser. It is not shared between users or devices and is not backed up.
- Teachers can move classes here to show live clash checking. In the planned product, moves belong to the timetable coordinator.
- The over-constrained data set is for review only and cannot be applied as the teacher's timetable.

## Limitations

- Whole-section classes only: no lab batches, electives, combined classes, or co-teaching.
- The generator is a greedy heuristic with retries, not an optimal solver. It suits a small college; large colleges need the CP-SAT solver planned in `docs/TECHNICAL_PLAN.md`.
- One time grid per college. Edit `apps/web/src/lib/timetable/demo-data.ts` to change days, periods, times, or breaks.
- English only for now. Punjabi is part of the full plan.
- No PDF export, notifications, or one-day changes (cancellations, substitutes).

## Future development

The full design is in `docs/`. Among other items, it covers:

- multi-college tenancy with row-level security
- roles for principals, coordinators, HODs, teachers and students
- a FastAPI backend with PostgreSQL in an Indian region, and background workers
- an OR-Tools CP-SAT solver
- spreadsheet import
- publishing with an undo window, and SMS and email alerts for changes
- an offline-capable student view in English and Punjabi

None of that is built yet. The prototype contains no backend code.

## Repository layout

```
package.json     Root scripts that forward to apps/web (setup, dev, test, build, ...)
apps/web/        The prototype (Next.js). Screens in src/app, UI in src/components,
                 scheduling logic in src/lib/timetable, localStorage in src/lib/storage.ts
apps/web/tests/  Node tests for the scheduler, validator, moves, storage and queries
docs/            Product spec, technical plan, UI/UX guidelines, implementation plan,
                 architecture review, decision log (the full-platform design is future work)
```
