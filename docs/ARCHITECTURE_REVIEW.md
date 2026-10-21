# ARCHITECTURE_REVIEW.md

Pre-implementation review of the plan (CLAUDE.md, PROJECT_SPEC, TECHNICAL_PLAN, UI_UX_GUIDELINES, IMPLEMENTATION_PLAN). Date: 2026-10-21. Nothing is changed in those documents yet; each item says what to change once you decide.

Basis and limits: reviewed against the five written documents and the earlier planning docs as summarised; I did not re-read every earlier doc line by line. Provider facts (regions, features) must be verified before relying on them.

Severity: **B** blocker (resolve before the phase named), **H** high, **M** medium.

---

## 1. Design flaws in the data model and rules

| # | Sev | Issue | Fix |
| --- | --- | --- | --- |
| 1.1 | B (Phase 1) | **Batches and parallel classes are undefined.** A section is split into lab batches, or into optional-subject groups, running at the same time with different teachers and rooms. The section-clash trigger, as written, would reject this, or (if loosened) allow real clashes. Electives and combined classes are P2, yet batches are in the MVP schema. | Define the rule: an entry belongs to a section, a batch, or an elective group; two entries clash for a section unless they target disjoint batches or the same elective group. Write it as a testable predicate shared by the trigger, the checker, and the solver. |
| 1.2 | B (Phase 1) | **Exclusion constraints ignore the grid.** `slot` is a period number; with several grids (D6) the same number means different times, and a teacher can sit in two grids. | Either one grid per college for MVP (enforced by constraint, grid id dropped from entries) or store real time ranges and constrain on those. Recommend the first. |
| 1.3 | H | **Constraints versus editing.** Swaps pass through a clashing state. Exclusion constraints are checked per statement unless declared deferrable. | Make teacher and room constraints `DEFERRABLE INITIALLY DEFERRED`; do swaps as one transaction; test it. Note deferrable exclusion constraints cannot be used with `ON CONFLICT`. |
| 1.4 | H | **Grid changes after generation.** Changing periods or breaks after a timetable exists silently shifts or breaks entries. | Lock the grid once a draft exists; changing it requires discarding or regenerating with a warning. |
| 1.5 | H | **Exceptions keyed to entries.** D10 exceptions refer to a published version's entries; a new publish changes ids. | Key an exception by (section or batch, date, period, subject) plus the entry id as a hint; the review screen matches on the first. |
| 1.6 | H | **Co-teaching and split teaching.** Two teachers on one class, or two teachers sharing a subject's weekly hours across the semester, are common and not modelled (one `teacher_id` per entry). | Decide whether MVP supports them. Cheapest: split hours across two assignments (already possible); add an `entry_teachers` table only if co-teaching is required. |
| 1.7 | M | **Version model complexity.** D22 (draft in place, versions on submit/publish) plus per-session server undo and optimistic locking is more than needed. | Client-side undo of validated operations; server keeps the draft and snapshots; document who can edit the draft concurrently (recommend one editor lock per scope with takeover). |
| 1.8 | M | **Unplaced sessions.** If the solver cannot place everything, MVP gives only the pre-check list (explanation is P2); real input is often over-constrained. Users will stall. | Allow a result with an explicit "unplaced sessions" list (never a clash), editable by hand. |
| 1.9 | M | **Roster data reality.** Roll numbers, shared parent mobiles, no email for many teachers. Several students may share one mobile. | Allow mobile-only teachers; students match on (college, roll number, mobile) with a shared-mobile rule; never reveal which field was wrong. |
| 1.10 | M | **Missing fields and tables** (see section 5). | Add before Phase 1. |

## 2. Conflicts between documents and decisions

| # | Sev | Conflict | Fix |
| --- | --- | --- | --- |
| 2.1 | H | Spec lists Google sign-in as MVP; the cut list below recommends removing it; plan has no phase for it beyond Phase 2 mention. | Decide; if kept, add acceptance criteria. |
| 2.2 | H | HOD is "limited" at MVP, but the permissions matrix shows HOD editing the draft under setting U5. | At MVP HOD has no timetable editing; update the matrix. |
| 2.3 | H | Publish has a 15-minute undo, but "published" notifications go out at once. Undo then retracts a timetable people already saw. | Hold publish notifications for the 15-minute window (or until the undo window closes), say so on the confirmation page. |
| 2.4 | M | CLAUDE.md requires Zod; the stack list does not name it. | Add Zod and a form library to the stack. |
| 2.5 | M | Roster import is MVP, but student sign-in depends on a roster that colleges may not have at first publish. | See 4.1. |
| 2.6 | M | 150 KB student budget versus the Punjabi font (a Gurmukhi subset can be tens of KB), a service worker, and a framework. | Decide whether fonts count; consider a system-font fallback with the font loaded later, and a plain static student shell. Confirm in the Phase 0 spike before promising the number. |
| 2.7 | M | Spec says SMS only for urgent changes, but student sign-in also uses SMS OTP; the SMS bill and DLT scope are larger than "urgent only" suggests. | Estimate cost per college per month (see 4.2). |
| 2.8 | M | Phase 3 requires seeded university and board templates; nobody owns collecting that data. | Assign: owner provides grids for a first list (for example, the main Punjab universities and the state technical board); otherwise ship with generic templates. |

