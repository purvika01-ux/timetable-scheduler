# PRODUCT_REQUIREMENTS.md

Definitive product requirements for **College Timetable Optimizer**, a multi-college timetable platform for colleges in Punjab. Status: approved direction (MERN, decisions M1 to M11 in `DECISIONS.md`); items marked **OPEN** need the owner's approval (section 12).

This document replaces `PROJECT_SPEC.md`. Related documents:

| Document | Covers |
| --- | --- |
| `ARCHITECTURE.md` | System structure, components, runtime, offline, deployment shape |
| `DATABASE_DESIGN.md` | MongoDB collections, relationships, indexes, transactions, concurrency |
| `API_DESIGN.md` | REST conventions and endpoints |
| `SECURITY_MODEL.md` | Authentication, sessions, authorization, tenancy, threat controls |
| `SCHEDULING_ENGINE.md` | Constraints, clash rules, generator, validator |
| `IMPLEMENTATION_ROADMAP.md` | Phases, dependencies, acceptance gates |
| `UI_UX_GUIDELINES.md` | Visual design, components, accessibility details |
| `PRODUCT_AUDIT.md` | Audit of the prototype (2026-10-26) that this plan builds on |

Release tags: **MVP** (first pilot college), **P2** (second release), **Later**.

---

## 1. Product

### 1.1 Problem (from the evaluator's brief)

Most colleges build timetables by hand each semester. Departments fit sections, labs and teachers into the week and compete for shared spaces such as seminar halls and computer labs. It takes weeks and still produces clashes, uneven teaching loads and idle rooms.

### 1.2 Goal

A web application that produces **clash-free timetables for any college**, that a college administrator can use without help, and that keeps students and teachers informed when the timetable changes.

### 1.3 Who uses it and how

| Person | Context | What they need |
| --- | --- | --- |
| College administrator, principal | Office desktop or laptop; not technical; busy | Set up the college once, approve and publish with confidence, see problems in plain language |
| Timetable coordinator | Desktop; works from spreadsheets the departments send | Import data, fix errors, generate, adjust by hand, submit |
| Head of department | Laptop or phone | Assign subjects to teachers, check department load and availability |
| Teacher (permanent, guest, visiting) | Mid-range Android phone, weak or intermittent data | Today and week view, mark availability, know about changes |
| Student | Phone, often shared or with limited data | Next class and room in under 30 seconds, works offline, sees changes |

Assumptions for Indian colleges that shape the design:

- Data arrives as spreadsheets (often inconsistent), not from an integrated system.
- Many teachers have no institutional email; mobile numbers are the common identifier. Several students may share one phone.
- Connectivity is unreliable: pages must be small, cache their last good state, and survive a dropped request without double-submitting.
- One person often holds several roles (the principal may also be the administrator; a HOD also teaches).
- Common structures: L-T-P weekly hours (lecture, tutorial, practical), lab batches, elective baskets, combined lectures, Saturday half days, a lunch break, visiting faculty with narrow availability.
- English and Punjabi (Gurmukhi) are both needed from the start.

### 1.4 What "a better timetable" means

1. **Valid:** breaks no hard constraint (section 6.1). Non-negotiable.
2. **Complete:** every required weekly session is placed, or each missing one is listed with a reason.
3. **Good:** scores well on the college's chosen soft preferences (section 6.2): balanced loads, few gaps, subjects spread across the week, sensible lab times.
4. **Stable:** edits and regenerations change as little as possible of what people already rely on.

### 1.5 Baseline

The frontend-only prototype in `apps/web` (sample data, browser storage, deterministic generator, independent validator, teacher screens, Phase 0 fixes) is the working baseline. Its domain logic in `apps/web/src/lib/timetable/` becomes the shared scheduling core. Nothing is removed until its replacement passes its acceptance criteria (`IMPLEMENTATION_ROADMAP.md`).

---

## 2. Tenancy and roles

### 2.1 Tenancy

- A **college** is a tenant. Every college-owned record carries its college id and is visible only inside that college (`SECURITY_MODEL.md` section 3).
- A **user** is one person. A **membership** links a user to a college with one or more roles and an optional scope (departments). A user can belong to several colleges; the active college is chosen at sign-in or with a switcher.
- Platform roles have no college. Platform staff cannot read college data by default (support access is P2, time-bound, consented and audited).
- A **sample college** (invented data, flagged `isSample`) exists for demos and training and is isolated like any other tenant.

### 2.2 Roles

| Code | Role | Level | Release | Main job |
| --- | --- | --- | --- | --- |
| PA | Platform administrator | Platform | MVP | Create and verify colleges, invite each college's first administrator, suspend colleges, monitor the platform |
| PS | Platform support | Platform | P2 | Time-bound, college-approved support access (read-only proposed, S5) |
| CA | College administrator | College | MVP | College settings, users and roles, master data, academic calendar |
| PR | Principal | College | MVP | Review submitted timetables, publish, approve exceptions policy, reports |
| TC | Timetable coordinator | College (whole college or listed departments) | MVP | Inputs, imports, rules, generation, editing, submission, dated exceptions |
| HOD | Head of department | Department | MVP (limited) | Department master data, teaching assignments, department availability; review at P2 |
| TE | Teacher | Own records | MVP | Own availability and preferences, own timetable, change notices |
| ST | Student | Own section | MVP | Section timetable, changes (access model **OPEN**, N1) |

