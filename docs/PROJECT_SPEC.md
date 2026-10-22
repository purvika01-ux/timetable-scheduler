# PROJECT_SPEC.md

> **Scope note (2026-10-21).** This document describes the full production platform, which is future work. The current build is a frontend-only prototype (Next.js, sample data, browser storage; no backend, database or Docker). For what exists now, see `CLAUDE.md`, `README.md` and `docs/DECISIONS.md` (P1 to P8); they win where this document disagrees about the prototype.

Product specification for the Punjab College Timetable Platform (working name; brand is open, see Open Decisions).
Status: planning finalized on 2026-10-21. Read CLAUDE.md first.

Release tags: **MVP** (first release), **P2** (Phase 2), **Later**. "Open" items must not be decided by Claude Code; ask the owner (see CLAUDE.md, "Decision protocol").

---

## 1. Product

A multi-tenant web platform that produces clash-free college timetables for many colleges in Punjab, lets staff fix and approve them, and gives students and teachers a fast mobile view with change alerts.

Problems solved: manual timetabling that takes weeks and still clashes; uneven teacher loads; idle or contested rooms; no reliable way to tell students about changes.

Users and context: principals, coordinators, HODs on laptops; teachers and students on mid-range Android phones with weak data (3G). Languages: English and Punjabi (Gurmukhi) at MVP; Hindi at P2.

Scope target: any Punjab college type (government, aided, private; engineering, polytechnic, arts and science, nursing, ITI, teacher training), many affiliating universities and boards. Data is isolated per college.

Success looks like: a coordinator with a messy spreadsheet reaches a clash-free draft without help; a student sees the next class and room in under 30 seconds; no college can see another's data.

## 2. Roles

| Code | Role | MVP? | Main task |
| --- | --- | --- | --- |
| PA | Platform Super Admin | MVP | Verify colleges, monitor platform |
| CA | College Admin / Principal | MVP | Set up college, approve, publish |
| TC | Timetable Coordinator | MVP | Import data, set rules, generate, fix, submit |
| HOD | Head of Department | MVP (limited) | Assign subjects, set department data; review and approve at P2 |
| TE | Teacher (permanent, guest, visiting) | MVP | Availability, own timetable; leave at P2 |
| ST | Student | MVP | See today's classes and changes |
| FM | Facility Manager | P2 | Rooms, bookings, maintenance |
| UA | University / Board Admin | P2 | Templates and calendars |
| GU | Guest / Parent (link, no login) | P2 | View shared timetable |
| SD | State / Directorate Viewer | Later | Aggregated utilisation |

A user is one person with memberships (user, college, role); one person can hold several roles and colleges (multi-college switcher at P2). Platform roles have no college.

## 3. Decision log (decided, 2026-10-21)

| Id | Decision |
| --- | --- |
| D1 | Sign-in: own JWT issued by FastAPI |
| D2 | Tenant isolation: database row-level security AND API checks |
| D3 | Job queue: RQ with Redis |
| D5 | WhatsApp is Phase 2. MVP channels: in-app, SMS, email |
| D6 | Schema supports many time grids; MVP interface shows one |
| D7 | Store a minimal student roster (roll number, name, mobile, section); legal review required before launch |
| D10 | After publishing a new version, existing one-day exceptions are listed for the coordinator to keep or drop; never silently moved or deleted |
| D20 | College id is in the URL path: `/api/v1/colleges/{college_id}/...` |
| D22 | One working draft edited in place; a version is saved on submit, on publish, and on an explicit "Save version"; full history and compare at P2 |
| D24 | Browser calls FastAPI directly (exact-origin CORS) |
| Tokens | Access token in memory only; refresh token in a Secure, HttpOnly, same-site cookie, rotated on use |
| Region | PostgreSQL must be hosted in an Indian region. Neon has no Mumbai region, so Neon is dropped; the host is chosen from providers with an Indian region (Open D4) |
| Languages | English and Punjabi at MVP; Hindi at P2 (hidden from the toggle until reviewed) |
| Alerts | SMS only for urgent changes (cancellation, room change, substitute); routine updates in-app and email |
| Offline | Cached Today and Week for students and teachers at MVP; install prompt at P2 |
| Repo | One repository: `apps/web`, `apps/api`, `docs/` |
| First slice | No deadline given; build a thin end-to-end slice first on real tenant and security foundations |
| Security test | An independent penetration test is required before the first real college |

