# PRODUCT_AUDIT.md

Audit of the College Timetable Optimizer repository against the evaluator's brief ("Scheduling Optimizer: Hackathon 1") and the new product direction: a multi-college timetable platform for Punjab on the MERN stack.

- Date: 2026-10-26
- Branch audited: `hackathon-prototype` at `f8ed1e2` (working tree clean). No branch was changed and no history was rewritten.
- Scope: audit only. No application code, dependency, configuration or existing document was changed. The only file added is this report.

## How to read the evidence tags

Every finding says how it was established:

| Tag | Meaning |
| --- | --- |
| **[T]** | Covered by an existing automated test that I ran and saw pass |
| **[P]** | Reproduced with a probe script I wrote and ran against the real modules (kept outside the repository, in the session scratchpad) |
| **[B]** | Checked by hand in the running app (dev server, in-app browser) |
| **[S]** | Found by reading the source only; not executed |
| **[D]** | Stated in documentation only; not verified |

Commands run on 2026-10-26, Node 24.13.0:

| Check | Result |
| --- | --- |
| `npm test` | 33 tests, 9 suites, all pass |
| `npm run typecheck` | Pass, no errors |
| `npm run lint` | Pass, no warnings |
| `npm run build` | Pass; 6 static routes, first-load JS 119 to 127 kB |
| `npm audit --omit=dev` (apps/web) | 2 findings (1 high, 1 moderate): PostCSS bundled inside `next` (see 4.3) |

---

## 1. Current architecture and file structure

### 1.1 Architecture

A **frontend-only Next.js 15 prototype**. There is no server, database, login or network API. Everything runs in the browser:

```
Browser
  Next.js App Router pages (all "use client", statically prerendered)
    └─ DemoStoreProvider (React context, src/lib/store.tsx)
         ├─ STANDARD_DATASET (hard-coded sample college, demo-data.ts)
         ├─ localStorage: cto.availability.v1 (one teacher's unavailable slots)
         └─ localStorage: cto.timetable.v1   (the whole college's entries)
    └─ src/lib/timetable/ (pure TypeScript domain logic, no React, runs in Node tests)
         scheduler.ts  greedy generator      validator.ts  independent checker
         moves.ts      manual move + suggest  queries.ts    teacher views
```

Stack [S, T]: Next.js 15.5.28, React 19.1.0, TypeScript 5 (strict), Tailwind CSS 4, ESLint 9. No other runtime dependencies. Tests use Node's built-in runner, importing `.ts` files directly (Node 22.18+ type stripping).

### 1.2 File structure

```
package.json                 Root scripts forwarding to apps/web (setup, dev, test, build, start, typecheck, lint)
.claude/launch.json          Dev-server config (npm --prefix apps/web run dev, port 3000)
CLAUDE.md, README.md         Prototype rules and usage
Prototype-Summary.pdf        Two-page summary (committed binary)
docs/                        PROJECT_SPEC, TECHNICAL_PLAN, IMPLEMENTATION_PLAN, ARCHITECTURE_REVIEW,
                             UI_UX_GUIDELINES, DECISIONS (+ this PRODUCT_AUDIT)
apps/web/
  src/app/                   page.tsx (dashboard), timetable/, availability/, generate/, profile/, layout.tsx, globals.css
  src/components/            app-shell, week-grid, day-agenda, class-card, class-dialog, modal, toast, ui, icons, subject-style
  src/lib/store.tsx          React context: dataset, availability, timetable, save, reset
  src/lib/storage.ts         localStorage read/write and validating parsers
  src/lib/timetable/         types, grid, demo-data, availability, lookup, scheduler, validator, moves, queries
  tests/                     scheduler, validator, moves, storage-and-queries (*.test.ts)
```

Size: about 4,300 lines of TypeScript/TSX in `apps/web` (domain logic about 1,200, UI about 2,800, tests about 350).

### 1.3 Data model (as implemented) [S]

| Type | Fields | Notes |
| --- | --- | --- |
| `TimeGrid` | days (id, periodCount), periods (number, start, end), breaks (afterPeriod) | One grid; day ids fixed to `mon`..`sat` |
| `Teacher` | id, name, designation, department, employeeId, email, maxPeriodsPerDay | No weekly max, no subject eligibility |
| `Room` | id, name, type (`lecture` / `lab` / `workshop`), capacity, building | No department ownership or shared flag |
| `Subject` | id, code, name, kind (`theory` / `lab`), color | |
| `Section` | id, name, programme, semester, strength | No department, no batches |
| `SessionRequirement` | subjectId, teacherId, sectionId, sessionsPerWeek, span, roomType | One teacher, one section per requirement |
| `ScheduledEntry` | requirementId plus copies of subject, teacher, section; roomId, day, startPeriod, span | Denormalised; copies are not checked against the requirement (see 4.1) |
| `AvailabilityMap` | teacherId → unavailable slot keys | Only the demo teacher's is editable |