One person may hold several roles; permissions are the union. CA and PR are separate roles because many colleges separate administration from approval; the same person can hold both.

### 2.3 Permission matrix

Legend: **F** full (create, edit, delete); **D** own department only; **O** own records only; **V** view; **R** request (someone else approves); **–** none. Server-enforced, default deny.

| Capability | PA | CA | PR | TC | HOD | TE | ST |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Create, verify, suspend colleges | F | – | – | – | – | – | – |
| College settings | – | F | V | V | V | – | – |
| Time grid, academic calendar, holidays | – | F | V | V | V | V | V |
| Invite users, assign roles | first CA only | F | – | R (P2) | R (P2, teachers of dept) | – | – |
| View members | – | V | V | – | D (teachers of dept) | – | – |
| Departments, programmes | – | F | V | F | V | – | – |
| Rooms | – | F | V | F | D (rooms owned by dept) | – | – |
| Subjects, offerings, sections, batch sets | – | F | V | F | D | – | – |
| Elective groups | – | F | V | F | V | – | – |
| Teaching assignments | – | F | V | F | D | V (own) | – |
| Teacher availability and preferences | – | F | V | F | D | O | – |
| Rules, soft-preference weights, locks, requirement overrides | – | F | V | F | V (requests P2) | – | – |
| Import data (CSV) | – | F | – | F | D | – | – |
| Run generation | – | F | – | F | – | – | – |
| View generation runs and results | – | V | V | V | – | – | – |
| View draft, versions and validation | – | V | V | V | D | – | – |
| Edit draft timetable | – | F | – | F | – (comment at P2, U5) | – | – |
| Save versions, submit for approval | – | F | – | F | – | – | – |
| Return, publish, undo publish within the window | – | F | F | – | – | – | – |
| Dated exceptions (cancel, room change, substitute, move) | – | F | V | F | R | R (own classes) | – |
| View published timetable | – | all | all | all | all | own, plus section and room views if the college allows | own section |
| Reports (clash audit, load, room use) | platform totals only | F | F | F | D | – | – |
| Export (CSV, print/PDF) | – | F | F | F | D | O | own section |
| Audit log | platform events | V | V | – | – | – | – |
| Section share links (only if N1 chooses links) | – | F | – | F | – | – | – |
| Personal notification preferences | P2 | P2 | P2 | P2 | P2 | P2 | P2 |

Rules: a record outside the caller's college returns **404**, never 403 (no existence leak). Department-scoped roles act only on records linked to their departments. Changing a user's roles takes effect on the next request.

### 2.4 Accounts, invitations and membership (F-ACC)

| Id | Requirement | Release |
| --- | --- | --- |
| ACC-1 | PA creates a college record and invites its first CA. Self-service college registration with document verification is P2 (N4). | MVP |
| ACC-2 | CA invites users by email or mobile number with roles and scope (invitation requests by TC and HOD for CA approval are P2). An invitation is single-use, expires in 7 days, and is stored hashed. | MVP |
| ACC-3 | Delivery: the invite link is shown once to the inviter to share by any channel (copy, QR). Email or SMS delivery is added when a provider is approved (Ext1, Ext2). | MVP |
| ACC-4 | Accepting an invite sets a password (or links an existing account) and creates the membership. Inviting an existing user adds a membership; no second account. | MVP |
| ACC-5 | CA can change roles and scope, suspend a membership (immediate effect), and remove it. The last CA of a college cannot be removed. | MVP |
| ACC-6 | Teacher records can exist without a user account; linking happens when the teacher accepts an invite. | MVP |
| ACC-7 | Multi-college users switch the active college; a teacher can see a merged personal week across colleges (P2). | P2 |

---

## 3. Academic model

Definitions used everywhere. Data structures are in `DATABASE_DESIGN.md`.

