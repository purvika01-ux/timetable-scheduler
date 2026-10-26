# API_DESIGN.md

REST API of College Timetable Optimizer (Express, TypeScript). Request and response schemas are Zod schemas in `packages/contracts`; the OpenAPI 3.1 document is generated from them (N6) and served at `GET /api/v1/openapi.json`. This document defines conventions and the endpoint set; the generated OpenAPI document is the field-level reference once implemented.

Roles: PA, PS, CA, PR, TC, HOD, TE, ST (`PRODUCT_REQUIREMENTS.md` section 2). "Dept" means limited to the caller's department scope; "self" means the caller's own records.

Status: design.

---

## 1. Conventions

| Topic | Rule |
| --- | --- |
| Base path | `/api/v1`. Breaking changes go to `/api/v2`; additive fields are not breaking |
| Tenant paths | `/api/v1/colleges/{collegeId}/...` (D20); term-scoped data under `/colleges/{collegeId}/terms/{termId}/...` |
| Platform paths | `/api/v1/platform/...` (PA only) |
| Format | JSON, UTF-8, camelCase; ids are 24-character hex strings; timestamps ISO 8601 UTC; calendar dates `YYYY-MM-DD` (college time zone) |
| Bilingual fields | `{ "en": "...", "pa": "..." }`; the API returns both; the client chooses |
| Authentication | `Authorization: Bearer <access token>` on every non-public route. Refresh uses the HttpOnly cookie on `/auth/refresh` only |
| Validation | Every param, query and body parsed by a strict Zod schema; unknown fields rejected |
| Concurrency (master data) | Updates send `rowVersion`; mismatch → `409 version_conflict` with the current document |
| Concurrency (timetable) | Draft operations send `baseRevision`; mismatch → `409 version_conflict` with `currentRevision` |
| Idempotency | Every `POST`, `PUT`, `PATCH`, `DELETE` carries `Idempotency-Key` (UUID). Same key + same body within 24 h returns the stored response; same key + different body → `422 idempotency_mismatch` |
| Pagination | `?limit=` (default 50, max 200) and `?cursor=`; response `{ "items": [...], "nextCursor": "..." | null }` |
| Caching | Timetable views return `ETag`; clients send `If-None-Match` and get `304` when unchanged (saves data on slow networks) |
| Long work | `202 Accepted` with `{ "jobId" }` and a `Location` header to `GET .../jobs/{jobId}`; clients poll (D12) |
| Rate limits | `429 rate_limited` with `Retry-After`; `RateLimit-*` headers on limited routes |
| Language | `Accept-Language: en` or `pa` selects the language of `message` fields in errors |
| Compression | gzip for responses over 1 KB |
| Request size | JSON 1 MB; CSV uploads 5 MB as `text/csv` |

## 2. Errors

```json
{
  "error": {
    "code": "rule_violation",
    "message": "Can't move here. Dr. Amandeep Singh already teaches CSE 5A at this time.",
    "fields": [{ "path": "target.startPeriod", "code": "teacher_clash", "message": "..." }],
    "issues": [{ "kind": "teacher", "entryIds": ["..."], "messageKey": "issue.teacher", "params": { } }],
    "requestId": "01J..."
  }
}
```

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `bad_request`, `validation_failed` | Malformed JSON; schema failure (`fields` lists each) |
| 401 | `unauthenticated`, `token_expired`, `invalid_credentials` | No or bad access token; failed sign-in (the same response for a wrong password, an unknown account and a paused account, `SECURITY_MODEL.md` 2.2) |
| 403 | `forbidden` | Authenticated member of the college without the needed role or scope |
| 404 | `not_found` | Unknown id **or an id from another college** (never 403 for other tenants) |
| 409 | `version_conflict`, `state_conflict`, `duplicate` | Stale `rowVersion`/`baseRevision`; wrong lifecycle state (e.g. publishing a draft that is not submitted); natural-key clash |
| 413 | `payload_too_large` | Over size limits |
| 415 | `unsupported_media_type` | Wrong content type (e.g. upload not `text/csv`) |
| 422 | `rule_violation`, `precondition_failed`, `idempotency_mismatch` | Scheduling hard constraint broken (`issues` lists them); business precondition (e.g. term closed, grid locked) |
| 429 | `rate_limited` | Too many requests |
| 500 | `internal` | Unexpected; message is generic, `requestId` for support |
| 503 | `retry_later` | Transaction retries exhausted, dependency down |