There is no college/tenant id, user, role, department entity, version, status or audit field anywhere.

### 1.4 Repository and delivery state [S]

- `origin` is `github.com/purvika01-ux/timetable-scheduler`. `origin/main` contains only the first commit (`4d034fa specs file`). The 9 commits on `hackathon-prototype` are **not on any remote branch**. The brief's GitHub submission currently shows none of the prototype.
- There is **no deployment configuration** and no CI workflow (`.github/` does not exist). The brief requires a live link.
- Local branches `main` and `phase-0` also exist; `main` equals `origin/main`.

---

## 2. Verified working features and how they work

| Feature | How it works | Evidence |
| --- | --- | --- |
| **Timetable generation** | `scheduler.ts` expands each requirement into weekly sessions, orders them hardest first (fewest slot × room options, then longer span, then seeded jitter), and gives each the lowest-penalty slot whose teacher, section and smallest suitable free room are all free, within availability and the teacher's daily limit. Up to 8 attempts; failed sessions go first next time; the best attempt (fewest failures, then lowest penalty) is kept. | [T] 74/74 placed for seeds 1 to 25 with 0 validator issues; [B] 74/74 in the UI |
| **Determinism** | mulberry32 PRNG seeded from `seed * 7919 + attempt` | [T] same seed gives identical entries; a different seed differs |
| **Soft preferences** | Penalty terms: same subject twice in a day (+20), section and teacher daily load (+0.6 per period), labs before lunch (+1), first or last period (+0.5) | [S] Scored but not reported to the user |
| **Unplaced sessions with reasons** | `explain()` reports: no room of that type, no room large enough, no available slot, total load above availability, and counts of blocked slots by cause | [T] over-constrained data set: 4 unplaced with expected reasons; [B] |
| **Independent validator** | Pairwise overlap on the same day for same teacher / room / section; per entry: unknown references, outside the day, across a break, teacher unavailable, capacity, room type | [T] each rule has a test; [P] but see the gaps in 4.1 |
| **Clash-free display gate** | Generate page shows "Clash-free" only when `report.valid`; "Use as my timetable" needs `valid` and the standard data set | [S, B] but `valid` ignores unplaced sessions (4.1, B2) |
| **Manual move with revalidation** | `checkMove` applies the move and re-runs the whole validator; only issues involving the moved entry block it. `findValidMoves` tries every valid start × suitable room | [T] clash, availability and lunch-crossing moves rejected; suggested moves validate |
| **Teacher dashboard** | Next class with countdown, today's agenda (free periods and lunch), upcoming classes, weekly load, sections, clash-status line | [T] agenda and next-class queries; [B] renders |
| **My Timetable** | Week grid (table semantics, lab blocks span 2 rows via `rowSpan`, hatched lunch and Saturday half day, today highlighted) and Day view with day picker | [B] desktop and 375 px phone, no horizontal page overflow |
| **My Availability** | Tap grid, whole-day toggle, unsaved-changes guard (`beforeunload`), refuses to save when available periods < weekly load, warns about periods where a class exists | [B] save persists after reload; [S] guard logic (see B7 for its gap) |
| **Generate views** | Result by teacher, section or room; flagged entries outlined; class details dialog | [B] |
| **Persistence and recovery** | Versioned JSON in localStorage; parsers reject wrong shape, wrong version, unknown ids or out-of-grid slots and fall back to the sample with a notice; storage exceptions are caught | [T] corrupted and outdated data rejected safely |
| **Reset demo data** | Confirmation dialog (Cancel first and focused), removes both keys, regenerates the sample | [S]; summary claims [B] by the earlier session, not re-run today |
| **Honest UI** | "Sample data" stamps, "saved in this browser only" copy, over-constrained result cannot be applied | [B] |
| **Accessibility basics** | Skip link, `aria-current` navigation, labelled grid buttons (`aria-label` describes the class), table captions, native `<dialog>`, visible focus ring, reduced-motion CSS, colour always paired with subject code | [S]; spot-checked [B]; no automated accessibility test exists |

---

## 3. Missing and incomplete functionality

### 3.1 Against the brief

| Item | State |
| --- | --- |
| "Work for **any** college, not just one" | **Missing.** The college, grid, teachers, rooms, subjects, sections and requirements are hard-coded in `demo-data.ts`. There is no way to enter or import another college's data in the app. |
| "A college **administrator** could use it without help" | **Missing.** The only role is one sample teacher. There is no administrator or coordinator flow (set up data, generate, review, publish). |
| Departments competing for shared spaces | **Missing.** No department entity on sections or rooms, no shared-room concept, no cross-department view. All sample data is one CSE department. |
| Uneven teaching loads, empty rooms | **Partial.** Load balance is a soft penalty only. No load report across teachers, no room utilisation view. |
| GitHub repository with source, README, CLAUDE.md | **Incomplete.** The files exist locally but the branch is not pushed. |
| Live deployed link | **Missing.** |