| Concept | Definition | Rules |
| --- | --- | --- |
| Academic year | A named year (e.g. 2026–27) with start and end dates | One current year per college |
| Term (semester) | A teaching period inside a year (odd, even, annual, or custom) with dates | Timetables belong to a term. Closing a term makes its timetables read-only |
| Department | Organisational unit owning programmes, teachers, rooms | |
| Programme | A course of study (e.g. B.Tech CSE, B.Sc. Non-Medical, Diploma Civil) in a department, with a number of semesters or years | |
| Subject | Catalogue item: code, name (English, optional Punjabi), kind (theory, lab, tutorial, project, other) | Code unique per college |
| Course offering | A subject offered in a term to a programme semester, with weekly hours by component: Lecture, Tutorial, Practical (L-T-P) | Each component's weekly periods must be a multiple of its session length |
| Section | A cohort of students of one programme semester (e.g. CSE 3A) with a strength | |
| Batch set and batch | A **batch set** partitions a section into disjoint **batches** (e.g. Lab batches A1, A2). Batch strengths sum to the section strength | A section may have several batch sets (e.g. lab batches and tutorial batches); batches of different sets may share students |
| Elective group | A set of options (offerings) taken at the same time by students of one or more sections; each student takes exactly one option | Enrolment counts per option and section are required before generation (source **OPEN**, D8) |
| Combined class | One session attended by several sections (or batches of several sections) together, e.g. a common lecture in a hall | Room capacity must fit the combined strength |
| Teaching assignment | Who teaches which component of an offering to which audience, and how many sessions a week | One or more teachers (co-teaching); split teaching uses two assignments |
| Session requirement | The schedulable unit derived from assignments: audience, teacher(s), sessions per week, session length (span), room type and features, optional fixed room, optional parallel group | Generated from assignments; editable by TC |
| Room | A space with type (lecture, lab, seminar hall, workshop, tutorial, other), capacity, features (projector, number of computers, etc.), building, accessibility flag | Owned by one department **or** shared by listed departments or all, never both |
| Time grid | Days, numbered periods with times, breaks, and per-day period counts (e.g. Saturday half day) | One grid per college at MVP (D6, Q5); locked once a draft exists |
| Holiday, event | Dated full-day closure (MVP) or partial-day event (P2) | Adding one after publishing lists the affected classes |
| Teacher availability | Per period: available, cannot teach (hard), avoid (soft), prefer (soft) | Read-only for teachers after the coordinator's collection deadline |

**Audience** of a session is the set of student groups it serves: whole section(s), batch(es), or an elective option. Clash rules in section 6.1 are defined on audiences.

---

## 4. Timetable lifecycle

### 4.1 States

```
                 submit              publish (PR or CA)
  Draft  ──────────────▶ Submitted ──────────────────▶ Published ──▶ Superseded
    ▲                       │ return with comment          │ (when a newer
    └───────────────────────┘                              │  version publishes)
                                                     undo within 15 min
                                                     restores previous published
```

- **One working draft per college and term**, edited in place by TC/CA (D22).
- **Versions** are immutable snapshots of the draft, created on explicit "Save version" (status Saved) and on submit (status Submitted). Publishing changes the status of a submitted version; it does not create a new one. Each version records who, when, a note, the validation report and the generation run (if any).
- Version statuses: Saved, Submitted, Returned (sent back with a comment), Published, Superseded (a newer version was published), Withdrawn (publish undone, or replaced by a newer submission). At most one version per term is Submitted at a time: submitting again withdraws the earlier submission.
- **One published version per college and term.** Publishing supersedes the previous one.
- **Undo publish** within 15 minutes restores the previous published version. Publish notifications are held until the undo window closes (urgent exception alerts are not held).
- **Version history**: list, view, compare two versions (MVP: list and view; compare is P2), restore a version into the draft (never deletes later versions).
- A HOD review step (Draft → In HOD review → Changes requested / Approved) is P2 (U5).

### 4.2 Validation and publishing rules

- The draft is validated on every edit; the full report (clashes, rule breaks, missing sessions, soft score) is always visible.
- An edit is refused if it adds any hard violation. A draft can still become invalid when master data changes underneath it (for example, a teacher marks a period "cannot teach"); it is then flagged at once, edits that repair it are allowed, and submit and publish stay blocked until it is valid.
- Before saving a master-data change that would invalidate the **published** timetable, the user sees the affected classes and must confirm; the published version itself never changes (dated exceptions handle the consequences).
- **Submit** requires zero hard-constraint violations.
- **Publish** requires zero hard-constraint violations, re-checked on the server inside the publish transaction. If sessions are missing, the publisher must acknowledge the listed missing sessions; the acknowledgement is recorded in the version and the audit log (**OPEN**, N2: allow with acknowledgement, or block).
- The grid (periods, breaks) cannot change while a draft exists; changing it requires discarding or regenerating, with a warning.

### 4.3 Dated exceptions (day-to-day changes)

| Id | Exception | Release |
| --- | --- | --- |
| EXC-1 | Cancel a class on a date | MVP |
| EXC-2 | Change the room for a date | MVP |
| EXC-3 | Substitute teacher for a date (with suggestions of free, eligible teachers) | MVP |
| EXC-4 | Move a class to another free slot on a date | MVP |
| EXC-5 | Extra class on a date | P2 |
| EXC-6 | Leave requests that create substitutions | P2 |

Rules: an exception overlays the published timetable for one date and never edits the base timetable. It is keyed by (audience, date, period, offering) with the entry id as a hint, so it can be matched against a newer version (D10). An exception must itself be clash-free on that date against the published timetable and other exceptions. When a new version is published, existing future exceptions are listed for the coordinator to keep or drop; never silently moved or deleted. Holidays suppress classes on their dates.

### 4.4 Audit events

Every security-relevant or timetable-changing action writes an append-only audit event: sign-in success and failure, invitation sent and accepted, role changes, membership suspension, master-data imports, generation runs, draft edits (summarised per save), submit, publish, unpublish, version restore, exceptions, exports of personal data, support access. Fields: who, college, action, target, time, request id, before/after summary. Audit events are retained per S6 (**OPEN**).

---

## 5. Features by area

### 5.1 Setup and master data (F-SET)