Messages follow "what happened, why, what to do" and never include stack traces, internal ids beyond the request id, or data from another college.

## 3. Shared shapes

```ts
// Validation report returned by draft, version and generation endpoints
type ValidationReport = {
  valid: boolean;              // no hard violations
  complete: boolean;           // every requirement fully placed
  counts: Record<IssueKind, number>;
  issues: { kind: IssueKind; entryIds: string[]; messageKey: string; params: object }[];
  missing: { requirementId: string; missing: number }[];
  score: { total: number; byPreference: Record<string, number> };
};

type Entry = {
  id: string; requirementId: string; offeringId: string; component: "L" | "T" | "P";
  audience: Audience; teacherIds: string[]; roomId: string;
  day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"; startPeriod: number; span: number;
  locked: boolean; source: "generated" | "manual";
};
```

`IssueKind` and `Audience` are defined in `packages/contracts` (mirroring `DATABASE_DESIGN.md` 4.4 and `SCHEDULING_ENGINE.md` section 4). Issue messages are returned as keys plus parameters so the client renders them in English or Punjabi.

## 4. Endpoints

### 4.1 Public and authentication

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/health`, `/ready` | Public | Liveness; readiness (database, migrations) |
| POST | `/auth/login` | Public | `{ identifier (email or mobile), password }` → access token + refresh cookie; MFA step for PA |
| POST | `/auth/mfa/verify` | Public (MFA challenge) | Completes PA sign-in (S4) |
| POST | `/auth/refresh` | Cookie | Rotates refresh token; reuse revokes the family. Requires `X-Requested-With` header and allowed `Origin` (CSRF) |
| POST | `/auth/logout` | Cookie | Revokes current session |
| POST | `/auth/logout-all` | Any signed-in | Revokes all sessions of the user |
| GET | `/auth/invitations/{token}` | Public | Shows college and roles for an invite (no personal data of others) |
| POST | `/auth/invitations/{token}/accept` | Public | Sets password or links the signed-in account; creates the membership |
| POST | `/auth/password/reset` | Public | `{ token, newPassword }`; ends other sessions |
| POST | `/auth/password/forgot` | Public | Sends a reset link by email or SMS; **disabled until Ext1/Ext2 are approved**; always returns the same response |
| GET | `/public/timetable/{shareToken}` | Public (N1) | Published section timetable plus exceptions for the next 14 days; read-only; `ETag` |

### 4.2 Current user

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET, PATCH | `/me` | Self | Name, locale, password change (`currentPassword` required) |
| GET | `/me/memberships` | Self | Colleges and roles, to choose the active college |
| GET | `/me/sessions`, DELETE `/me/sessions/{id}` | Self | Device list and sign-out per device (P2 for the list UI) |
| GET | `/me/colleges/{collegeId}/timetable?from&to` | TE, ST | Own published timetable with exceptions overlaid; `ETag` |
| GET | `/me/colleges/{collegeId}/today` | TE, ST | Today's classes, next class, changes; small payload for the student/teacher home |
| GET, PUT | `/me/colleges/{collegeId}/terms/{termId}/availability` | TE | Own availability; `rowVersion`; refused after the deadline (`422 precondition_failed`) |
| GET | `/me/colleges/{collegeId}/terms/{termId}/assignments` | TE | Own teaching assignments (read-only) |
| GET | `/me/notifications`; POST `/me/notifications/{id}/read`; POST `/me/notifications/read-all` | Self | In-app notifications |

### 4.3 Platform

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET, POST | `/platform/colleges` | PA | List, create (N4) |
| GET, PATCH | `/platform/colleges/{collegeId}` | PA | Status (activate, suspend) and profile; audited |
| POST | `/platform/colleges/{collegeId}/invitations` | PA | Invite the first CA |
| POST | `/platform/colleges/{collegeId}/recovery` | PA | Administrator recovery after the out-of-band check (N16); audited |
| GET | `/platform/audit-events` | PA | Platform audit log |

### 4.4 College, users and access

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/colleges/{collegeId}` | Any member | Profile and settings visible to the role |
| PATCH | `/colleges/{collegeId}` | CA | Settings; `rowVersion` |
| GET, POST | `/colleges/{collegeId}/invitations` | CA | Response includes the invite link **once**. Invitation requests by TC and HOD for CA approval are P2 |
| DELETE | `/colleges/{collegeId}/invitations/{id}` | CA, inviter | Revoke |
| GET | `/colleges/{collegeId}/memberships` | CA, PR; HOD (dept teachers) | Contact fields masked unless CA |
| PATCH | `/colleges/{collegeId}/memberships/{id}` | CA | Roles, scope, status; last CA protected |
| POST | `/colleges/{collegeId}/memberships/{id}/reset-link` | CA | One-time password reset link to hand to the user (no email provider needed) |
| GET | `/colleges/{collegeId}/audit-events` | CA, PR | Filter by action, target, date |
| POST | `/colleges/{collegeId}/problem-reports` | Any member | Help requests with page and reference id |