Contradictions found and how they were resolved: Hindi at MVP (resolved: P2); OTP by WhatsApp at MVP (resolved: SMS only); versions on every save (resolved: D22); HOD review at MVP (resolved: HOD review and approval are P2; at MVP CA approves); offline at P2 (resolved: MVP student cache); roster import at P2 (resolved: Excel roster import is MVP, import from university systems is P2).

## 4. Open decisions (do not decide; ask the owner)

| Id | Open item | Blocks |
| --- | --- | --- |
| D4 | Hosting platform and exact Indian region for database, Redis, API, workers | Deployment (Phase 9), file storage, worker sizing |
| D8 | Source of elective enrolments | P2 electives |
| D9 | Assume Asia/Kolkata, no daylight saving; source of holiday dates | Holiday import |
| D11 | Solver worker size, memory/time caps, per-college concurrency | Load tests |
| D12 | Job progress delivery: polling (default for MVP) vs server-sent events | Optional |
| D13 | Cross-college teacher matching rule | P2 |
| D14 | Leave balance tracking | P2 |
| D15 | File storage provider and malware scanning (affiliation documents at registration) | Registration (Phase 3) |
| D16 | Cross-script name search | P2 |
| D17 | Retention periods beyond the 30-day recycle bin | P2 |
| D18 | Public API and versioning | Later |
| D19 | Rate-limit values | Phase 2 hardening |
| D21 | Sample data inside the real tenant (default) or a demo tenant | Phase 3 |
| D23 | PDF engine (WeasyPrint or ReportLab) must be proven to render Gurmukhi and Devanagari correctly | PDF export |
| S1 | Access token lifetime (15 minutes proposed) | Auth |
| S2 | OTP attempt cap and send budgets | Auth |
| S4 | Mandatory 2FA for PA at MVP | Auth |
| S5 | Support access read-only vs read-write | P2 |
| S6, S7 | Log/audit retention; backup retention and recovery targets | Deployment |
| S9 | Domain: app and API on one registrable domain for same-site cookies | Deployment |
| S10 | Common-password list method; Argon2id parameters | Auth |
| S11 | Legal review of student/teacher data, consent text, retention, breach reporting | Launch gate |
| S12 to S15 | Pen test provider and date; security contact; audit log copies; college offboarding | Launch gate |
| U1 | Product name, logo, accent colour (neutral placeholder until chosen) | Branding |
| U2 to U4 | Time format (12h vs 24h), digits (Western proposed), font family (Noto Sans proposed) | UI |
| U5 | HODs comment-only or can edit (college setting; default comment-only) | P2 |
| U6, U7 | Editor on phones (review-only proposed); dark theme (P2 proposed) | UI |
| U9 | Who reviews Punjabi/Hindi copy | Release |
| T1, T2 | Scan tools; how the OpenAPI description is shared with the web app | Pipeline |
| T3 | Solver reproducibility vs parallel speed | P2 |
| T5, T6 | Load targets; browser and device list | Release |
| Ext1 | SMS provider (MSG91 named) and its India DLT registration (entity, sender ID, message templates); approval takes days, so start before Phase 2 | SMS OTP and alerts |
| Ext2 | Email provider (Resend or SendGrid named) | Email |

## 5. Features

IDs match the earlier Feature Breakdown. "Rules" are the essential behaviours; detailed validations are in TECHNICAL_PLAN.md.

### 5.1 Authentication (F2)

| Id | Feature | Release | Key rules |
| --- | --- | --- | --- |
| 2.1 | Sign-up by invite | MVP | Invite by email or mobile, 7-day single-use token, hashed; wrong person must pass a code |
| 2.2 | Login | MVP | Email or mobile plus password or code; 5 failures lock 15 minutes; identical responses for unknown accounts |
| 2.3 | Google sign-in | MVP | Only for emails matching an invite or roster; domain allow-list at P2 |
| 2.4 | Student login | MVP | Roll number + roster mobile + SMS code (6 digits, 5 minutes, resend after 30 seconds) |
| 2.5 | Password reset | MVP | Token valid 30 minutes; ends other sessions; 10+ characters; not last 3 |
| 2.6 | Two-step sign-in | P2 | Mandatory for PA, CA, TC; backup codes (S4 for PA at MVP) |
| 2.7 | Role-based access | MVP | Server-enforced; default deny; other colleges' ids return 404 |
| 2.8 | Multi-college membership | P2 | College switcher; role switcher |
| 2.9 | Sessions | MVP | Idle 30 minutes for admin roles, 7 days for students; sign out everywhere; device list at P2 |

