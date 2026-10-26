# UI_UX_GUIDELINES.md

> **Scope note (updated 2026-10-26).** These guidelines apply to the prototype and the platform. The prototype simplifies them: English only, system fonts, its own components with inline SVG icons, and no service worker. Component libraries and tools named below (shadcn/ui, Lucide, Storybook) are **not approved packages**; using them needs the owner's approval (N17 in `PRODUCT_REQUIREMENTS.md` section 12). The student sign-in screen in section 7 depends on the open student-access decision (N1).

Design rules for the web app. Behaviour is in `PRODUCT_REQUIREMENTS.md`; this file says how it looks and feels. Open design items (U1 to U9) are in `PRODUCT_REQUIREMENTS.md` section 12: use the proposed defaults below as placeholders and ask before treating them as final.

## 1. Principles

1. **The timetable is the hero.** Every screen leads to or from the grid. Chrome stays quiet.
2. **One next step.** Each screen shows what to do now; secondary actions are visually quieter.
3. **Say what and why.** Messages name the exact thing and the fix ("Room 12 is already used by BSc 2A at 10:00. Pick another room or time.").
4. **Punjabi first-class.** Punjabi (Gurmukhi) is designed and tested as carefully as English, not translated at the end.
5. **Built for weak phones.** Student and teacher views are light, fast, and work offline.
6. **Not a generic dashboard.** Visual identity comes from a printed college notice board: ruled lists, a period rail, stamped status badges.

## 2. Identity

- **Period rail:** a vertical strip of period numbers and times at the left of every grid; the signature element. Break periods are shown as a thin hatched band.
- **Notice-board stamps:** status badges (Draft, Published, Cancelled) look like rubber stamps: bordered, slightly letterspaced, no shadows.
- **Ruled lists:** tables use hairline rules between rows, no zebra stripes, no heavy cards.
- **Subject colours:** each subject has a colour plus a short code and a pattern, so meaning never depends on colour alone.
- Product name, logo, and accent colour are OPEN (U1). Use a neutral placeholder wordmark.

## 3. Tokens

Define once as CSS variables (`:root`), mapped into Tailwind. Semantic names only in components.

| Token | Value | Use |
| --- | --- | --- |
| `--color-primary` | #1D4ED8 | Primary actions, focus ring, links |
| `--color-primary-hover` | #1E40AF | Hover |
| `--color-bg` | #FFFFFF | Page |
| `--color-surface` | #F8FAFC | Panels, grid background |
| `--color-border` | #CBD5E1 | Rules and inputs |
| `--color-text` | #0F172A | Body text (contrast 16:1 on bg) |
| `--color-text-muted` | #475569 | Secondary text (7:1) |
| `--color-success` | #15803D | Valid, published |
| `--color-warning` | #B45309 | Warnings, avoid |
| `--color-danger` | #B91C1C | Errors, clashes |
| `--color-info` | #0369A1 | Notices |

Rules: every text/background pair at least 4.5:1 (3:1 for large text and UI borders); focus ring 2 px primary with 2 px offset, always visible; state is never colour alone (icon plus text). Dark theme is P2 (U7); tokens must already be theme-ready.

Subject palette: 12 colours chosen for 3:1 against the surface and distinguishable under common colour-blindness; each paired with one of six patterns and a 2 to 4 letter code.

## 4. Typography

- Font: Noto Sans for Latin, Noto Sans Gurmukhi, Noto Sans Devanagari (P2) (U4, proposed). Self-host subsets; `font-display: swap`; Gurmukhi subset loaded only when the language is Punjabi.
- Scale (px): 12 caption, 14 small, 16 body (minimum on phones), 18 lead, 20 / 24 / 30 headings.
- Line height 1.5 body, 1.3 headings; Gurmukhi gets +0.1 line height to avoid clipped marks.
- Digits: Western (0 to 9) everywhere (U3, proposed). Time format 12 hour with AM/PM (U2, proposed; setting at P2).
- Never use all caps for Punjabi; never truncate names without a tooltip and full text on focus.

## 5. Layout, spacing, responsiveness

- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48. Radii: 4 small, 8 panels. Elevation: borders instead of shadows; a single shadow for popovers and dialogs.
- Breakpoints: mobile under 640, tablet 640 to 1023, desktop 1024 and up. Content max width 1280.
- Touch targets at least 44 by 44 px; spacing between targets at least 8 px.
- **Mobile:** bottom tab bar (3 to 5 items by role), one column, grid shows one day with a swipe-between-days strip. The editor is review-only on phones (U6, proposed); editing needs tablet or desktop.
- **Tablet:** collapsible left navigation; grid shows the full week with horizontal scroll for many columns.
- **Desktop:** persistent left navigation, top bar with college name and user menu, grid with side inspector panel.
- Students and teachers see a simplified shell: no left navigation, just Today, Week, Alerts, Profile.

## 6. Navigation by role

| Role | Primary items |
| --- | --- |
| PA | Verification queue, Colleges, Templates, Platform health |
| CA | Home, Setup, Timetable, People, Reports, Settings |
| TC | Home, Inputs, Rules, Generate, Timetable, Imports, Reports |
| HOD | Home, My department, Assignments, Availability, Timetable |
| TE | Today, Week, Availability, Alerts, Profile |
| ST | Today, Week, Alerts, Profile |

Breadcrumbs on deep admin screens; the current section is marked in text and shape (not only colour). A language toggle (English, ਪੰਜਾਬੀ) is in the top bar and on the login screen.

## 7. Screens (key set)

Features and their releases are in `PRODUCT_REQUIREMENTS.md` section 5; the key screens are:

- Public: landing, login, invite accept, password reset (from a CA-issued link). Student access depends on N1 (share link or sign-in). College self-registration is P2 (N4).
- Platform admin: colleges list, create college and invite its first administrator (verification queue at P2, N4).
- College admin and coordinator: dashboard with setup checklist (SET-1; a step-by-step wizard is not planned for MVP), master-data lists and forms, import (upload, preview, confirm), availability inputs tracker, rules, generate (pre-check, progress, result), timetable editor, publish confirmation, exceptions review, reports (clash audit, quality), user management.
- HOD: department dashboard, subject assignment (load bars), availability for department.
- Teacher: Today, Week, availability grid.
- Student: Today (next class card), Week, Alerts.
- Shared: profile and settings, notifications, help and report a problem, error pages (403, 404, offline, 500).

**Four screens to mock up in HTML before building:** timetable editor, student Today, import preview, generation result. Ask the owner to approve the mock-ups first.

## 8. Components

Build with the project's own components, styled with the tokens (shadcn/ui and Storybook only if approved, N17). Each component's states are documented next to it.

- **Timetable grid:** rows = periods (with the period rail), columns = days; cells hold class cards. Click or Enter selects a cell; arrow keys move; `M` begins a move, arrows or click choose the target, Enter confirms, Esc cancels. Drag and drop is an extra, never the only way. Valid targets are tinted green with a check, invalid targets red with an icon and the reason in a tooltip and in a live region.
- **Class card:** subject code and name, teacher, room, section; status badge; lock icon; overlays for cancelled (struck through, stamp) and changed (stamp "Room changed"). Lab blocks span rows.
- **Form fields:** label above, hint below, error below with icon; required marked with text "required"; validate on blur and on submit; focus moves to the first error with a summary at the top.
- **Tables:** ruled lists, sortable columns with `aria-sort`, sticky header, row actions in a menu, bulk actions in a bar after selection; on phones become stacked key-value cards.
- **Cards and panels:** border only, 8 px radius, one level deep.
- **Dialogs:** focus trapped, labelled, Esc closes; destructive confirmations state the consequence and name the object; the safe button is the default.
- **Toasts:** for confirmations only; stay at least 5 seconds; never for errors that need action (use inline banners).
- **Banners:** info, warning, error at the top of the content; dismissible only if not blocking.
- **Stepper (wizard):** shows done, current, remaining; "Save and continue later" always available; back never loses data.
- **Availability grid:** four states per cell cycle on tap (available, cannot teach, avoid, prefer) with legend, each with icon and pattern.
- **Progress panel (generation):** queue position, elapsed time, best score so far, "Safe to leave this page" note, cancel button.
- **Empty states:** one-line explanation, one primary action, optional sample-data link.

## 9. Feedback messages

Pattern: **what happened + why + what to do**. Examples:

- Clash on edit: "Can't move here. Dr Singh teaches BSc 2A at this time."
- Import row error: "Row 14, Capacity: '4O' is not a number. Use digits, for example 40."
- Version conflict: "Someone else changed this timetable. Reload to see their changes; your edit was not saved."
- Success: "Timetable published. 412 students and 28 teachers will be notified when the 15-minute undo window closes."
- Network: "No connection. Showing your saved timetable from 2 hours ago."

All strings come from i18n catalogues with `en` and `pa`; Punjabi copy reviewed by a Punjabi speaker (U9). Messages never contain raw error codes or stack traces; they include a short reference id when a support request would help.

## 10. States for every screen

| State | Rule |
| --- | --- |
| Loading | Skeletons shaped like the final content; no layout shift; spinner only for actions under 1 second; long jobs use the progress panel |
| Empty | Explain, offer one action |
| Success | Confirm and say what is next |
| Error | Inline near the cause; page-level for failures to load, with a retry button |
| Offline | Banner plus last cached data and its age; actions that need a network are disabled with an explanation |
| Permission | A calm 403 page that names the role needed and who can grant it |
| Partial | Lists show what loaded and mark what did not |

## 11. Accessibility checklist (WCAG 2.1 AA)

- All functions keyboard operable in a logical order; no keyboard traps; skip link to content; visible focus.
- Semantic landmarks and headings; grid uses table semantics with row and column headers; cells have accessible names ("Monday, period 3, Maths, Dr Singh, Room 12").
- Live regions announce clash results, save status, and job progress politely.
- Form labels, error association (`aria-describedby`), no placeholder-only labels; `autocomplete` attributes set.
- Language attribute set per page and per inline Punjabi text; reading order checked with a screen reader (NVDA on Windows, TalkBack on Android).
- Zoom to 200 percent and 320 px width without loss; respect reduced-motion; no motion over 5 seconds.
- Colour contrast per section 3; pattern and text accompany colour.
- Touch targets per section 5; no hover-only information.
- Each release: axe automated scan, keyboard walkthrough, one screen-reader pass of journey J3 and the student view (J4).

## 12. Performance budget

- Student and teacher pages: 150 KB transferred on first load, 3 seconds to interactive on a 3G profile, no layout shift above 0.1.
- Techniques: server-rendered shell, route-level code splitting, no heavy libraries on student routes, subsetted fonts, SVG icons by import, image-free design, service worker caching Today and Week with a stale-after-7-days banner.
- Admin screens: first useful content under 2 seconds on broadband; grid renders 60 sections' worth of cells without jank (virtualise lists, not the visible grid).

## 13. Language handling

- Catalogues in `apps/web/messages/{en,pa}.json`; Hindi added at P2 (hidden from the toggle until reviewed).
- Language is chosen at first visit, remembered in a cookie (no personal data), and stored in the profile when signed in.
- Text expands: layouts tolerate 30 percent longer strings; test every screen in Punjabi.
- Dates and times formatted through `Intl` with locale; names and subjects stored in the original script and never auto-transliterated.