### 4.5 Calendar and structure

All support `GET` list, `GET` one, `POST` create, `PATCH` update (`rowVersion`), and deactivate (`DELETE` sets `active: false` when referenced).

| Path under `/colleges/{collegeId}` | Write access | Read access |
| --- | --- | --- |
| `/academic-years`, `/terms` | CA | All members |
| `/holidays` | CA | All members |
| `/time-grid` (singleton `GET`, `PUT`) | CA; refused with `422 precondition_failed` while a draft exists | All members |
| `/departments`, `/programmes` | CA, TC | All staff |
| `/rooms` | CA, TC; HOD for rooms owned by their department | All staff |
| `/teachers` | CA, TC; HOD (dept) | Staff; TE sees self |
| `/subjects` | CA, TC; HOD (dept) | All staff |

### 4.6 Term inputs (under `/colleges/{collegeId}/terms/{termId}`)

| Method | Path | Write access | Notes |
| --- | --- | --- | --- |
| CRUD | `/sections` | CA, TC; HOD (dept) | |
| CRUD | `/sections/{sectionId}/batch-sets` | CA, TC; HOD (dept) | Strength sum checked |
| CRUD | `/elective-groups` | CA, TC | Enrolment counts checked |
| CRUD | `/offerings` | CA, TC; HOD (dept) | L-T-P hours |
| CRUD | `/assignments` | CA, TC; HOD (dept) | Teachers, audience, sessions; regenerates requirements |
| GET, PATCH | `/requirements` | CA, TC | View derived requirements; manual overrides (fixed room, parallel group, features) |
| POST | `/requirements/rebuild` | CA, TC | Rebuild from assignments, keeping overrides |
| GET | `/availability?teacherId=` | Staff (HOD dept) | |
| PUT | `/availability/{teacherId}` | CA, TC; HOD (dept) | Same rules as `/me/.../availability` |
| POST | `/availability/deadline` | CA, TC | Set or clear the collection deadline |
| GET, PUT | `/rules` | CA, TC | Preset, weights, never/only rules; contradictory hard rules → `422` |

Every write in this section that affects scheduling runs the inputs-revision transaction (`DATABASE_DESIGN.md` 6.4). If it would invalidate the **published** timetable, the first call returns `422 precondition_failed` with `affected` classes; repeating it with `"confirmPublishedImpact": true` saves it.