| Id | Requirement | Release |
| --- | --- | --- |
| SET-1 | Guided setup checklist on the CA/TC home: calendar, grid, departments, rooms, teachers, subjects, sections and batches, offerings and assignments, availability, rules. Each item shows done/needs attention and links to the fix | MVP |
| SET-2 | List and form screens for every master-data entity, with inline validation and plain-language errors | MVP |
| SET-3 | Start from the sample college or a blank college | MVP |
| SET-4 | Copy forward from the previous term (choose what to copy, review differences) | P2 |
| SET-5 | University or board templates for grids and subjects | P2 |

### 5.2 Import and export (F-IO)

| Id | Requirement | Release |
| --- | --- | --- |
| IO-1 | CSV import for teachers, rooms, subjects, sections and batches, offerings and assignments, availability, elective enrolment counts (per D8), and (if N1 needs it) students. Template download per kind | MVP |
| IO-2 | Preview grid with per-cell errors in plain language; nothing saved until confirmed; all-or-nothing confirm; re-import updates by natural key (codes, employee ids) | MVP |
| IO-3 | Limits: 5 MB and 5,000 rows per file; UTF-8 (Gurmukhi preserved) | MVP |
| IO-4 | Excel (.xlsx) import (**OPEN**, N9: needs a parsing package) | P2 or MVP per N9 |
| IO-5 | CSV export of master data and of timetable views (section, teacher, room, department); cells starting with `= + - @` are escaped | MVP |
| IO-6 | Printable timetable pages for section, teacher, room, department; "Save as PDF" through the browser's print dialog (renders Gurmukhi with the page's fonts; no server dependency) | MVP |
| IO-7 | Server-generated PDF files and bulk PDF export (engine **OPEN**, D23: must be proven to shape Gurmukhi) | P2 |
| IO-8 | Importing timetables from PDF files is **not** planned: PDF layouts cannot be parsed reliably (confirm, N10) | – |
| IO-9 | Calendar feed (iCal) for teachers and sections | P2 |

### 5.3 Rules (F-RUL)

| Id | Requirement | Release |
| --- | --- | --- |
| RUL-1 | Hard constraints are fixed by the product and cannot be switched off (section 6.1) | MVP |
| RUL-2 | Soft preferences with weights Off, Low, Medium, High and three presets (Balanced, Compact days, Student-friendly) (section 6.2) | MVP |
| RUL-3 | Locks: pin a class to a slot and room; a lock can never create a clash | MVP |
| RUL-4 | Never/only rules (e.g. "Dr Kaur never in period 1", "Physics lab only on Tue/Thu"), validated for contradictions | MVP (never/only), P2 (prefer/avoid per entity) |
| RUL-5 | Natural-language rule entry | Later |

### 5.4 Generation (F-GEN)

| Id | Requirement | Release |
| --- | --- | --- |
| GEN-1 | Pre-check before generating: capacity versus demand per teacher (with daily limits and lab blocks), per room type, per audience; missing assignments; empty availability; impossible requirements. Errors block, warnings do not; each links to the fix | MVP |
| GEN-2 | One-click generation for the whole college; runs in the background with progress, best result so far, cancel, and "safe to leave this page" | MVP |
| GEN-3 | Result shows validity, completeness, soft score, unplaced sessions with reasons, and views by section, teacher, room, department | MVP |
| GEN-4 | Applying a result to the draft is an explicit action; locked classes are kept | MVP |
| GEN-5 | Reproducible: input snapshot, seed and settings stored with each run | MVP |
| GEN-6 | Partial regeneration (selected departments, sections or days), keeping everything else fixed | P2 |
| GEN-7 | Several alternatives with side-by-side comparison | P2 |

### 5.5 Editing (F-EDT)

| Id | Requirement | Release |
| --- | --- | --- |
| EDT-1 | Grid editor for TC/CA: select a class, see valid targets (green) and invalid ones (red, with the reason), move, swap, change room, lock/unlock; labs move as one block | MVP |
| EDT-2 | Keyboard alternative for every pointer action; drag and drop is optional | MVP |
| EDT-3 | Undo and redo within the editing session | MVP |
| EDT-4 | Concurrent editing: every save carries the draft revision it was based on; a stale save is refused with "someone else changed this timetable" and the latest state; nothing is silently overwritten | MVP |
| EDT-5 | Editor is review-only on phones (U6, proposed) | MVP |
| EDT-6 | In-grid comments | P2 |

### 5.6 Views (F-VIEW)

| Id | Requirement | Release |
| --- | --- | --- |
| VIEW-1 | Week grids by section, batch, teacher, room, department; day view on phones | MVP |
| VIEW-2 | Teacher home: next class, today, week, load, availability, change notices | MVP |
| VIEW-3 | Student Today and Week for one section (and batch/elective option), with change badges | MVP |
| VIEW-4 | Offline: Today and Week cached on the device with "last updated" age; banner after 7 days stale | MVP |
| VIEW-5 | Free room and free teacher finder for a period | P2 |
| VIEW-6 | Share link or QR per section (see N1) | MVP if N1 chooses links |

### 5.7 Notifications (F-NOT)

