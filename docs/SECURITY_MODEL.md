# SECURITY_MODEL.md

Security design for College Timetable Optimizer: threats, authentication, sessions, recovery, tenant isolation, authorization, input handling, browser protections, rate limiting, data protection and verification. Values marked **proposed** need owner approval (`PRODUCT_REQUIREMENTS.md` section 12).

Status: design. The prototype has no authentication because it holds only invented sample data in the browser.

---

## 1. Assets, actors and threats

| Asset | Why it matters |
| --- | --- |
| College timetables and drafts | Wrong or tampered timetables disrupt a whole college |
| Staff personal data (names, emails, mobiles, employee ids) | Personal data under Indian law (DPDP Act); legal review S11 |
| Student data (only if N1 requires a roster; minors possible) | Higher sensitivity |
| Accounts and sessions | Control over the above |
| Audit trail | Accountability for publishing and changes |

| Actor | Example threats |
| --- | --- |
| Outsider | Credential stuffing, password guessing, invite or reset token guessing, abuse of public endpoints, scraping share links |
| Member of college A | Reading or changing college B's data by changing ids (IDOR); acting beyond role (teacher edits the draft, TC publishes) |
| Departed or demoted staff | Using an old session after role removal |
| Someone with a shared phone | Reading cached data or using a signed-in session |
| Malicious file | CSV formula injection, oversized or malformed uploads |
| Compromised dependency | Supply-chain code execution |
| Operator mistake | Wrong environment, leaked secret, missing backup |

## 2. Authentication

### 2.1 Identifiers and passwords

- Users sign in with email **or** mobile number plus password. Many teachers have no institutional email, so mobile is first-class.
- Passwords: at least 10 characters, checked against a bundled common-password list, not equal to the user's previous 3 (proposed, S10). No composition rules beyond that.
- Hashing: Argon2id via the approved package (M10), parameters per the library's current recommendation, reviewed before launch (S10). Hashes are upgraded on sign-in if parameters change.
- Responses for unknown account and wrong password are identical in content and timing (dummy hash verification for unknown accounts).

### 2.2 Lockout and throttling

- 5 consecutive failures for an account pause sign-in for that account for 15 minutes. A paused account gets exactly the same `401 invalid_credentials` response as a wrong password, and the sign-in screen always says that sign-in pauses for 15 minutes after several failed attempts, so the response never reveals whether an account exists or is paused (AC-A2).
- Per-IP limits on sign-in and token endpoints (section 8).
- Successful sign-in resets the failure count; lockouts and unlocks are audited.

### 2.3 Two-step sign-in

- Required for platform administrators (PA) at MVP (S4, proposed): time-based one-time codes (RFC 6238) from an authenticator app, implemented with Node's `crypto` (no SMS provider and no extra package needed), plus single-use recovery codes stored hashed.
- Optional for CA, PR and TC at P2.

### 2.4 Tokens and sessions

| Item | Design |
| --- | --- |
| Access token | JWT signed with an asymmetric key (key id in header, rotation supported), `iss`, `aud`, `exp`, `iat`, `sub` (user id), `sid` (session id). **No roles or college ids in the token**: memberships are read from the database on every request, so role removal is immediate. Lifetime 15 minutes (S1, proposed). Held only in memory in the browser |
| Refresh token | 256-bit random opaque value; only its SHA-256 hash is stored (`sessions`). Delivered in a cookie: `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` (Strict requires web and API on one registrable domain, N14; otherwise `SameSite=Lax` plus the CSRF controls below) |
| Rotation | Every refresh issues a new refresh token and marks the old one replaced. Presenting a replaced token revokes the whole session family and is audited (AC-A3) |
| Idle and absolute timeouts (proposed) | Users holding CA, PR, TC or PA: 30 minutes idle, 12 hours absolute. Other users: 7 days idle, 30 days absolute |
| Invalidation | Sign out, sign out everywhere, password change or reset (`passwordChangedAt`), membership suspension, user disable |
| Verification on each request | Signature, algorithm pinned, `iss`, `aud`, `exp`, key id known; session not revoked (cached for at most 60 seconds per instance, so sign-out everywhere and password resets take effect on other devices within 60 seconds; role and membership changes take effect on the next request because memberships are not cached) |

### 2.5 Invitations

- Invitation tokens are 256-bit random values, stored hashed, single use, expire in 7 days, bound to the invited email or mobile.
- The link is shown once to the inviter to share (no email or SMS provider needed at MVP, ACC-3). Revocable at any time.
- Accepting requires setting a password (or signing in to an existing account). If the invite was for an email or mobile different from the signed-in account, the user must confirm, and the event is audited.

### 2.6 Password recovery and account recovery