### 3.2 Against the full-product vision (MERN, multi-college, six roles)

| Area | State |
| --- | --- |
| Backend API (Express/Node) | Missing |
| Database (MongoDB) | Missing |
| Multi-college tenancy and isolation | Missing (no tenant id anywhere) |
| Authentication, sessions, invites | Missing (always signed in as the sample teacher) |
| Roles: administrator, principal, coordinator, HOD, teacher, student | Only a teacher view; no authorization |
| Master data CRUD and spreadsheet import | Missing |
| Departments, programmes, semesters, batches, electives, combined classes, co-teaching | Missing (whole-section, one-teacher classes only) |
| Rules: locks, never/only rules, configurable weights | Missing |
| Generation as a background job with progress, cancel, time limit | Missing (runs synchronously in the page) |
| Draft, versions, submit, approve, publish, undo | Missing |
| Concurrent editing control | Missing |
| Editor for coordinators (drag and drop, swap, lock, undo) | Partial: one-class "move" form for the teacher |
| Student view (link or QR, Today, Week) | Missing |
| Day-to-day changes (cancel, room change, substitute) | Missing |
| Notifications (in-app, email, SMS) | Missing |
| Exports (PDF, Excel, print layouts) | Missing |
| Punjabi language | Missing (English only, by decision P7) |
| Reports (clash audit, workload, room utilisation) | Partial: clash counts on the Generate page only |
| Audit log | Missing |
| CI, end-to-end tests, accessibility tests, deployment | Missing |

### 3.3 Hard constraints: generator versus validator

The brief's first judging criterion is "no clashes". The rule in CLAUDE.md is that the validator is the independent judge. This table shows which hard constraints each component enforces.

| Hard constraint | Generator | Validator | Evidence |
| --- | --- | --- | --- |
| Teacher not double-booked | Yes | Yes | [T] |
| Room not double-booked | Yes | Yes | [T] |
| Section not double-booked | Yes | Yes | [T] |
| Teacher availability | Yes | Yes | [T] |
| Room type | Yes | Yes, but skipped when the requirement id is unknown | [T], [P] |
| Room capacity | Yes | Yes | [T] |
| Inside the day's periods | Yes | Yes | [T] |
| Not across a break | Yes | Yes | [T] |
| **Teacher daily teaching limit** | Yes | **No** | [P] |
| **Class duration equals the requirement's span** | Yes | **No** | [P] |
| **Entry's teacher, subject, section match its requirement** | Yes | **No** | [P] |
| **Required weekly sessions all present (none missing)** | Reports unplaced | **No** | [P] |
| **No extra sessions beyond the weekly requirement** | Yes | **No** | [P] |
| **Unique entry ids** | Yes | **No** | [P] |
| **Requirement id exists** | Yes | **No** | [P] |
| **Integer period numbers** | Yes | **No** (1.5 and NaN pass) | [P] |
| Section daily maximum, teacher weekly maximum, subject eligibility | Not modelled | Not modelled | [S] |
| Grid well-formed (periods ordered, breaks consistent with times) | Not checked | Not checked | [S] |
| Input data consistent (subject kind vs room type, strength > 0) | Not checked | Not checked | [P] |

---

## 4. Bugs, correctness risks and security risks

Severity: **High** (breaks a judging criterion or a CLAUDE.md rule), **Medium**, **Low**.

### 4.1 Correctness