### 4.7 Import and export

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/colleges/{collegeId}/imports/templates/{kind}.csv` | CA, TC, HOD | `kind`: teachers, rooms, subjects, sections, batches, offerings, assignments, availability, electiveEnrolments (per D8), students (only if N1 needs them) |
| POST | `/colleges/{collegeId}/terms/{termId}/imports/{kind}/preview` | CA, TC; HOD (dept rows only) | Body `text/csv` ≤ 5 MB, ≤ 5,000 rows → `{ previewId, summary, errors[] }`; nothing saved |
| GET | `/colleges/{collegeId}/imports/previews/{previewId}` | Creator | Paged rows and errors |
| POST | `/colleges/{collegeId}/imports/previews/{previewId}/confirm` | Creator | All-or-nothing transaction; upsert by natural key |
| GET | `/colleges/{collegeId}/terms/{termId}/exports/timetable.csv?versionId&view&id` | Per view access | CSV of one view; formula characters escaped |
| GET | `/colleges/{collegeId}/exports/{kind}.csv` | CA, TC, PR; HOD (dept) | Master data export |
| POST | `/colleges/{collegeId}/terms/{termId}/exports` | CA, TC, PR | Bulk export job (P2; PDF per D23) → 202 |

Printable pages are web routes (`/print/...`) that call the view endpoints; the browser's print dialog saves them as PDF (IO-6).

### 4.8 Generation

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| POST | `/colleges/{collegeId}/terms/{termId}/precheck` | CA, TC | Synchronous, read-only → `{ blocking[], warnings[] }` each with a fix link target |
| POST | `/colleges/{collegeId}/terms/{termId}/generations` | CA, TC | `{ timeLimitSeconds: 120|300|600, seed?, presetOverride? }` → 202 `{ jobId, generationId }`; one active run per college (`409 state_conflict`) |
| GET | `/colleges/{collegeId}/generations/{generationId}` | CA, TC, PR | Status, progress, and when finished the result summary, validation report and unplaced list |
| GET | `/colleges/{collegeId}/generations/{generationId}/entries?view&id` | CA, TC, PR | Candidate entries for a view |
| POST | `/colleges/{collegeId}/generations/{generationId}/cancel` | CA, TC | Sets the cancel flag |
| POST | `/colleges/{collegeId}/generations/{generationId}/apply` | CA, TC | `{ baseRevision }` → replaces unlocked draft entries (`DATABASE_DESIGN.md` 6.6) |
| GET | `/colleges/{collegeId}/jobs/{jobId}` | Creator, CA | Generic job status |

### 4.9 Draft editing

Under `/colleges/{collegeId}/terms/{termId}/draft`:

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `` (the draft) | CA, TC, PR; HOD (view) | `{ revision, stale, lastValidation, editors[] }`; creates an empty draft on first `POST` below |
| POST | `` | CA, TC | Create the term's draft (locks the grid) |
| GET | `/entries?view=section|batch|teacher|room|department&id=` | CA, TC, PR; HOD (dept) | Entries for one view with `revision` and `ETag` |
| GET | `/validation` | CA, TC, PR; HOD (dept) | Full report |
| POST | `/move-options` | CA, TC | `{ entryId }` → valid targets (day, start, rooms) and invalid ones with reasons; computed server-side with the same core functions the client uses |
| POST | `/operations` | CA, TC | `{ baseRevision, ops: [...] }`, applied atomically (section 5) |
| POST | `/presence` | CA, TC | Heartbeat for "who else is editing" (N15) |
| POST | `/restore` | CA, TC | `{ versionId, baseRevision }` → copy a version into the draft |
| POST | `/revalidate` | CA, TC | Force revalidation after input changes |

### 4.10 Versions and publishing

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/colleges/{collegeId}/terms/{termId}/versions` | CA, TC, PR; HOD (view) | History with status, who, when, note |
| POST | `/colleges/{collegeId}/terms/{termId}/versions` | CA, TC | `{ baseRevision, note, submit: boolean }`; `submit: true` requires zero hard violations |
| GET | `/colleges/{collegeId}/versions/{versionId}` and `/entries?view&id` | Staff per view rules | Immutable |
| POST | `/colleges/{collegeId}/versions/{versionId}/return` | PR, CA | Return a submitted version with a comment |
| POST | `/colleges/{collegeId}/versions/{versionId}/publish` | PR, CA | `{ acknowledgeMissing?: { requirementIds[] } }` (N2) → published; notifications held until `undoUntil` |
| POST | `/colleges/{collegeId}/versions/{versionId}/undo-publish` | PR, CA | Before `undoUntil` only (`422 precondition_failed` after) |
| GET | `/colleges/{collegeId}/versions/{a}/compare/{b}` | CA, TC, PR | P2 |