| Situation | Path |
| --- | --- |
| Staff member forgot password (MVP) | CA creates a one-time reset link (30 minutes, single use, hashed) and hands it over in person or by phone. All other sessions end when the password is reset |
| Self-service "forgot password" | Enabled only after an email or SMS provider is approved (Ext1, Ext2). Same token rules; identical response whether or not the account exists |
| CA locked out, another CA exists | The other CA issues a reset link |
| Last CA of a college locked out | PA-assisted recovery after an out-of-band identity check by the college (process and owner **OPEN**, N16). Audited on both platform and college logs; the college's other administrators and the principal are notified |
| PA lost the second factor | Recovery codes; otherwise another PA after identity check |
| Lost or stolen phone | User or CA signs out everywhere; CA can suspend the membership immediately |

## 3. Tenant isolation

Goal: no request can read or change another college's data, even with a bug in a single route.

1. **Path carries the tenant.** Tenant routes are `/colleges/{collegeId}/...` and `/me/colleges/{collegeId}/...` (D20).
2. **Membership from the database.** For both patterns, middleware loads the caller's active membership for `collegeId`; missing or suspended → `404 not_found`. The tenant context `{ userId, collegeId, roles, departmentIds, teacherId }` is stored in `AsyncLocalStorage` for the rest of the request.
3. **Scoped data layer.** A Mongoose plugin on every tenant model adds `collegeId` from the context to every query, update, delete and aggregate (as the first `$match`), and throws if there is no context. Inserts take `collegeId` from the context.
4. **References checked.** When a write references other documents (room, teachers, sections, offerings), the service verifies they exist in the same college in one batched query; otherwise `404` for the referenced id.
5. **No raw access.** Lint rules forbid importing the MongoDB driver or calling `Model.collection` outside `apps/api/src/db`. A request that has no college context yet may use only these helpers, each allowed only in the listed modules (lint rule):
   - `withUserScope(userId)`, filtering by user instead of college, on `memberships` and `notifications` only: sign-in, `/me/memberships`, `/me/notifications`.
   - `resolveByToken(tokenHash)` on `invitations` and `shareLinks` only: invitation preview and accept, public share-link views. The found document's `collegeId` becomes the request's tenant context.
   - `withPlatformScope(reason)`: job claimer, outbox dispatcher, platform admin routes, migrations. Every call records its reason and is logged.
6. **Database backstop.** Collection validators require `collegeId` on tenant collections (`jobs` requires it for every tenant job type; `DATABASE_DESIGN.md` section 1).
7. **Errors do not leak.** Other colleges' ids return the same `404` as non-existent ids; error messages never include other tenants' names.
8. **Tests.** A fixture creates colleges A and B with identical natural keys. For every route, a member of A calls it with B's ids and must get `404` with no changes in B (AC-T1). The suite fails if a route is missing from the test table.

Platform administrators do not get tenant data access by role. Support access (PS, P2) is a time-limited grant approved by the college's CA, read-only (proposed, S5), visible to the college, and audited.

## 4. Authorization

- **Default deny.** Each route declares a policy; startup fails if one is missing.
- **Roles to capabilities.** Policies check capabilities (e.g. `draft.edit`, `version.publish`, `availability.editOwn`) derived from the roles in the membership, matching the matrix in `PRODUCT_REQUIREMENTS.md` section 2.3. The mapping lives in one module in `packages/contracts` so the web app can hide controls the user cannot use (the server still decides).
- **Scope.** Department-scoped roles (HOD, department-scoped TC) are checked against the loaded documents' department, not just the URL. Teachers act only on their own availability and see their own timetable plus views the college allows.
- **Separation of duties.** Publishing requires PR or CA; a TC cannot publish their own draft unless they also hold PR or CA (the same person holding both is allowed and audited).
- **State checks.** Closed terms, published versions, locked grids and expired undo windows are enforced in services and return `422 precondition_failed`.
- **Share links** (N1) grant read-only access to one section's published timetable; they cannot be used to reach any other endpoint and can be revoked.
- **Tests.** The authorization matrix test (AC-T3) covers every route × role, including scope cases (HOD of another department, teacher accessing another teacher).

## 5. Input validation and injection

- **Zod at the boundary.** Params, query and body parsed with strict schemas from `packages/contracts`: unknown keys rejected, strings length-limited, numbers bounded, enums closed, ids checked as 24-hex.
- **NoSQL injection.** Request values are never used as query objects. Mongoose `sanitizeFilter` and `strictQuery` are on; keys starting with `$` or containing `.` are rejected by validation. Search uses escaped, anchored, length-limited patterns.
- **Size limits.** JSON 1 MB, CSV 5 MB and 5,000 rows, at most 100 operations per draft request, at most 200 items per page.
- **CSV import.** Parsed in memory with row, column and cell-length limits; UTF-8 required (BOM tolerated); the file is not stored. Values are validated per column with plain-language errors.
- **CSV export.** Cells starting with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with `'` to stop formula execution in spreadsheet programs.
- **Output encoding.** React escapes text; `dangerouslySetInnerHTML` is forbidden by lint rule. API responses are JSON only. `Content-Disposition` filenames are generated, never taken from input.
- **Regular expressions** are bounded and reviewed for catastrophic backtracking.

## 6. Browser and transport security