| # | Sev | Finding | Reproduction | Evidence |
| --- | --- | --- | --- | --- |
| B1 | High | **Manual moves can break the teacher's daily limit.** The validator does not check `maxPeriodsPerDay`, so `checkMove` accepts, and `findValidMoves` *suggests in green*, moves that exceed it. README and the Generate page list the daily limit as a hard rule. | Standard data, seed 1: three suggested moves put Dr. Amandeep Singh on 6 periods on Monday (limit 5). The validator returns `valid: true`. | [P] |
| B2 | High | **An incomplete timetable is treated as complete.** `report.valid` ignores unplaced sessions, so "Use as my timetable" is enabled for a result with missing sessions. The confirmation does not mention them. After applying, the dashboard says "no teacher, room or section clashes" and shows "0 lab blocks" with no warning. Breaks CLAUDE.md rule 2 in spirit (the loss is reported once on the Generate page and then forgotten). | Availability: Monday and Tuesday only (accepted by the save guard). Generate: 72 of 74 placed, both Data Structures labs unplaced, button enabled. Applied; dashboard shows no warning. | [P, B] |
| B3 | High | **Validator does not tie entries to their requirement.** A lab entry with `span: 1`, an entry whose teacher or subject was changed, an extra eighth session, or an entry with an unknown `requirementId` all pass as valid. Today the generator never produces these, but the validator's job is to catch exactly what the generator or a future editor/API gets wrong. | Each case produced `valid: true`. | [P] |
| B4 | Medium | **Duplicate entry ids are not detected.** `applyMove` maps by id, so a move would move every entry sharing that id. | Two entries with the same id in different slots: `valid: true`. | [P, S] |
| B5 | Medium | **Stored timetable is not revalidated on load,** and the dashboard mislabels problems. A clash in `cto.timetable.v1` loads silently. The dashboard banner heading always says "classes no longer fit your saved availability", even for a room double-booking. Problems that do not involve the demo teacher are not shown anywhere. | Planted a room clash in storage: the dashboard showed "Room 204 is booked twice" under the availability heading; no load notice. | [P, B] |
| B6 | Medium | **Availability save guard ignores the daily limit and lab blocks.** It only compares total available periods with weekly load. Two available days give 16 ≥ 13, but 2 days × 5 periods per day = 10 < 13, so the timetable can never be complete. The unplaced reason then blames "already teaching (11)" instead of the real cause. | As in B2. | [P, B] |
| B7 | Low | Validator accepts non-integer or `NaN` start periods (comparisons with `NaN` are false). The storage parser rejects non-integers, so this matters for future API input. | `startPeriod: NaN` → `valid: true`. | [P] |
| B8 | Low | Storage parser accepts `span: 0` (the validator then flags it as a grid issue, so it is not shown as valid). | [P] |
| B9 | Low | Times use the browser's local time zone, not Asia/Kolkata (PROJECT_SPEC D9 is OPEN). A user outside India sees wrong countdowns. | [S] |
| B10 | Low | `WeekGrid` sizes a cell by the longest entry starting there; overlapping entries of different spans (only possible in an invalid result) can render misaligned. | [S] |

### 4.2 Performance and scale

| # | Sev | Finding | Evidence |
| --- | --- | --- | --- |
| S1 | Medium | `findValidMoves` re-runs the full O(n²) validator for every slot × room. Opening "Move class" takes about 50 ms at 74 sessions, about 1 s at 370 and about **5 s at 740**, blocking the page. | [P] synthetic colleges built by copying the sample 5× and 10× |
| S2 | Medium | Generation runs synchronously on the main thread: about 0.7 s at 740 sessions, about 1 s at 1,480. Acceptable now; a real multi-department college with batches will freeze the page. It needs a Web Worker now and a server job later. | [P] |
| S3 | Low | The validator is O(n²) pairwise: 91 ms at 1,480 sessions. Fine up to a large college; index by (resource, day) later. | [P] |
| S4 | Info | The greedy heuristic placed every session on the synthetic 20× college (1,480 sessions) with zero clashes. Those copies share no resources, so this does not prove quality on tightly shared inputs. | [P] |

### 4.3 Security and privacy

The prototype has no server, no login and no real data, so most platform risks do not apply yet. Current state:

| # | Sev | Finding | Evidence |
| --- | --- | --- | --- |
| X1 | Info | No authentication or authorization of any kind. Correct for a sample-data demo; anyone with the link is the sample teacher. | [S] |
| X2 | Low | `npm audit`: high-severity PostCSS advisories through the `postcss` copy bundled in `next` 15.5.28 (XSS in stringified CSS, source-map file read). PostCSS runs at build time on the project's own CSS, so practical exposure is low. The suggested fix is a major upgrade to Next 16, which needs owner approval. | [audit run] |
| X3 | Low | No security headers configured (`next.config.ts` is empty): no CSP, frame denial or HSTS. Needed before any real deployment with user data. | [S] |
| X4 | Low | localStorage data is trusted after shape checks only; no clash or completeness revalidation (B5). No cross-tab sync: two tabs editing the timetable overwrite each other (last write wins, no `storage` event listener). | [S] |
| X5 | Info | Sample data uses invented names and `svit.example.edu` emails, as CLAUDE.md requires. | [S] |
| X6 | Info | `.gitignore` excludes all `*.csv` and `*.xlsx`. Good for data safety, but it will also block committing import templates and test fixtures; it needs an exception when import is built. | [S] |

### 4.4 Platform risks not yet addressed (no code exists)

Multi-college data isolation, authentication, authorization, concurrent editing, schedule versioning and server-side failure handling **do not exist** in the code. The designs in `docs/` are PostgreSQL-specific (row-level security, exclusion constraints) and do not carry over to MongoDB (see section 7). These are design gaps, not bugs, and section 10 plans them.

### 4.5 Repository hygiene

- The latest commit "first prototype" mixes several concerns (backend deletion, docs, launch config, the PDF), against CLAUDE.md's "small, one concern each" rule. [S]
- A 260 KB binary PDF is committed at the repository root. [S]
- Test gaps: no tests for the store, the pages, the daily-limit or completeness rules, cross-tab behaviour, accessibility or end-to-end journeys. [S]

---

## 5. Existing code worth retaining