| Id | Requirement | Release |
| --- | --- | --- |
| NOT-1 | In-app notifications and change badges: timetable published, class cancelled, room changed, substitute assigned, class moved, generation finished, import finished | MVP |
| NOT-2 | Email for routine events and SMS for urgent same-day changes, through providers once approved (Ext1, Ext2); templates in English and Punjabi | MVP if providers are approved in time; otherwise P2 |
| NOT-3 | Messages name the exact change ("CS301, Tue 10:40, moved to Room 12") and go only to affected people | MVP |
| NOT-4 | Per-event preferences, quiet hours, push, WhatsApp | P2 |

### 5.8 Reports (F-REP)

| Id | Requirement | Release |
| --- | --- | --- |
| REP-1 | Clash audit of any version (should always be empty for published versions) | MVP |
| REP-2 | Teacher load: periods per day and week, gaps, against limits | MVP |
| REP-3 | Room utilisation by room and by department, including shared rooms | MVP |
| REP-4 | Student experience: gaps, long days, early/late classes per section | P2 |

### 5.9 Settings, help and errors (F-GEN-UI)

- Profile, language (English, ਪੰਜਾਬੀ), password change, sign out everywhere (MVP).
- College settings: name in both languages, logo, grid, calendar, default soft-preference preset (MVP).
- Help: short in-app guidance per screen and a "report a problem" form that records the page and a reference id (MVP).
- Errors follow "what happened, why, what to do"; a calm 403 page names the role needed and who can grant it (MVP).

---

## 6. Scheduling rules

Full definitions, including formal clash predicates, are in `SCHEDULING_ENGINE.md`.

### 6.1 Hard constraints (immutable; no edit, generation or exception may break them; submitted and published versions satisfy all of them)

| Id | Constraint |
| --- | --- |
| H1 | A teacher is in at most one session at a time (co-taught sessions occupy every listed teacher) |
| H2 | A room holds at most one session at a time |
| H3 | Two sessions at the same time must have disjoint audiences (student clash rule, section 6.3) |
| H4 | A teacher is never placed in a period marked "cannot teach" |
| H5 | Room type, capacity (audience strength, summed for combined classes) and required features fit |
| H6 | A session lies inside its day's periods and does not cross a break; a multi-period session is one contiguous block of exactly its span |
| H7 | A teacher's daily and weekly period limits are respected |
| H8 | No requirement has more sessions than it needs per week, nor more per day than its optional daily cap (set by the coordinator, e.g. "at most one Maths lecture a day"); each entry matches its requirement (teachers, audience, offering, span) |
| H9 | Locked classes are not moved by generation or by other edits |
| H10 | Never/only rules marked hard are respected |
| H11 | Sessions in a required parallel group start at the same time (e.g. batch labs that must run together) |
| H12 | Dated exceptions do not place classes on holidays and are clash-free on their date |
| H13 | A teacher shared by several colleges is not double-booked across them (P2, needs consent; D13) |

Completeness (every required session placed) is reported separately: a draft may be incomplete; publishing an incomplete timetable follows N2.

### 6.2 Soft preferences (configurable weights)

| Id | Preference | Default (Balanced preset) |
| --- | --- | --- |
| SP1 | Spread each subject across the week (avoid repeats on a day where no hard daily cap is set) | High |
| SP2 | Few gaps in a section's day | Medium |
| SP3 | Balanced daily load for teachers | Medium |
| SP4 | Maximum consecutive teaching periods for a teacher (value set by college) | Medium |
| SP5 | Avoid first and last periods | Low |
| SP6 | Labs in the afternoon | Low |
| SP7 | Respect teachers' "avoid" and "prefer" periods | Medium |
| SP8 | Same room for a section's lectures where possible | Low |
| SP9 | Few building changes for teachers and sections between consecutive periods | Low |
| SP10 | Stability: when regenerating or repairing, keep existing placements where possible | High during edits |

### 6.3 When simultaneous sessions for the same students are valid

Two sessions at the same time are valid for students **only** if their audiences cannot share a student:

| Case | Valid at the same time? |
| --- | --- |
| Whole section and anything else for that section (batch, elective, another whole-section class) | **No** |
| Two batches of the **same batch set** of a section (e.g. A1 lab and A2 lab) | **Yes**, with different teachers and rooms |
| Batches of **different batch sets** of the same section (e.g. lab batch A1 and tutorial batch T2) | **No** (their students may overlap) |
| Two options of the **same elective group** | **Yes** (each student takes one option), with different teachers and rooms |
| An elective option and any non-elective session of a participating section | **No** |
| Options of **different elective groups** with overlapping participating sections | **No** |
| A combined class (sections S1 and S2 together) and any session of S1 or S2 | **No** |
| Sessions of different sections with no shared batches or elective groups | **Yes** |

Teachers and rooms are checked independently (H1, H2) in every case.

---

## 7. Language

- English and Punjabi (Gurmukhi) at MVP; Hindi at P2, hidden until reviewed.
- Every user-facing string comes from message catalogues from the first screen built on the new stack; no hard-coded text in components.
- Names of people, subjects and rooms are stored as entered; optional Punjabi display names for subjects, rooms, departments and the college. No automatic transliteration.
- Dates and times formatted per locale; time zone Asia/Kolkata with no daylight saving (assumption, D9 **OPEN**); 12-hour time (U2 proposed); Western digits (U3 proposed).
- Notification templates exist in both languages; a missing translation falls back to English and is logged.
- Punjabi copy is reviewed by a Punjabi speaker before release (U9 **OPEN**: who).