| Control | Design |
| --- | --- |
| HTTPS | Everywhere; HSTS with a long max-age once the domain is final (S9) |
| CORS | Exact allowed origins from configuration; credentials only on `/auth/refresh` and `/auth/logout`; no wildcard |
| CSRF | API calls authenticate with a bearer header, which browsers do not attach automatically, so they are not CSRF-prone. The cookie-authenticated endpoints (`/auth/refresh`, `/auth/logout`) require a custom header (`X-Requested-With`), an `Origin` from the allow-list, and the `SameSite` cookie attribute |
| Content Security Policy | Strict policy with nonces for Next.js scripts; `default-src 'self'`; `connect-src` limited to the API origin; `frame-ancestors 'none'`; no third-party scripts |
| Other headers | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying unused features, `Cross-Origin-Opener-Policy: same-origin` |
| Token storage | Access token in memory only; nothing sensitive in `localStorage` (CLAUDE.md rule) |
| Offline cache and shared phones | The service worker caches only the signed-in user's Today and Week views and the app shell, never admin data; caches are cleared on sign-out; offline pages show "signed in as" with a sign-out button |
| Demo mode | Uses invented data only and never talks to the API |

## 7. Data protection

- **Minimisation.** Staff: name, employee id, department, optional email and mobile. Students: none at MVP if N1 chooses share links; otherwise roll number, name, section, and a contact (D7) after legal review.
- **Masking.** Mobile numbers and emails are masked in lists and shown in full only to CA (and the person themselves).
- **Encryption.** TLS in transit; encryption at rest provided by the database service; MFA secrets additionally encrypted with an application key from the secret store.
- **Database users.** Separate database users per process with least privilege: `api` (read/write tenant collections; insert-only on `auditEvents`, `platformAuditEvents`, `versionEntries` through a custom role without `update` and `remove`), `worker` (as `api` plus job and outbox updates), `migrator` (schema and index changes, used only at deploy), `readonly` (support and reporting).
- **Residency.** Data stored in MongoDB Atlas, Mumbai (M8). Backups stay in the same region (to confirm with the plan). API and worker processing location: D4/N13 **OPEN**.
- **Logs.** No passwords, tokens, invite links, full mobile numbers, emails or student names in logs. Request bodies are not logged.
- **Retention and deletion.** Per S6, S7, D17 (**OPEN**). College offboarding (S15) exports the college's data and then deletes it.
- **Legal.** DPDP Act obligations, consent text, minors (students under 18 in some institutions) and breach notification are reviewed before the first real college (S11). No real personal data is used before then (CLAUDE.md).

## 8. Rate limiting (proposed values, D19)

Counters live in MongoDB (`rateLimits`, atomic upsert with TTL; no Redis, M6). Authentication endpoints **fail closed** if the counter store is unavailable; other endpoints fail open and log.

| Endpoint group | Limit (proposed) |
| --- | --- |
| `POST /auth/login` | 10 per IP per minute; 5 failures per account then 15-minute lock |
| `POST /auth/refresh` | 30 per session per hour |
| Invitation preview and accept, password reset | 10 per IP per hour |
| `POST /auth/password/forgot` (when enabled) | 3 per account per hour; 20 per IP per day; monthly SMS budget alert |
| Public share-link views (N1) | 60 per IP per minute |
| Import preview | 20 per college per hour |
| Generation | 1 active run per college; 30 runs per college per day |
| All other authenticated routes | 600 per user per minute |

## 9. Secrets, keys and supply chain

- Secrets only in environment variables from the host's secret store (N13); `.env*` files are git-ignored; an `.env.example` documents variable names only.
- Separate keys and database users per environment. Token signing keys have ids and can be rotated without downtime (old key accepted until its tokens expire).
- Dependencies: lockfile committed; new packages only with owner approval; `npm audit` in CI with no high or critical findings allowed; overrides for vulnerable transitive packages (as done for PostCSS, M10); a software bill of materials at release.
- CI never prints secrets; pull requests from forks get no secrets.

## 10. Audit

- Events listed in `PRODUCT_REQUIREMENTS.md` section 4.4 are written in the same transaction as the change they record.
- Insert-only at the database level (section 7). A per-college hash chain over events is a P2 option if stronger tamper evidence is needed (S14).
- CA and PR can search their college's audit log; PA sees platform events.

## 11. Verification

| Check | When |
| --- | --- |
| Two-college isolation suite (every route) | Every CI run from Phase 4 |
| Authorization matrix suite (every route × role) | Every CI run from Phase 5 |
| Token tests: expiry, wrong audience, wrong key, rotation reuse, revoked session, suspended membership | Phase 5 |
| Rate-limit and lockout tests, including store failure (fail closed) | Phase 5 |
| Injection tests: `$`-keys, oversized bodies, formula cells, malformed UTF-8 | Phases 4 and 6 |
| CSP and header check on every page | Phase 10 |
| Dependency and secret scanning | Every CI run |
| Independent penetration test, findings closed | Before the first real college (S12) |
| Restore drill | Before launch (S7) |

Until all of these pass and the production-readiness list in `PRODUCT_REQUIREMENTS.md` section 10 is complete, the system must not be described as production-ready or secure for real data.