| Code | Why keep it | Change needed |
| --- | --- | --- |
| `src/lib/timetable/` (types, grid, scheduler, validator, moves, queries, lookup) | Pure TypeScript with no React or browser APIs: it can run unchanged in Node/Express, in a worker thread and in the browser. Deterministic, tested, readable. This is the core asset. | Close validator gaps (B1 to B4, B7) first; extend the model (tenant, departments, batches); move into a shared package |
| `tests/*.test.ts` and the Node test runner setup | 33 fast, meaningful tests; no extra dependency | Add tests for every new rule; add property tests (random timetables against a brute-force checker) |
| Storage parsers (`storage.ts`) | The validate-then-fallback pattern is the right one for API input too | Becomes the offline cache and demo mode; API input moves to schema validation |
| UI components: `week-grid`, `day-agenda`, `class-card`, `class-dialog`, `modal`, `toast`, `ui`, `icons`, `subject-style` | Accessible, responsive, light on dependencies, match UI_UX_GUIDELINES | Make data-source agnostic (props, not the demo store); add role-aware actions |
| Design tokens (`globals.css`) and UI_UX_GUIDELINES | Colour contrast, focus, states and components already defined | Add dark theme and Punjabi later |
| Teacher screens (dashboard, timetable, availability) | Fit the teacher role in the product almost as they are | Read from the API; remove the demo-only "move" for teachers (P5) |
| Generate screen layout (stats, unplaced list, perspective switch) | Good basis for the coordinator's generation result page | Driven by a real run and real inputs |
| PROJECT_SPEC sections 1, 2, 5 to 8 (roles, features, business rules, permissions matrix), UI_UX_GUIDELINES, ARCHITECTURE_REVIEW sections 1, 3, 4 | Largely technology-neutral product thinking | Re-check against MERN (section 7) |

---

## 6. Features that need to be redesigned

| Feature | Current design | Why it must change | Direction |
| --- | --- | --- | --- |
| Data source | `STANDARD_DATASET` constant; `DemoStoreProvider` holds one teacher, one data set | "Any college" and multi-college need per-college data from a database | API-backed data layer per college; keep the sample as a seeded demo college |
| Domain model | Single grid, whole-section classes, one teacher, no departments | Real Punjab colleges need departments, shared rooms, lab batches, electives, combined classes, co-teaching (ARCHITECTURE_REVIEW 1.1, 1.6, 4.3) | Add tenant id, departments, batches and groups, with a single "do these two entries clash?" predicate shared by validator, generator and database |
| Validator | Clash and placement checks only | Must be the complete judge of a timetable (3.3) | Add daily limit, duration, requirement consistency, completeness, duplicates, integer periods; separate "clash-free" from "complete" in the report |
| Availability | Hard-coded seed map for other teachers; only the demo teacher can edit; guard counts periods only | Every teacher, set by deadline, reviewed by HOD | Per-teacher records; feasibility pre-check that includes daily limits and lab blocks |
| Generation | Synchronous in the page; whole college only | Freezes on large inputs; needs persistence and progress | Run in a worker (browser now, server job later); store input snapshot, seed and result |
| Manual edit | Teacher can move own class; suggestion search is slow | Moves belong to the coordinator (P5); concurrency; speed | Coordinator editor; incremental clash index instead of whole re-validation per candidate; version check on save |
| Timetable state | One mutable timetable in localStorage | Needs draft, versions, approval and publish | Draft / submitted / approved / published states with immutable published versions |
| Dashboard clash line | Re-validates on every render; mislabels issue kinds | Accuracy (B5) | Show issues grouped by kind; include completeness |
| Profile "Reset demo data" | Clears localStorage | Real accounts | Demo college only; real colleges get settings and data management |

---

## 7. Conflicts between current documentation and the new MERN requirements

The existing documents describe two architectures: the current frontend-only prototype (CLAUDE.md, README, DECISIONS P1 to P8) and a future FastAPI + PostgreSQL platform (TECHNICAL_PLAN, IMPLEMENTATION_PLAN, PROJECT_SPEC decisions). The new direction, MERN (MongoDB, Express, React, Node), conflicts with both.