---

## 8. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Correctness | No edit, generation result or exception can introduce a hard-constraint violation; submitted and published versions have zero violations when created; master-data changes that invalidate a draft are flagged in the same transaction and block submit and publish until fixed. All enforced on the server (`SCHEDULING_ENGINE.md`, `DATABASE_DESIGN.md` section 6) |
| Isolation | No request can read or change another college's data; verified by automated two-college tests on every endpoint |
| Performance: student/teacher pages | At most 150 KB transferred on first load and interactive within 3 s on a 3G profile; repeat visits load from cache |
| Performance: API | Targets to verify by load test (T5 **OPEN**); proposed p95 under 300 ms for timetable views |
| Performance: generation | Proposed: a 20-section, 40-teacher, 30-room college completes within the selected time limit (2, 5 or 10 minutes) and returns its best valid result; to verify |
| Unreliable networks | Mutating requests are idempotent and safe to retry; forms keep unsaved input across a dropped connection; read views work offline from cache |
| Accessibility | WCAG 2.1 AA (`UI_UX_GUIDELINES.md` section 11); keyboard alternative for every grid action |
| Devices | Mid-range Android phones (Chrome) and desktop browsers; exact list T6 **OPEN** |
| Data residency | College data stored in India: MongoDB Atlas, Mumbai region (M8). Processing location of the API and worker **OPEN** (D4) |
| Privacy | Minimal personal data; students stored only if N1 requires it; mobile numbers and emails masked where not needed; legal review before the first real college (S11) |
| Backups | Daily backups with point-in-time recovery if the plan supports it; a tested restore before launch; retention S7 **OPEN** |
| Observability | Structured logs without personal data, request ids, health and readiness endpoints, job and error metrics; error-tracking provider **OPEN** (N11) |

---

## 9. Acceptance criteria (MVP)

Each criterion becomes at least one automated test (unit, integration or end-to-end) unless marked manual. Ids are referenced by `IMPLEMENTATION_ROADMAP.md`.

### Tenancy and access

- **AC-T1** Given two colleges A and B, when any endpoint is called by a member of A with an id that belongs to B, then the response is 404 and no B data is returned or changed.
- **AC-T2** Given a request with no valid session, when it calls any non-public endpoint, then it gets 401.
- **AC-T3** Given every route, when the authorization test suite runs, then each route has a declared policy and every role in the matrix gets the expected allow or deny.
- **AC-T4** Given a CA removes a user's TC role, when that user's next request arrives, then TC actions are refused.

### Accounts

- **AC-A1** Given an invitation, when it is used once, then a second use fails; when it is 7 days old, then it fails with "expired".
- **AC-A2** Given five failed sign-ins for one account, then further attempts are refused for 15 minutes with the same message as a wrong password.
- **AC-A3** Given a refresh token that was already rotated, when it is used again, then the whole session family is revoked.
- **AC-A4** Given a password reset, when it completes, then all other sessions of that user are ended (within the 60-second revocation cache, `SECURITY_MODEL.md` 2.4).

### Data and import

- **AC-D1** Given a CSV with errors, when it is uploaded, then the preview lists each error by row and column in plain language and nothing is saved.
- **AC-D2** Given a valid CSV, when confirmed, then all rows are saved in one transaction; re-importing the same file changes nothing.
- **AC-D3** Given a CSV with Gurmukhi names, when imported and exported, then the text is unchanged.
- **AC-D4** Given batch strengths that do not sum to the section strength, then saving the batch set is refused with the difference shown.

### Scheduling

- **AC-S1** Given the sample college, when generation runs, then the result has zero hard violations and is complete.
- **AC-S2** Given any generated or edited timetable, when the validator runs, then its verdict equals a brute-force reference checker on the same input (property test over random timetables).
- **AC-S3** Given batches A1 and A2 of the same batch set, when they are placed at the same time with different teachers and rooms, then the timetable is valid; given A1 and a whole-section class of the same section at the same time, then it is invalid with a student clash.
- **AC-S4** Given two options of one elective group at the same time, then valid; given an option and a non-elective class of a participating section, then invalid.
- **AC-S5** Given an over-constrained input, when generation runs, then unplaced sessions are listed, each with at least one plain-language reason, and nothing placed breaks a hard constraint.
- **AC-S6** Given the same input snapshot, seed and step budget, when generation runs twice, then the results are identical (the wall-clock limit is only a safety stop; `SCHEDULING_ENGINE.md` 7.2).
- **AC-S7** Given a running generation, when it is cancelled or the worker is killed, then the draft is unchanged and the run is marked cancelled or failed.

### Editing and publishing