### 5.2 Onboarding (F3)

| Id | Feature | Release | Key rules |
| --- | --- | --- | --- |
| 3.1 | College registration | MVP | Form, OTP-verified email and mobile, affiliation document (5 MB, PDF or image), duplicate warning on name + district |
| 3.2 | Verification | MVP | PA approves, rejects, or requests information; reason mandatory and sent to applicant |
| 3.3 | University/board templates | MVP seeded; P2 UA self-service | Cloned per college; updates never overwrite; diff shown |
| 3.4 | Setup wizard | MVP | Seven steps (time and days, departments and programmes, sections and batches, rooms, teachers, subjects, review); autosave; resume banner |
| 3.5 | Sample college | MVP | Invented data, tagged as sample; deletable |
| 3.6 | Academic years and semesters | MVP | One active semester per programme; closing makes it read-only; promotion rules at P2 |

### 5.3 Dashboards (F4)

CA, TC, HOD, TE, ST, PA dashboards at MVP; each opens with a "what should I do now?" card. FM dashboard P2; SD Later; global search P2. Teacher merged multi-college view P2.

### 5.4 Master data and inputs (F5)

| Id | Feature | Release | Key rules |
| --- | --- | --- | --- |
| 5.1 | Bulk import (Excel and CSV) | MVP | Template download, preview grid with cell errors, nothing saved until confirmed, all-or-nothing or skip-bad-rows, 5 MB and 5,000 rows, re-import updates by natural key. Kinds: teachers, rooms, subjects, sections, students, users |
| 5.2 | Departments, programmes, years, sections, batches | MVP | Batch strengths sum to section strength |
| 5.3 | Subjects | MVP | Theory, lab, tutorial, elective; weekly hours divisible by session length; labs at least 2 periods |
| 5.4 | Teachers | MVP | Permanent, guest, visiting; eligible subjects; daily and weekly maximum; user link |
| 5.5 | Rooms | MVP | Type, capacity, equipment, owner department or shared (never both), accessibility flag |
| 5.6 | Day and period grid, shifts, breaks | MVP | One grid in the interface; schema supports many (D6); no overlapping periods |
| 5.7 | Holidays and events | MVP full-day; P2 partial-day | Adding one after publishing lists affected classes |
| 5.8 | Copy forward | P2 | Choose what to copy, review diff |
| 5.9 | Teacher availability and preferences | MVP | Tap grid: available, cannot teach, avoid, prefer; share limit needs HOD approval; read-only once generation starts; missed deadline falls back to last semester |

### 5.5 Rules (F6)

| Id | Feature | Release | Key rules |
| --- | --- | --- | --- |
| 6.1 | Hard constraints | MVP | See section 7 |
| 6.2 | Soft preferences with weights | MVP five core; P2 full list and presets | Low, Medium, High; at least one preference active; conflict hints |
| 6.3 | Teacher/subject/room/section rules | MVP never and only; P2 prefer and avoid | Hard or preferred; contradictory hard rules refused |
| 6.4 | Locked slots | MVP | A lock cannot create a clash |
| 6.5 | Natural-language rules | Later | Preview and confirm before saving |

### 5.6 Generation (F7)

| Id | Feature | Release | Key rules |
| --- | --- | --- | --- |
| 7.1 | One-click generate | MVP | Scope: college, departments, or sections; time limit 2, 5, or 10 minutes; one run per scope |
| 7.2 | Pre-check | MVP | Plain-language blocking items with fix links; errors block, warnings do not |
| 7.3 | Background solving with progress | MVP | Queue position, best score, "safe to leave"; best-so-far on time limit; one automatic retry on crash |
| 7.4 | Alternatives and score | MVP one option and score; P2 three and compare | Any option with a hard violation is never shown |
| 7.5 | Infeasibility explanation | P2 (MVP shows pre-check list) | Ranked fix suggestions |
| 7.6 | Partial regeneration | P2 | Keeps locked and out-of-scope classes unchanged |
| 7.7 | Electives and combined classes | P2 | One entry with several sections |
| 7.8 | Shifts and multi-campus | Shifts P2; travel time Later | |
| 7.9 | What-if sandbox | Later | |
| 7.10 | Reproducible runs | P2 | Frozen input snapshot, seed, settings (T3) |

### 5.7 Shared resources (F8)