| # | Document and item | What it says | Conflict with MERN |
| --- | --- | --- | --- |
| C1 | CLAUDE.md "Current state" and DECISIONS P1, P8 | Frontend only; do not add a backend, database, workers or packages without approval | The new direction needs all of these. CLAUDE.md must be updated once the owner approves. |
| C2 | PROJECT_SPEC D1; TECHNICAL_PLAN §3 | Own JWT issued by **FastAPI** | Issuer becomes Express. Token policy (access token in memory, rotated HttpOnly refresh cookie) can carry over. |
| C3 | PROJECT_SPEC D2; TECHNICAL_PLAN §4; DECISIONS C1 | Tenant isolation by **PostgreSQL row-level security** plus API checks | MongoDB has no row-level security. Isolation must be enforced in the data-access layer (mandatory `collegeId` in every query, tested), or by one database per college. |
| C4 | TECHNICAL_PLAN §5; DECISIONS C3; ARCHITECTURE_REVIEW 1.2, 1.3 | Clashes prevented by **exclusion constraints** (`btree_gist`, `int4range`), deferrable for swaps | No equivalent in MongoDB. Replacement: an "occupancy" collection with a unique compound index per (college, version, resource, day, period), written in the same multi-document transaction as the entries (needs a replica set, which Atlas provides). |
| C5 | PROJECT_SPEC D3; TECHNICAL_PLAN §6; DECISIONS C2 | Job queue: **Redis + RQ** (Python); C2: PostgreSQL job table | Node options: BullMQ (Redis) or a MongoDB-backed queue. Owner choice. |
| C6 | TECHNICAL_PLAN §6; README; ARCHITECTURE_REVIEW 4.8 | Solver: **OR-Tools CP-SAT** in a Python worker | CP-SAT is not native to Node. Options: keep and improve the TypeScript heuristic; use a WebAssembly MIP solver; or keep a separate Python solver service (no longer pure MERN). Owner choice. |
| C7 | TECHNICAL_PLAN §5, §10; IMPLEMENTATION_PLAN Phase 1 | SQL schema, Alembic migrations, database roles (`api`, `worker`, `migrator`), composite foreign keys, partial unique indexes | Replace with MongoDB collections, schema validation (Mongoose or JSON Schema), a migration tool, and application-level referential checks. |
| C8 | PROJECT_SPEC "Region"; DECISIONS Q1 | **PostgreSQL** in an Indian region; native PostgreSQL 16 locally | The Indian-region requirement should carry over to MongoDB (MongoDB Atlas offers a Mumbai region; verify before relying on it). Local development needs MongoDB with a replica set for transactions. |
| C9 | TECHNICAL_PLAN §9 | pytest, Hypothesis, integration tests against PostgreSQL with RLS | Node equivalents: Node test runner (already used), a property-testing library, integration tests against a real MongoDB. New test packages need approval. |
| C10 | TECHNICAL_PLAN §2, PROJECT_SPEC "Repo" | `apps/api` is Python (`app/{api,core,...}`, `alembic/`) | `apps/api` becomes an Express/TypeScript service. |
| C11 | CLAUDE.md "Future platform" rules | "Pydantic/Zod validation" | Pydantic drops out; Zod (or similar) on both sides. |
| C12 | README "Future development"; Prototype summary "Planned" | FastAPI, PostgreSQL, CP-SAT | Out of date once MERN is approved. |
| C13 | "R" in MERN | The current front end is **Next.js**, which is React | Not a hard conflict: Next.js can stay as the React layer talking to a separate Express API (as D24 already assumes). The alternative is a plain React single-page app (for example Vite), which would mean redoing routing and build. Owner choice. |
| C14 | DECISIONS P2, P5 | Teacher-first prototype; teachers may move classes | The brief's usability test is about an **administrator**. A coordinator/administrator flow should come first; teacher moves should become coordinator moves. |

Items that do **not** conflict and can be kept: roles and permissions matrix, business rules (PROJECT_SPEC §7), the version rule (D22), exception keying (D10), notification rules, UI_UX_GUIDELINES, accessibility and performance targets, the Indian-region rule, "no access token in browser storage", the audit-log requirement, English and Punjabi.

**OPEN items are not decided here.** D4 (hosting), D11 (solver sizing), S1 to S15, U1 to U9 and the others in PROJECT_SPEC §4 remain the owner's decisions.

---

## 8. Prioritised gap analysis

Priority: **P0** needed for the hackathon judging, **P1** needed for a first real college (MVP), **P2** product growth, **P3** later.

| Pri | Gap | Brief criterion / vision | Effort |
| --- | --- | --- | --- |
| P0 | Push the branch to GitHub and deploy a live link | Submission requirements | S |
| P0 | Close validator gaps B1 to B4 and B7; stop presenting incomplete results as complete (B2); feasibility guard with daily limits (B6); revalidate stored data (B5) | Core functionality: "no clashes" | S to M |
| P0 | Administrator/coordinator flow that lets **any college** enter its own data (grid, departments, rooms, teachers, subjects, sections, requirements) with validation, plus import/export of that data as a file | "Work for any college"; usability | M to L |
| P0 | Coordinator views: whole-college timetable by section, teacher, room and department; printable layout | Design; relevance | M |
| P0 | Shared rooms across departments, and load and room-use summaries | Relevance: shared seminar halls and labs, uneven loads, empty rooms | M |
| P1 | Express API, MongoDB, tenant isolation, authentication, roles | Full product | L |
| P1 | Master data CRUD and spreadsheet import with preview and errors | Full product | L |
| P1 | Generation as a background job; persisted runs with seed and input snapshot | Full product | M |
| P1 | Draft, versions, approval and publish; concurrent-edit control | Full product | L |
| P1 | Lab batches and elective groups (clash predicate) | Advanced functionality; relevance | L |
| P1 | Student access by link or QR; Today and Week | Full product | M |
| P1 | Punjabi | Full product | M |
| P1 | CI, end-to-end and accessibility tests, security headers, dependency upgrade (X2) | Quality | M |
| P2 | Exceptions (cancel, room change, substitute) and notifications | Full product | L |
| P2 | Locks, never/only rules, weight presets, partial regeneration | Advanced functionality | L |
| P2 | Better optimiser (repair and local search, or a solver service) | Quality at scale | M to L |
| P3 | Cross-college teachers, exam timetables, analytics for the state | Vision | L |