### 4.11 Published timetable, exceptions, reports

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/colleges/{collegeId}/terms/{termId}/timetable?view&id&from&to` | Staff per view rules; TE own + allowed views | Published version with exceptions and holidays overlaid; `ETag` |
| GET | `/colleges/{collegeId}/terms/{termId}/exceptions?from&to&status` | CA, TC, PR; HOD (dept) | |
| POST | `/colleges/{collegeId}/terms/{termId}/exceptions` | CA, TC | `{ date, kind, target, change, reason }`; transaction in `DATABASE_DESIGN.md` 6.5 |
| POST | `/colleges/{collegeId}/exceptions/{id}/withdraw` | CA, TC | |
| POST | `/colleges/{collegeId}/exceptions/{id}/review` | CA, TC | Keep or drop after a new publish (D10) |
| POST | `/colleges/{collegeId}/terms/{termId}/exceptions/requests` | TE (own classes), HOD | Request a change; TC approves (MVP: recorded and notified; approval flow P2) |
| POST | `/colleges/{collegeId}/terms/{termId}/substitute-options` | CA, TC | `{ date, entryId }` → free teachers ranked (same department, load) |
| GET | `/colleges/{collegeId}/terms/{termId}/reports/clash-audit?versionId` | CA, TC, PR; HOD (dept) | |
| GET | `/colleges/{collegeId}/terms/{termId}/reports/teacher-load?versionId` | CA, TC, PR; HOD (dept) | |
| GET | `/colleges/{collegeId}/terms/{termId}/reports/room-utilisation?versionId` | CA, TC, PR; HOD (dept rooms) | Includes shared rooms by department |
| POST, DELETE | `/colleges/{collegeId}/terms/{termId}/sections/{sectionId}/share-links` | CA, TC | N1 only; returns the link once |

## 5. Draft operations

`POST .../draft/operations`

```json
{
  "baseRevision": 41,
  "ops": [
    { "op": "move", "entryId": "...", "day": "tue", "startPeriod": 6, "roomId": "..." },
    { "op": "lock", "entryId": "..." }
  ]
}
```

| `op` | Fields | Effect |
| --- | --- | --- |
| `move` | `entryId, day, startPeriod, roomId?` | Move a class (labs move as one block) |
| `swap` | `entryIdA, entryIdB` | Exchange slots (and rooms if both fit) |
| `setRoom` | `entryId, roomId` | Change room only |
| `lock`, `unlock` | `entryId` | Pin or release |
| `add` | `requirementId, day, startPeriod, roomId` | Place a missing session |
| `remove` | `entryId` | Unplace a session (it becomes missing) |
| `setTeachers` | `entryId, teacherIds` | Replace teacher(s) on one entry, e.g. after staff changes; must match an assignment |

All ops in one request succeed or fail together. Responses:

- `200 { "revision": 42, "changed": [Entry...], "removed": [ids], "validation": ValidationReport }`
- `409 version_conflict { "currentRevision": 43 }` — the client reloads the affected view and shows "Someone else changed this timetable".
- `422 rule_violation { "issues": [...] }` — nothing saved; revision unchanged.

## 6. Permission enforcement

Each route declares a policy in its module (`policy.ts`), for example:

```ts
route.post("/terms/:termId/draft/operations", {
  policy: requireRoles(["CA", "TC"]).andScope(draftScopeForOps),
  body: DraftOperationsRequest,
  handler: draftService.applyOperations,
});
```

- Routes without a policy fail application startup.
- Scope checks (department, own records) run in the service with the loaded documents, not only from path parameters.
- The authorization matrix test (AC-T3) enumerates every route × role from the route table and asserts the outcome against `PRODUCT_REQUIREMENTS.md` section 2.3.

## 7. Documentation and compatibility

- The OpenAPI document is generated from `packages/contracts` in CI and committed as `docs/api/openapi.json` so changes are reviewable in diffs (N6).
- Every endpoint's examples are part of its contract tests.
- Deprecations are announced in the document with a removal date; removal only in a new major path.