## 3. Unnecessary complexity (recommended cuts or deferrals)

The MVP currently spans ten roles, about 50 tables, row-level security with composite foreign keys, a queue and workers, two-step sign-in, offline support, SMS with registration, PDF in two scripts, and a drag-and-drop editor. For a small team and an unknown deadline, defer or simplify:

1. **Google sign-in:** defer. One invite plus password and OTP path is enough.
2. **HOD role at MVP:** defer to P2; the coordinator enters assignments. Cuts one role, one set of screens, one set of permission tests.
3. **Templates per university:** ship a single generic template at MVP.
4. **Sample college:** keep as a seed script and a flag, not a separate product feature.
5. **Multi-grid schema (D6):** keep one grid in the schema for MVP (see 1.2); add grids with P2 shifts.
6. **Quality score and what-if style extras:** keep only the clash audit at MVP.
7. **Offline and service worker:** keep, but ship as cached HTML and JSON for Today and Week only, no background sync.
8. **Student SMS OTP login:** replace by a class link with optional alerts (see 4.1).
9. **Redis + RQ:** acceptable; alternatives (Postgres-backed queue) would remove one service and could be considered if hosting cost matters. Decision D3 stays unless you choose otherwise.

## 4. Real-world failure risks

| # | Sev | Risk | Fix |
| --- | --- | --- | --- |
| 4.1 | H | **Student login is high friction and costs money.** Students must hold a roster, pass an SMS code, and every code costs a message. Timetables are not secret. | Make the primary student path a link or QR per section, no login, no cost. Login becomes optional, only for alerts. Promote the share link from P2 to MVP (minimal version). |
| 4.2 | H | **SMS abuse and cost.** Anyone can trigger OTP SMS to arbitrary numbers; roll number plus mobile lookup can be probed. | Per-number, per-IP, per-college daily caps; hard monthly budget with an alert; CAPTCHA on public endpoints; uniform responses. |
| 4.3 | H | **Course coverage.** Many arts and science programmes use optional-subject groups; engineering and polytechnic use lab batches. With electives and combined classes at P2, the product may not fit common colleges at launch. | Decide launch scope explicitly: either promote a basic elective-group feature to MVP, or declare "core-subject programmes first" and say so in the pilot plan. |
| 4.4 | H | **Mid-semester change is the daily reality** (teacher leaves, room unavailable) but partial regeneration, leave, and substitutions are P2. | MVP needs "replace teacher on all entries" and "move this class" with live clash check; both are small. |
| 4.5 | H | **Verification is one person.** College registration waits on the platform admin; fake registrations are possible; there is no SLA or backup operator. | Define verification checklist, response target, and a second platform admin; CAPTCHA and rate limits on registration. |
| 4.6 | M | **Owner continuity.** A college admin loses their phone or leaves. | Admin account recovery with PA assistance and an ownership-transfer flow. |
| 4.7 | M | **Shared phones and offline cache.** Cached personal timetables stay on devices. | Cache only the section timetable; clear the cache on sign-out; cache nothing for staff roles. |
| 4.8 | M | **Solver size.** CP-SAT variable count grows with sessions x slots x rooms. Decomposition by department fails when teachers and rooms are shared across departments. | Solve in dependency order (shared resources first), fix earlier results, measure in the Phase 0 spike; set model size limits and fail early with a clear message. |
| 4.9 | M | **RQ and long jobs.** Job timeout, worker heartbeat, cancel, and progress need care; a killed worker must not leave a half draft. | Write the draft in one transaction at the end; cancel through a flag; test kill during solve. |
| 4.10 | M | **Legal.** The DPDP Act affects student data, including students under 18 (junior colleges, ITI). S11 is a launch gate but has design consequences. | Decide minors' consent and the parent contact model now; keep stored data minimal (already decided). Get legal advice before launch. |
| 4.11 | M | **Pilot support.** No plan for training, a helpline, or data correction. | Add pilot runbook (Phase 11) and a lightweight in-app help. |
| 4.12 | M | **Business model, pricing, and ownership of the product are not covered.** Not required for the hackathon, but required for real colleges. | Out of scope for these docs; record as an owner decision. |

## 5. Security weaknesses and gaps