---

## 9. Migration plan that preserves working functionality

Principle: **strangler pattern.** The prototype keeps working, with all tests green, after every step. Nothing is deleted until its replacement is tested.

1. **Fix in place first.** Close the validator and UI gaps inside the current prototype, with tests, before any restructuring. These rules carry into every later layer.
2. **Freeze a demo baseline.** Tag the current working state so the hackathon demo can always be rebuilt.
3. **Extract the core.** Move `src/lib/timetable/` into a workspace package (for example `packages/core`), imported by `apps/web` and later by `apps/api`. Run the same tests from the package. No behaviour change.
4. **Introduce a data-access interface in the web app.** Replace direct use of `DemoStoreProvider` with an interface (load college data, save availability, save timetable, and so on). The first implementation is the existing localStorage one, so the app behaves exactly as now.
5. **Add the API beside it.** Create `apps/api` (Express, TypeScript) with MongoDB. Implement the same interface over HTTP. The web app selects the implementation by configuration; the sample college stays available as a "demo mode" that needs no server.
6. **Move rules to the server without losing the client copy.** The server runs the same core validator before every write, plus the database occupancy index (C4) as a second guard. The client keeps running the validator for instant feedback.
7. **Move generation to a server job** that calls the same core scheduler, stores the input snapshot, seed and result, and is validated again before it can be saved.
8. **Add identity and roles,** then switch the default implementation from localStorage to the API for signed-in users. Keep demo mode for the public showcase.
9. **Retire prototype-only pieces** (hard-coded availability seeds, teacher moves) only after the replacements pass their acceptance tests.

At every step the definition of done from CLAUDE.md applies: `npm test`, typecheck, lint and build pass, and the affected screen is checked in a browser.

---

## 10. Phased implementation roadmap

Dependencies are on earlier phases. Each phase ends with its acceptance criteria met and a deployable state. **Every new package, provider or architecture choice in these phases needs the owner's approval first** (CLAUDE.md decision protocol); they are written as proposals.

### Phase 0: Correctness and submission (hackathon, no new dependencies)

Depends on: nothing.

- Validator: add the daily limit, duration equals requirement span, teacher/subject/section match the requirement, requirement exists, unique ids, integer periods, and a completeness check (missing or extra sessions per requirement), reported separately from clashes.
- Generate page: a result with unplaced sessions is labelled incomplete; applying it either is blocked or needs an explicit confirmation that names the missing sessions; the dashboard shows the incompleteness.
- Availability feasibility guard counts per-day caps and lab blocks.
- Revalidate stored timetables on load; group dashboard issues by kind.
- Push to GitHub; deploy as a static site (host is an owner decision).

Acceptance: new tests for each validator rule (each probe in section 4 becomes a failing-then-passing test); B1 reproduction refused with a "daily limit" reason; B2 reproduction shows "incomplete"; live link opens the dashboard; all four checks pass.

### Phase 1: "Any college" in the browser (hackathon stretch, no backend)

Depends on: Phase 0. Needs owner approval because it changes P2 (teacher as primary role).

- Coordinator mode: setup screens for grid and breaks, departments, rooms (with shared flag), teachers (daily limit, availability), subjects, sections, requirements; inline validation; pre-check before generating.
- Import and export of the whole college as one JSON file; optional CSV templates (needs a `.gitignore` exception for fixtures, X6).
- Whole-college views by section, teacher, room and department; teacher load and room-use summaries; print stylesheet.
- Generation in a Web Worker.

Acceptance: a new user creates a small college from an empty state without help, generates, and gets a clash-free, complete timetable or a list of unplaced sessions with reasons; a file exported from one browser imports into another and gives the same timetable for the same seed; keyboard-only run-through of the setup flow passes.

### Phase 2: Monorepo and shared core

Depends on: Phase 0.

- Workspace with `apps/web`, `apps/api` (empty), `packages/core`.
- CI: install, lint, typecheck, test, build on every push.
- Property tests: random timetables checked against a brute-force reference checker.

Acceptance: the core package's tests run in CI; the web app behaves identically (manual regression of the six demo steps); CI blocks a failing test.

### Phase 3: API and data foundation (MERN)

Depends on: Phase 2; owner decisions on MongoDB hosting and region, ODM (for example Mongoose), queue, and local development setup.