- **AC-E1** Given a move that would break any hard constraint, when submitted, then it is refused with the reason and the draft revision is unchanged.
- **AC-E2** Given two editors who loaded revision 7, when both save, then exactly one save succeeds and the other gets a version-conflict response with the latest revision.
- **AC-E3** Given concurrent edits that would together double-book a teacher (each valid alone), when both are submitted at the same moment, then at most one is committed.
- **AC-E4** Given a draft with a hard violation, when publish is attempted, then it is refused; given a valid draft, then exactly one published version exists for the term afterwards.
- **AC-E5** Given a publish, when undone within 15 minutes, then the previous version is published again and held notifications are not sent.
- **AC-E6** Given a published timetable, when a dated substitution would double-book the substitute on that date, then it is refused.

### Experience

- **AC-X1** (manual + automated axe) Every MVP screen passes axe with no serious violations and a keyboard-only walkthrough of journeys J1 to J6.
- **AC-X2** Every MVP screen renders correctly in Punjabi with no untranslated strings (catalogue coverage test) and no clipped text at 320 px width.
- **AC-X3** The student Today page is at most 150 KB on first load and shows the cached timetable with its age when offline.
- **AC-X4** Given a dropped connection during a save, when the request is retried with the same idempotency key, then the change is applied once.

### End-to-end journeys

| Id | Journey |
| --- | --- |
| J1 | PA creates a college and invites its CA; CA accepts and signs in |
| J2 | TC imports teachers, rooms, subjects, sections and assignments from CSV with errors, fixes them, confirms |
| J3 | TC runs the pre-check, generates, reviews unplaced sessions, applies the result, edits a class (one refused, one accepted), submits |
| J4 | PR publishes; a teacher and a student see the new timetable; PR undoes within the window; nobody is notified |
| J5 | TC records a substitution for tomorrow; the affected section and both teachers see it |
| J6 | A teacher marks availability on a phone in Punjabi; the coordinator sees it in the pre-check |

---

## 10. Production-readiness requirements

The system is **not production-ready** until every item below is verified and recorded in `DECISIONS.md`. No document or screen may claim otherwise before that.

1. All MVP acceptance criteria pass in CI; no skipped tests.
2. Two-college isolation suite and authorization matrix suite pass.
3. Dependency scan shows no high or critical findings; secrets scan clean.
4. Accessibility: axe clean and a manual screen-reader pass (NVDA desktop, TalkBack Android) of J3 and the student view.
5. Performance budgets met on a 3G profile; load test at the agreed targets (T5).
6. Backup restore drill completed and timed; recovery targets agreed (S7).
7. Monitoring and alerting live for errors, job failures and notification delivery.
8. Punjabi copy reviewed (U9).
9. Legal review of personal data, consent text, retention and breach process (S11).
10. Independent penetration test with findings closed (S12).
11. Runbook: support contacts, incident response, college onboarding, account recovery (N16), security contact (S13), offboarding (S15).
12. Pilot with one college on a staging environment before production data.

---

## 11. Out of scope for MVP

Exam timetables and invigilation, attendance, leave balances (D14), room booking requests and maintenance blocks, cross-college teacher matching (D13), state-level analytics, public API (D18), native mobile apps, AI assistant, multi-campus travel time, shifts with different grids.

---

## 12. Decisions

### 12.1 Open decisions needing owner approval

Ids from earlier documents are kept. "Blocks" names the roadmap phase (`IMPLEMENTATION_ROADMAP.md`) that cannot finish without the answer.