| # | Sev | Issue | Fix |
| --- | --- | --- | --- |
| 5.1 | H | **Role changes lag.** Access tokens are valid up to 15 minutes; removing a member or role takes effect late. | Check membership status per request (needed for RLS context anyway) rather than trusting token claims for roles; keep tokens for identity only. |
| 5.2 | H | **File parsing attacks.** xlsx files are zip and XML (zip bombs, XML entity attacks), pandas reads lazily. | Limit decompressed size, row and column counts, use safe XML parsing, parse in the worker with memory and time limits. |
| 5.3 | H | **PDF generation fetching URLs** (SSRF) if an HTML-to-PDF engine is used. | Disable external fetching; render only local templates; escape all user text. |
| 5.4 | H | **JWT hygiene** is not specified. | Pin the algorithm, use key rotation with key ids, validate issuer, audience, expiry; no secrets in tokens. |
| 5.5 | M | **Audit log "append-only"** is a rule, not a mechanism. | Revoke `UPDATE` and `DELETE` for the API role on the table; monitor; periodic hash chain optional. |
| 5.6 | M | **Redis failure behaviour** for rate limits and sessions is undefined. | Fail closed for auth rate limits; document degraded modes. |
| 5.7 | M | **Idempotency keys** need storage, expiry, and a scope (user plus route). | Add a table or Redis keys with 24 hour expiry. |
| 5.8 | M | **Registration documents** (affiliation letters) are sensitive and public uploads are an abuse path. | Private storage, short-lived signed URLs, scanning, size and type checks (D15). |
| 5.9 | M | **Logs and fake providers** might print OTPs in development. | Fake providers write to a local dev inbox only, disabled outside development. |
| 5.10 | M | **Support access** and platform admin power are broad. | Mandatory two-step sign-in for platform admins at MVP (S4), all actions audited and visible to the college. |

## 6. Coverage check: does each feature have flow, data, API, and acceptance criteria?

| Area | Flow | Data model | API | Acceptance | Gap |
| --- | --- | --- | --- | --- | --- |
| Authentication | Yes (journeys) | Yes | Yes | Phase 2 tests only | Per-feature Given/When/Then missing; student login to be redesigned (4.1) |
| Registration and verification | Yes | Yes | Yes | J1 | Documents storage undecided; verification SLA undefined |
| Setup wizard | Yes | **No progress table** | Partly (`/setup`) | None specific | Add `setup_progress` and resume rules |
| Master data and import | Yes | Yes | Pattern only | J2 | Per-entity field lists and validation tables live in earlier docs but not in TECHNICAL_PLAN |
| Availability | Yes | Yes | Yes | J6 | **No deadline or reminder model**; fallback to last semester needs data from the previous semester |
| Rules and locks | Yes | Yes | Yes | Phase 5 | Rule parameter schemas not defined |
| Generation | Yes | Yes | Yes | Phase 5 | Unplaced-session outcome missing (1.8) |
| Editor and workflow | Yes | Yes | Yes | J3 to J5 | Concurrent editing policy missing (1.7) |
| Views and Today | Yes | Derived | Yes | J7 | **Merge rule for base, exception, holiday not written** |
| Exports | Yes | Yes | Yes | Phase 9 | Excel and images P2; PDF layout spec missing |
| Exceptions | Yes | Yes | Yes | J8 | Keying (1.5) |
| Notifications | Yes | Yes | Partly | J8 | Hold window (2.3); recipient resolution rules; template list per language |
| Reports | Yes | Derived | Yes | None | Clash audit only; define the output |
| Settings, profile | Yes | Partly | Partly | None | Language and notification preferences endpoints |
| Admin and governance | Partly | Audit yes | Partly | None | **No tables or endpoints for feature flags, announcements, help or problem reports**; mostly P2 but "report a problem" is MVP |
| Sample college | Yes | **No `is_sample` marker** | No | None | Add flag and delete action |
| Accessibility, performance | Yes | n/a | n/a | Budgets and axe | Good |

Cross-cutting: acceptance criteria exist at phase level and as test ids, not per feature. Recommend `docs/FEATURE_ACCEPTANCE.md` with Given/When/Then for each MVP feature (about 40), written before the related phase begins; the test matrix then references those.

## 7. Recommended order of fixes

Before Phase 0 ends (decisions needed):

1. Student access model: link or QR as primary, login optional (4.1, 2.5, 2.7).
2. Launch scope for electives and batches (4.3, 1.1).
3. One grid per college at MVP (1.2).
4. Cut list in section 3, especially HOD, Google sign-in, templates.
5. Deadline: is the hackathon date fixed, and does it set the scope (fast path in IMPLEMENTATION_PLAN)?
6. Hosting region and provider (D4), domain (S9), SMS provider with DLT start (Ext1).

Before Phase 1 starts (document changes): batch/section clash predicate, deferrable constraints, grid lock, exception keying, missing tables (`setup_progress`, `is_sample`, idempotency keys, availability deadlines, problem reports).

Before Phase 2 starts: membership check per request, JWT rules, rate-limit policy and Redis failure mode, CAPTCHA, SMS caps.

During Phases 4, 5, 9: parser limits, solver ordering and failure handling, PDF with no external fetching, notification hold window.

Before launch: legal position on minors, verification process, pen test, pilot runbook.