- Express + TypeScript service, structured logging, error format `{error:{code,message,fields,request_id}}`, health and readiness endpoints.
- Collections with `collegeId` on every tenant document, indexes leading with `collegeId`, schema validation on input.
- Tenant-scoped data-access layer: no route can query without a college context; occupancy collection with unique indexes for teacher, room and section per period (C4); writes in transactions; `rowVersion` on editable documents.

Acceptance: integration tests against a real MongoDB replica set; a two-college test calls every endpoint with the other college's ids and gets 404 and no data; inserting a clashing entry directly through the data layer is refused by the unique index; a concurrent stale update returns 409.

### Phase 4: Identity and access

Depends on: Phase 3; owner decisions on S1, S2, S4, S10 and the student access model.

- Invites, password sign-in, refresh-token rotation in an HttpOnly cookie, access token in memory only.
- Memberships (user, college, role, scope) checked on every request; default deny; roles: platform admin, college administrator/principal, coordinator, HOD, teacher, student.
- Audit log (append-only through the API).
- Rate limits on sign-in and invite endpoints; security headers.

Acceptance: an authorization matrix test proves every route's policy for every role; removing a role takes effect on the next request; refresh-token reuse revokes the session; no token is found in localStorage.

### Phase 5: Master data and import

Depends on: Phases 3 and 4.

- CRUD for all entities with department scoping for HODs.
- Spreadsheet import with template download, preview, cell errors, all-or-nothing confirm, size and row limits.
- Teacher availability with collection deadline.
- Replace the web app's localStorage implementation with the API for signed-in users; demo mode stays.

Acceptance: a coordinator imports a file with errors, fixes them and confirms; nothing is saved before confirmation; an HOD cannot edit another department; the six original demo steps still work in demo mode.

### Phase 6: Generation service, versions and publishing

Depends on: Phase 5; owner decision on the solver approach (C6).

- Pre-check (capacity, availability with daily caps, room shortages) with fix links.
- Generation job with progress, cancel and time limit; input snapshot and seed stored; result revalidated on the server.
- Draft edited in place; versions on submit, publish and "Save version"; one published version per college and semester; publish requires zero clashes and an explicit decision on any unplaced sessions.
- Coordinator editor: move, swap, lock, undo; incremental clash index (fixes S1); stale save returns a version conflict.

Acceptance: J3 (generate, clash-free draft, clashing edit refused) and J4 (stale edit conflict) pass end to end; killing the job mid-run leaves no partial draft; a published version cannot be changed.

### Phase 7: Role experiences

Depends on: Phase 6.

- Principal approval and publish; HOD department review (scope per spec).
- Teacher: existing dashboard, timetable and availability screens on real data.
- Student: section link or QR, Today and Week, cached for offline.
- Batches and elective groups in model, validator and generator (shared clash predicate).
- Punjabi (reviewed copy, U9).

Acceptance: each role's journey runs end to end in English and Punjabi on desktop and a 360 px phone; student page within the 150 KB budget on a 3G profile; batch fixtures generate without false section clashes.

### Phase 8: Operations, notifications, exports

Depends on: Phase 7; provider decisions (Ext1, Ext2, D23).

- Dated exceptions (cancel, room change, substitute) overlaid on the published version.
- In-app and email notifications; SMS for urgent changes only.
- PDF and spreadsheet exports.

Acceptance: J8 (cancellation notifies only the affected section and teacher); exports render Gurmukhi correctly.

### Phase 9: Hardening and launch

Depends on: Phase 8; D4, S6, S7, S9, S11 to S15.

- Accessibility (axe plus manual screen-reader pass), performance budgets, load test at a realistic college size, backup and restore drill, dependency and secret scanning, penetration test, Indian-region production deployment, pilot runbook.

Acceptance: release gate in TECHNICAL_PLAN §9 adapted to MERN: all tests green, no high or critical findings, restore drill done, pen-test findings closed, legal review done.

---

## 11. Decisions needed from the owner before implementation

1. **Confirm the MERN direction supersedes** D1, D2, D3, the PostgreSQL region wording, Q1, C1 to C3 and P1/P8, and that CLAUDE.md, DECISIONS.md, TECHNICAL_PLAN and IMPLEMENTATION_PLAN should be rewritten to match.
2. **React layer:** keep Next.js (recommended, it is React and all screens already exist) or move to a plain React single-page app.
3. **Order of work:** Phase 0 and Phase 1 first for the hackathon (recommended), or go straight to the MERN backend.
4. **Primary role for the hackathon demo:** switch from teacher to coordinator/administrator (recommended by the brief's usability criterion).
5. **Solver approach** (C6), **queue** (C5), **tenancy model** (shared collections with `collegeId` versus one database per college) and **MongoDB host and region** (D4).
6. **Live-link host** for the submission and whether to push `hackathon-prototype` to `main`.
7. **New packages** (Express, MongoDB driver or Mongoose, Zod, a queue library, password hashing, test tooling) and the Next.js major upgrade for X2.