| Id | Decision | Proposal (not decided) | Blocks |
| --- | --- | --- | --- |
| N1 | Student access model | Per-section share link or QR (no login, revocable) as the main route; optional student accounts later. Avoids storing a student roster at MVP | Phase 9 |
| N2 | Publishing with missing sessions | Allow, with an explicit acknowledgement listing them, recorded in the version and audit log | Phase 8 |
| N3 | Launch scope for batches, electives, combined classes | Model and validator support all three from Phase 3; generator support for batches and combined classes at MVP, elective groups at MVP if the pilot college needs them | Phase 3 |
| N4 | College onboarding | PA creates colleges and invites the first CA at MVP; self-registration with documents at P2 (then D15 applies) | Phase 5 |
| N5 | Google sign-in | Defer to P2 | – |
| N6 | API documentation method | OpenAPI 3.1 document generated from the shared Zod schemas (needs a generator package) | Phase 4 |
| N7 | Test tooling packages | HTTP integration test client, in-memory MongoDB replica set for tests, browser end-to-end runner with accessibility scanning | Phase 2 |
| N8 | Internationalisation library | A small, well-maintained Next.js-compatible message library, or a minimal in-house loader | Phase 6 |
| N9 | Excel import at MVP | CSV only at MVP (no package); Excel at P2 | Phase 6 |
| N10 | PDF import | Not supported (confirm) | – |
| N11 | Error tracking and monitoring provider | None chosen; structured logs and health checks first | Phase 10 |
| N12 | Local development and CI database | Local MongoDB replica set or a separate Atlas development project; never production | Phase 2 |
| N13 | Production hosting of web, API and worker | Data stays in Atlas Mumbai (M8). The API and worker process personal data, so their region matters (D4). Vercel is decided only for the demo link (M9) | Phase 10 |
| N14 | Same-site domain for web and API | Serve web and API under one registrable domain so the refresh cookie can be SameSite=Strict (S9) | Phase 5 |
| N15 | Editing lock policy | Optimistic concurrency only (revision checks) at MVP, with a "who else is editing" indicator; no exclusive lock | Phase 8 |
| N16 | Account recovery for a college's last administrator | PA-assisted recovery after an out-of-band identity check by the college; process and owner to define | Phase 5 |
| N17 | UI component library | Keep the prototype's own components (no new packages); shadcn/ui and Storybook from UI_UX_GUIDELINES need approval | Phase 6 |
| D4 | Hosting platform and region for API, worker, web | See N13 | Phase 10 |
| D8 | Source of elective enrolments | CSV import of counts per option and section | Phase 7 |
| D9 | Time zone and holiday source | Asia/Kolkata, holidays entered or imported by CA | Phase 3 |
| D11 | Solver worker size, time and memory caps, per-college concurrency | Measure in Phase 7; one run per college at a time | Phase 7 |
| D12 | Job progress delivery | Polling | Phase 7 |
| D13 | Cross-college teacher matching | P2 | – |
| D14, D16, D18 | Leave balances; cross-script name search; public API | Out of MVP scope; decide when planned | – |
| D15 | File storage and malware scanning | Not needed at MVP if uploads are parsed in memory and not stored (proposal) | Phase 6 |
| D17, S6, S7 | Retention of audit logs, backups; recovery targets | To define with legal review | Phase 10 |
| D19 | Rate-limit values | Proposed defaults in `SECURITY_MODEL.md`, to confirm | Phase 5 |
| D23 | Server-side PDF engine | Browser print at MVP; engine chosen after a Gurmukhi spike | P2 |
| S1 | Access-token lifetime | 15 minutes | Phase 5 |
| S5 | Platform support access: read-only or read-write | Read-only, time-bound, approved by the college's CA | P2 |
| S4 | Two-step sign-in for platform administrators at MVP | Yes, with an authenticator app (no SMS provider needed) | Phase 5 |
| S9 | Domain: web and API on one registrable domain | See N14 | Phase 5 |
| S10 | Password hashing parameters and common-password list | Argon2id with library-recommended parameters; bundled common-password list | Phase 5 |
| S11 to S15 | Legal review, penetration test, security contact, audit copies, offboarding | Before the first real college | Phase 11 |
| U1 | Product name, logo, accent colour | Neutral placeholder | – |
| U2, U3, U4 | Time format, digits, font | 12-hour, Western digits, Noto Sans + Noto Sans Gurmukhi (self-hosted subsets) | Phase 6 |
| U5 | HOD comment-only or edit | Comment-only (P2) | – |
| U6, U7 | Editor on phones; dark theme | Review-only on phones; dark theme P2 | Phase 8 (U6) |
| U9 | Punjabi copy reviewer | Owner to name | Phase 11 |
| T5, T6 | Load targets; browser and device list | To agree before Phase 10 | Phase 10 |
| Ext1, Ext2 | SMS and email providers (SMS needs India DLT registration, which takes time) | Not chosen; channels stay disabled until approved | NOT-2 |

### 12.2 Decisions carried from earlier documents

| Id | Earlier decision | Status now |
| --- | --- | --- |
| D1 | JWT issued by FastAPI | Superseded by M1: issued by the Express API |
| D2, C1 | PostgreSQL row-level security plus API checks | Superseded by M1, M7: tenant-scoped data layer plus API checks |
| D3, C2 | Redis + RQ; PostgreSQL job table | Superseded by M6: MongoDB-backed job queue |
| C3 | Section exclusion constraint | Superseded: see `DATABASE_DESIGN.md` section 6 |
| D5 | WhatsApp at P2; MVP channels in-app, SMS, email | Kept (SMS and email need Ext1, Ext2) |
| D6, Q5 | One grid per college at MVP | Kept |
| D7 | Minimal student roster | Pending N1 |
| D10 | Exceptions listed for review on a new publish | Kept |
| D20 | College id in the URL path | Kept |
| D22 | One working draft; versions on submit, publish, "Save version" | Kept |
| D24 | Browser calls the API directly, exact-origin CORS | Kept, subject to N14 |
| Tokens | Access token in memory; refresh token in an HttpOnly cookie, rotated | Kept |
| Region | Database in an Indian region | Kept: Atlas Mumbai (M8) |
| Languages | English and Punjabi at MVP; Hindi P2 | Kept |
| Alerts | SMS only for urgent changes | Kept |
| Offline | Cached Today and Week for students and teachers | Kept |
| Q3, Q6 | Whole-section classes only; one teacher per class | Superseded by this document: batches, electives, combined classes and co-teaching are modelled (launch scope N3) |
| Q4 | Unplaced sessions allowed, never a clash | Kept |
| S2 | OTP attempt caps and send budgets | Not applicable at MVP (no OTP sign-in); revisit if SMS sign-in or self-service reset by SMS is added (Ext1) |
| Q8, D21 | Sample college as a separate tenant flagged `isSample` | Kept |
| P1 to P8 | Frontend-only prototype rules | P1 applies until Phase 2 begins (M3); P2 and P5 superseded by M4; P8 superseded by M1 |
| M1 to M11 | MERN direction and this document set (2026-10-26) | Decided; see `DECISIONS.md` |