Shared room flag MVP, quotas P2 (8.1); booking requests and approvals P2 (8.2); cross-college busy slots P2 (8.3, only user and times are visible to other colleges, with the teacher's consent); fair-allocation Later (8.4); room maintenance blocks P2 (8.5); utilisation heatmap P2 (8.6).

### 5.8 Editing and workflow (F9)

| Id | Feature | Release | Key rules |
| --- | --- | --- | --- |
| 9.1 | Drag-and-drop editor | MVP | Live clash checks; valid cells green, invalid red with reason; swap; lock; undo and redo; click-to-move and keyboard alternative; labs move as one block; version conflict on stale save |
| 9.2 | Version history, compare, restore | P2 (MVP: D22 draft model) | Restoring never deletes later versions |
| 9.3 | Review and approval | P2 (MVP: Draft then Published, CA approves) | States below |
| 9.4 | In-grid comments | P2 | |
| 9.5 | Publish | MVP | Zero clashes required; one published version per college and semester; undo within 15 minutes |

Approval states (P2): Draft, In HOD review, Changes requested, Approved by HOD, Approved by principal, Published, Superseded. CA may override an unresponsive HOD with a logged reason after 48 hours.

### 5.9 Views and exports (F10)

Grid views by section, teacher, room, department (MVP); Today and next-class mobile view (MVP); free room or teacher finder (P2); PDF export (MVP; Gurmukhi must render correctly, D23), Excel and image (P2); calendar feed (P2); share links and QR (P2); print layouts (P2).

### 5.10 Day-to-day operations (F11)

Cancellation and room change as dated exceptions (MVP); extra class and move (P2); leave application (P2); substitute suggestions and offers (P2); holiday impact (P2); swap requests (P2); minimal-change re-optimisation (Later). A one-day change never edits the base timetable.

### 5.11 Notifications (F12)

Channels: in-app, SMS, email at MVP; push and WhatsApp at P2. SMS only for urgent events. Per-event preferences, quiet hours, digests at P2. Templates in English and Punjabi at MVP, Hindi at P2; missing translation falls back to English and is logged. Messages name the exact change ("Maths, Tue 10:00, moved to Room 12") and go only to the affected people.

| Event | Recipients | Priority | Release |
| --- | --- | --- | --- |
| Timetable published | Affected students and teachers | Normal | MVP |
| Class cancelled, moved, room changed | Section students, teacher | Urgent (SMS) | MVP |
| Substitute assigned | Students, substitute, original teacher | Urgent (SMS) | P2 |
| Generation finished or failed | Coordinator | Normal | MVP |
| Import finished with errors | Importer | Normal | MVP |
| Invite sent or expiring | Invitee | Normal | MVP |
| Leave, approval, review needed | HOD, CA, teacher | Normal | P2 |
| Cross-college clash | Both coordinators | Urgent | P2 |

### 5.12 Analytics, settings, errors, accessibility, admin (F13 to F17)

- Analytics: clash audit and quality score (MVP); workload, room utilisation, student experience reports (P2); usage analytics for PA (P2); state dashboard (Later; opt-in colleges only, minimum 5 colleges per figure, no student data).
- Settings: profile (MVP); language English and Punjabi (MVP), Hindi (P2); light theme (MVP), dark theme (P2, U7); text size and density (P2); college settings (MVP profile and defaults, P2 rest); privacy tools (P2).
- Errors: plain-language messages ("what happened, why, what to do"), import error grid, solver failure states, offline handling, confirmations, 30-day recycle bin (P2); status banner (P2).
- Accessibility and performance: WCAG 2.1 AA; keyboard use; student page under 150 KB and 3 seconds on 3G; cached Today and Week offline.
- Admin and governance: user and role management, tenant isolation, consent and minimisation, append-only audit log, tenant list and suspend (MVP); support access, feature flags, announcements (P2); error tracking (MVP); help and report-a-problem button (MVP).
- Later: exam timetable and invigilation, AI assistant, public API, lab batch rotation, attendance link, substitution marketplace, native app. P2 additions: university roster import, SMS-on-demand timetable, bulk change tool, feedback.

## 6. Journeys (summary)

Each journey has success and failure paths that must be built and tested (see TECHNICAL_PLAN.md testing and UI_UX_GUIDELINES.md states).

- **CA:** register, wait with sample college, activate, set password, invite coordinator, later approve and publish with a confirmation page (who is notified, undo within 15 minutes).
- **TC:** invite link, wizard (template start), import with preview, inputs tracker and reminders, rules preset, pre-check, generate in the background, compare, edit, validate, submit.
- **HOD:** assign subjects to teachers (load bars), review department timetable (P2), approve or request changes (P2), approve leave with substitute suggestions (P2).
- **TE:** invite message, availability grid, wait, published notification, Today and Week, leave and swap (P2).
- **ST:** link or QR, roll number + mobile + SMS code, confirm section, Today with next class and room, change badges, offline cache.
- **PA:** verification queue, approve or reject with reason, activate, monitor queue and delivery.
- **FM, UA, SD, GU:** P2 and later; see section 2.

## 7. Business rules

**Hard constraints (never broken):** no teacher, room, or section double-booked in a version; room kind and capacity fit the class; lab sessions occupy consecutive periods (at least 2) within a day and not across a break; required weekly hours met; teachers never placed in unavailable periods; teachers never double-booked across colleges (P2); locked classes unchanged.

**Soft preferences (weighted):** balanced teacher load; minimal gaps; subjects spread across the week; maximum consecutive periods; avoid first and last periods; labs in the afternoon (core five at MVP).

**Limits and constants:** invite 7 days; OTP 5 minutes, resend 30 seconds; lock after 5 failures for 15 minutes; password 10+ characters; reset token 30 minutes; import 5 MB and 5,000 rows; document upload 5 MB; solver time limits 2, 5, 10 minutes; publish undo 15 minutes; support access at most 24 hours; recycle bin 30 days (P2); student offline banner after 7 days; HOD reminder after 24 hours and 48 hours; state figures need at least 5 colleges.

**Version rule (D22):** editing changes the working draft; versions are saved on submit, publish, and "Save version". One published version per college and semester; publishing supersedes the old one.

**Exception rule (D10):** dated exceptions (cancelled, room changed, teacher substituted, moved, extra) overlay the published timetable; on a new publish they are listed for review. An exception is keyed by (section or batch, date, period, subject), with the entry id only as a hint, so it can be matched against a new version.

**Grid lock:** once a draft exists, periods and breaks cannot be changed; changing them requires discarding the draft or regenerating, with a warning.

**Publish notification hold:** publish notifications are held for the 15-minute undo window and sent after it closes; the confirmation page says so. Urgent exception alerts are not held.

**Unplaced sessions (proposed, not yet decided):** a generation result may list sessions it could not place; it never contains a clash.

**HOD at MVP:** assigns subjects to teachers and sets department availability and data; does not edit, review, or approve timetables (P2).

**Review decisions pending (see ARCHITECTURE_REVIEW.md, section 7):** student access model (link or QR as the main route, login optional), launch scope for electives and batches, the proposed cut list, the deadline, and the batch/section clash rule. Do not build these areas until the owner answers.

## 8. Permissions matrix

Full = create, edit, delete; Dept = own department; Own = own records; View = read-only; Req = may request, another approves; dash = none.

| Capability | PA | CA | TC | HOD | TE | ST | FM | SD | UA | GU |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Verify and suspend colleges | Full | - | - | - | - | - | - | - | - | - |
| Manage templates | Full | View | View | - | - | - | - | - | Full | - |
| College settings and users | - | Full | Req | - | - | - | - | - | - | - |
| Master data | - | Full | Full | Dept | Own profile | - | Rooms | - | - | - |
| Teacher availability | - | Full | Full | Dept | Own | - | - | - | - | - |
| Rules and locked slots | - | Full | Full | Req | - | - | - | - | - | - |
| Generate | - | Full | Full | - | - | - | - | - | - | - |
| Edit draft | - | Full | Full | - (comment-only at P2, U5) | - | - | - | - | - | - |
| Review and approve | - | Full | - | Dept (P2) | - | - | - | - | - | - |
| Publish | - | Full | - | - | - | - | - | - | - | - |
| View published timetable | View | Full | Full | Dept | Own | Own section | Rooms | - | - | Shared scope |
| Leave and substitution | - | View | Full | Dept approve | Own request | - | - | - | - | - |
| Room booking | - | View | Req | Req | - | - | Approve | - | - | - |
| College analytics | View | Full | Full | Dept | - | - | Rooms | - | - | - |
| State analytics | View | - | - | - | - | - | - | View | - | - |
| Audit log | View | Full | - | - | - | - | - | - | - | - |
| Export | - | Full | Full | Dept | Own | Own | Rooms | View | - | - |
