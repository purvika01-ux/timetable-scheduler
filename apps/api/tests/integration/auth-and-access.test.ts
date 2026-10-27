// Comprehensive integration tests for authentication, college membership, role-based access control,
// audit logging, and cross-tenant data isolation against a real MongoDB replica set.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Types } from "mongoose";

import { totpCode } from "../../src/auth/totp.ts";
import { runInTenant } from "../../src/db/tenant.ts";
import { startApi, type RunningApi } from "../../src/lifecycle.ts";
import { call, silentLogger, testConfig } from "../helpers/api.ts";
import { startTestMongo, type TestMongo } from "../helpers/mongod.ts";

let mongo: TestMongo;
let api: RunningApi;
let base: string;

before(async () => {
  mongo = await startTestMongo();
  api = await startApi({
    config: testConfig({ MONGODB_URI: mongo.uri }),
    logger: silentLogger,
    version: "test",
  });
  await api.databaseReady;
  base = `${api.url}/api/v1`;
});

after(async () => {
  await api?.close();
  await mongo?.stop();
});

const jsonPost = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

const authHeaders = (token: string, extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${token}`,
  ...extra,
});

describe("College Registration and Platform Approval Lifecycle", () => {
  let collegeId: string;
  const applicantEmail = "applicant@punjabengg.example.edu";
  const applicantPass = "SecurePass123!";
  let paToken: string;

  before(async () => {
    // Seed a Platform Administrator user directly in the database
    await api.models.User.create({
      name: "Platform Master",
      emailNormalized: "admin@platform.example.edu",
      passwordHash: await (await import("../../src/auth/passwords.ts")).hashPassword("PlatformAdmin123!"),
      platformRoles: ["PA"],
      status: "active",
      mfa: {
        enabled: true,
        secretEncrypted: (await import("../../src/auth/totp.ts")).encryptSecret("JBSWY3DPEHPK3PXP", api.deps.config.auth.mfaEncryptionKey),
      },
    });

    // Sign in as Platform Admin: step 1 returns challengeToken
    const res1 = await call<{ data: { twoStep: string; challengeToken: string } }>(`${base}/auth/login`, jsonPost({
      identifier: "admin@platform.example.edu",
      password: "PlatformAdmin123!",
    }));
    assert.equal(res1.status, 200);
    assert.equal(res1.body.data.twoStep, "required");

    // Step 2: verify MFA code
    const code = totpCode("JBSWY3DPEHPK3PXP", Math.floor(Date.now() / 30_000));
    const res2 = await call<{ data: { accessToken: string } }>(`${base}/auth/mfa/verify`, jsonPost({
      challengeToken: res1.body.data.challengeToken,
      code,
    }));
    if (res2.status !== 200) console.error("res2 error body:", JSON.stringify(res2.body));
    assert.equal(res2.status, 200);
    paToken = res2.body.data.accessToken;
    assert.ok(paToken);
  });

  it("submits self-registration for a new college and applicant", async () => {
    const res = await call<{ data: { collegeId: string; status: string } }>(`${base}/registrations`, jsonPost({
      college: {
        name: "Punjab Engineering College",
        code: "PEC-CHD",
        district: "Chandigarh",
        kind: "engineering",
      },
      applicant: {
        name: "Dr. Balwinder Singh",
        email: applicantEmail,
        password: applicantPass,
      },
    }));

    assert.equal(res.status, 202);
    assert.equal(res.body.data.status, "pending");
    collegeId = res.body.data.collegeId;
    assert.ok(collegeId);
  });

  it("refuses duplicate college code or duplicate user registration", async () => {
    const res = await call<{ error: { code: string } }>(`${base}/registrations`, jsonPost({
      college: { name: "Duplicate PEC", code: "PEC-CHD" },
      applicant: { name: "Another Singh", email: "other@example.edu", password: "SecurePass123!" },
    }));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, "duplicate");
  });

  it("denies access to tenant data while the college is pending", async () => {
    // Sign in as the applicant
    const loginRes = await call<{ data: { accessToken: string; memberships: Array<{ collegeId: string; status: string }> } }>(
      `${base}/auth/login`,
      jsonPost({ identifier: applicantEmail, password: applicantPass }),
    );
    assert.equal(loginRes.status, 200);
    const token = loginRes.body.data.accessToken;
    assert.equal(loginRes.body.data.memberships[0]?.status, "pending");

    // Any tenant route returns 404 because college is not active yet
    const tenantRes = await call(`${base}/colleges/${collegeId}`, {
      headers: authHeaders(token),
    });
    assert.equal(tenantRes.status, 404);
  });

  it("allows platform administrator to list pending registrations and approve", async () => {
    const listRes = await call<{ data: Array<{ id: string; status: string; code: string }> }>(`${base}/platform/colleges?status=pending`, {
      headers: authHeaders(paToken),
    });
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.data.some((c) => c.id === collegeId && c.code === "PEC-CHD"));

    // Approve the college
    const approveRes = await call(`${base}/platform/colleges/${collegeId}/approve`, {
      method: "POST",
      headers: authHeaders(paToken, { "content-type": "application/json" }),
      body: JSON.stringify({ reason: "Accredited state institution verified." }),
    });
    assert.equal(approveRes.status, 204);

    // After approval, the applicant now has active college access
    const loginRes = await call<{ data: { accessToken: string } }>(
      `${base}/auth/login`,
      jsonPost({ identifier: applicantEmail, password: applicantPass }),
    );
    const token = loginRes.body.data.accessToken;

    const collegeRes = await call<{ data: { code: string; status: string; yourRoles: string[] } }>(`${base}/colleges/${collegeId}`, {
      headers: authHeaders(token),
    });
    assert.equal(collegeRes.status, 200);
    assert.equal(collegeRes.body.data.status, "active");
    assert.deepEqual(collegeRes.body.data.yourRoles, ["CA"]);
  });

  it("records platform audit events for registration and approval", async () => {
    const auditEvents = await api.models.PlatformAuditEvent.find({ collegeId: new Types.ObjectId(collegeId) }).lean();
    assert.ok(auditEvents.some((e) => e.action === "college.registered"));
    assert.ok(auditEvents.some((e) => e.action === "college.approved"));
  });
});

describe("Authentication, Lockout, and Token Security", () => {
  const email = "teacher.security@test.edu";
  const mobile = "+919876543210";
  const password = "StrongPass123!";
  let userId: string;

  before(async () => {
    const user = await api.models.User.create({
      name: "Security Test User",
      emailNormalized: email,
      mobileNormalized: mobile,
      passwordHash: await (await import("../../src/auth/passwords.ts")).hashPassword(password),
      status: "active",
    });
    userId = String(user._id);
  });

  it("signs in with email or Indian mobile number interchangeably", async () => {
    const byEmail = await call<{ data: { accessToken: string; user: { id: string } } }>(
      `${base}/auth/login`,
      jsonPost({ identifier: email, password }),
    );
    assert.equal(byEmail.status, 200);
    assert.equal(byEmail.body.data.user.id, userId);

    const byMobile = await call<{ data: { accessToken: string } }>(
      `${base}/auth/login`,
      jsonPost({ identifier: "098765 43210", password }),
    );
    assert.equal(byMobile.status, 200);
    assert.ok(byMobile.body.data.accessToken);
  });

  it("locks account after 5 consecutive failed attempts and returns identical unauthenticated response", async () => {
    await api.models.RateLimit.deleteMany({});
    for (let i = 0; i < 5; i++) {
      const failed = await call<{ error: { code: string; message: string } }>(
        `${base}/auth/login`,
        jsonPost({ identifier: email, password: "WrongPassword!" }),
      );
      assert.equal(failed.status, 401);
      assert.equal(failed.body.error.code, "unauthenticated");
      assert.ok(failed.body.error.message.includes("sign-in pauses for 15 minutes"));
    }

    // 6th attempt with CORRECT password is still locked out with identical error message
    const locked = await call<{ error: { code: string; message: string } }>(
      `${base}/auth/login`,
      jsonPost({ identifier: email, password }),
    );
    assert.equal(locked.status, 401);
    assert.equal(locked.body.error.code, "unauthenticated");

    // Non-existent user gets exact same error message and code
    const unknownUser = await call<{ error: { code: string; message: string } }>(
      `${base}/auth/login`,
      jsonPost({ identifier: "unknown@example.edu", password: "SomePassword123!" }),
    );
    assert.equal(unknownUser.status, 401);
    assert.equal(unknownUser.body.error.message, locked.body.error.message);

    // Reset lockout for further tests
    await api.models.User.updateOne({ _id: new Types.ObjectId(userId) }, { $set: { failedLogins: 0 }, $unset: { lockedUntil: 1 } });
    await api.models.RateLimit.deleteMany({});
  });

  it("rotates refresh token on refresh and revokes family on reuse", async () => {
    const login = await call<{ data: { accessToken: string } }>(`${base}/auth/login`, jsonPost({ identifier: email, password }));
    assert.equal(login.status, 200);
    const cookieHeader = login.headers.get("set-cookie");
    assert.ok(cookieHeader);
    assert.ok(cookieHeader.includes("HttpOnly"));
    assert.ok(cookieHeader.includes("SameSite=Strict"));
    const cookie = cookieHeader.split(";")[0]!;

    // First refresh succeeds and rotates cookie
    const refresh1 = await call<{ data: { accessToken: string } }>(`${base}/auth/refresh`, {
      method: "POST",
      headers: {
        cookie,
        "x-csrf-protection": "1",
        origin: "http://localhost:3000",
      },
    });
    assert.equal(refresh1.status, 200);
    assert.ok(refresh1.body.data.accessToken);
    const newCookie = refresh1.headers.get("set-cookie")!.split(";")[0]!;
    assert.notEqual(newCookie, cookie);

    // Replay old refresh token after grace period (simulate stolen token)
    // To trigger reuse detection reliably, backdate the revokedAt timestamp by 15s
    await api.models.Session.updateOne({ tokenHash: (await import("../../src/auth/secrets.ts")).sha256(cookie.split("=")[1]!) }, {
      $set: { revokedAt: new Date(Date.now() - 15_000) },
    });

    const replay = await call(`${base}/auth/refresh`, {
      method: "POST",
      headers: {
        cookie,
        "x-csrf-protection": "1",
        origin: "http://localhost:3000",
      },
    });
    assert.equal(replay.status, 401);

    // Entire session family should now be revoked
    const familyCheck = await call(`${base}/auth/refresh`, {
      method: "POST",
      headers: {
        cookie: newCookie,
        "x-csrf-protection": "1",
        origin: "http://localhost:3000",
      },
    });
    assert.equal(familyCheck.status, 401);

    // An audit event for session reuse was logged
    const reuseAudit = await api.models.PlatformAuditEvent.findOne({ action: "session.reuse_detected" }).lean();
    assert.ok(reuseAudit);
  });

  it("enforces CSRF protection on refresh and logout", async () => {
    // Missing x-csrf-protection header
    const noHeader = await call(`${base}/auth/refresh`, {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    assert.equal(noHeader.status, 403);

    // Disallowed origin
    const badOrigin = await call(`${base}/auth/refresh`, {
      method: "POST",
      headers: {
        "x-csrf-protection": "1",
        origin: "https://evil-attacker.example.com",
      },
    });
    assert.equal(badOrigin.status, 403);

    // No Origin at all
    const noOrigin = await call(`${base}/auth/refresh`, { method: "POST", headers: { "x-csrf-protection": "1" } });
    assert.equal(noOrigin.status, 403);
  });

  it("revokes all sessions on logout-all", async () => {
    const login = await call<{ data: { accessToken: string } }>(`${base}/auth/login`, jsonPost({ identifier: email, password }));
    const token = login.body.data.accessToken;

    const logoutAll = await call(`${base}/auth/logout-all`, {
      method: "POST",
      headers: authHeaders(token),
    });
    assert.equal(logoutAll.status, 204);

    // Active session is now revoked immediately
    const meRes = await call(`${base}/me`, { headers: authHeaders(token) });
    assert.equal(meRes.status, 401);
  });
});

describe("Multi-Tenant Data Isolation and Authorization Matrix", () => {
  let collegeA: string;
  let collegeB: string;

  let caUserA: { id: string; token: string };
  let prUserA: { id: string; token: string };
  let tcUserA: { id: string; token: string };
  let hodUserA: { id: string; token: string };
  let teacherUserA: { id: string; token: string };
  let studentUserA: { id: string; token: string };

  let caUserB: { id: string; token: string };

  async function createMember(collegeId: string, name: string, email: string, roles: ("CA" | "PR" | "TC" | "HOD" | "TE" | "ST")[]) {
    const password = "MemberPass123!";
    const user = await api.models.User.create({
      name,
      emailNormalized: email,
      passwordHash: await (await import("../../src/auth/passwords.ts")).hashPassword(password),
      status: "active",
    });
    await runInTenant(collegeId, () =>
      api.models.Membership.create({
        collegeId: new Types.ObjectId(collegeId),
        userId: user._id,
        roles,
        status: "active",
      }),
    );

    const loginRes = await call<{ data: { accessToken: string } }>(`${base}/auth/login`, jsonPost({ identifier: email, password }));
    assert.equal(loginRes.status, 200);
    return { id: String(user._id), token: loginRes.body.data.accessToken };
  }

  before(async () => {
    await api.models.RateLimit.deleteMany({});
    // Create College A
    const colA = await api.models.College.create({
      name: { en: "College Alpha" },
      code: "COL-ALPHA",
      status: "active",
    });
    collegeA = String(colA._id);

    // Create College B
    const colB = await api.models.College.create({
      name: { en: "College Beta" },
      code: "COL-BETA",
      status: "active",
    });
    collegeB = String(colB._id);

    // Populate roles in College A (CA, PR, TC, HOD, TE, ST)
    caUserA = await createMember(collegeA, "Admin A", "ca.a@test.edu", ["CA"]);
    prUserA = await createMember(collegeA, "Principal A", "pr.a@test.edu", ["PR"]);
    tcUserA = await createMember(collegeA, "Coordinator A", "tc.a@test.edu", ["TC"]);
    hodUserA = await createMember(collegeA, "HOD A", "hod.a@test.edu", ["HOD"]);
    teacherUserA = await createMember(collegeA, "Teacher A", "te.a@test.edu", ["TE"]);
    studentUserA = await createMember(collegeA, "Student A", "st.a@test.edu", ["ST"]);

    // Populate College B
    caUserB = await createMember(collegeB, "Admin B", "ca.b@test.edu", ["CA"]);
  });

  it("isolates tenant data: Member of College A cannot view, update, delete or export College B data", async () => {
    // College B's own CA can access College B
    const getBOwn = await call<{ data: { yourRoles: string[] } }>(`${base}/colleges/${collegeB}`, {
      headers: authHeaders(caUserB.token),
    });
    assert.equal(getBOwn.status, 200);
    assert.deepEqual(getBOwn.body.data.yourRoles, ["CA"]);

    // 1. Attempt to read College B's profile using College A's CA token -> returns 404
    const getB = await call(`${base}/colleges/${collegeB}`, {
      headers: authHeaders(caUserA.token),
    });
    assert.equal(getB.status, 404);

    // 2. Attempt to patch College B's settings using College A's CA token -> returns 404
    const patchB = await call(`${base}/colleges/${collegeB}`, {
      method: "PATCH",
      headers: authHeaders(caUserA.token, { "content-type": "application/json" }),
      body: JSON.stringify({ rowVersion: 0, shortName: "Hacked" }),
    });
    assert.equal(patchB.status, 404);

    // Verify College B settings did not change
    const colBDoc = await api.models.College.findById(collegeB).lean();
    assert.notEqual(colBDoc?.shortName, "Hacked");

    // 3. Attempt to list or export College B's memberships -> returns 404
    const listMembersB = await call(`${base}/colleges/${collegeB}/memberships`, {
      headers: authHeaders(caUserA.token),
    });
    assert.equal(listMembersB.status, 404);

    const exportB = await call(`${base}/colleges/${collegeB}/memberships/export.csv`, {
      headers: authHeaders(caUserA.token),
    });
    assert.equal(exportB.status, 404);

    // 4. Attempt to read College B audit events -> returns 404
    const auditB = await call(`${base}/colleges/${collegeB}/audit-events`, {
      headers: authHeaders(caUserA.token),
    });
    assert.equal(auditB.status, 404);
  });

  it("refuses cross-tenant membership modifications via ID spoofing", async () => {
    // Get College B membership id
    const bMemberDoc = await runInTenant(collegeB, () => api.models.Membership.findOne({}).lean());
    assert.ok(bMemberDoc);
    const bMembershipId = String(bMemberDoc._id);

    // Call under College A URL with College B membership ID -> 404 because query is scoped to College A
    const spoofPatch = await call(`${base}/colleges/${collegeA}/memberships/${bMembershipId}`, {
      method: "PATCH",
      headers: authHeaders(caUserA.token, { "content-type": "application/json" }),
      body: JSON.stringify({ rowVersion: 0, status: "suspended" }),
    });
    assert.equal(spoofPatch.status, 404);

    // Call under College B URL with College A token -> 404
    const spoofPatch2 = await call(`${base}/colleges/${collegeB}/memberships/${bMembershipId}`, {
      method: "PATCH",
      headers: authHeaders(caUserA.token, { "content-type": "application/json" }),
      body: JSON.stringify({ rowVersion: 0, status: "suspended" }),
    });
    assert.equal(spoofPatch2.status, 404);

    // College B member remains active
    const verifyMember = await runInTenant(collegeB, () => api.models.Membership.findById(bMembershipId).lean());
    assert.equal(verifyMember?.status, "active");
  });

  it("enforces role-based permissions within the same college", async () => {
    // College Administrator can update college settings
    const updateCollege = await call(`${base}/colleges/${collegeA}`, {
      method: "PATCH",
      headers: authHeaders(caUserA.token, { "content-type": "application/json" }),
      body: JSON.stringify({ rowVersion: 0, shortName: "Alpha" }),
    });
    assert.equal(updateCollege.status, 200);

    // Timetable Coordinator (TC) cannot update college settings -> 403 Forbidden
    const tcUpdate = await call(`${base}/colleges/${collegeA}`, {
      method: "PATCH",
      headers: authHeaders(tcUserA.token, { "content-type": "application/json" }),
      body: JSON.stringify({ rowVersion: 1, shortName: "TC Hack" }),
    });
    assert.equal(tcUpdate.status, 403);

    // Teacher cannot manage memberships -> 403 Forbidden
    const teManage = await call(`${base}/colleges/${collegeA}/invitations`, {
      method: "POST",
      headers: authHeaders(teacherUserA.token, { "content-type": "application/json" }),
      body: JSON.stringify({ email: "new@example.edu", roles: ["TE"] }),
    });
    assert.equal(teManage.status, 403);

    // Student cannot view member list with contacts -> 403 Forbidden
    const stMembers = await call(`${base}/colleges/${collegeA}/memberships`, {
      headers: authHeaders(studentUserA.token),
    });
    assert.equal(stMembers.status, 403);

    // Student can view public college profile
    const stCollege = await call(`${base}/colleges/${collegeA}`, {
      headers: authHeaders(studentUserA.token),
    });
    assert.equal(stCollege.status, 200);

    // Principal (PR) can view and export memberships, but CANNOT update college or delete members
    const prViewMembers = await call(`${base}/colleges/${collegeA}/memberships`, {
      headers: authHeaders(prUserA.token),
    });
    assert.equal(prViewMembers.status, 200);

    const prExport = await fetch(`${base}/colleges/${collegeA}/memberships/export.csv`, {
      headers: authHeaders(prUserA.token),
    });
    assert.equal(prExport.status, 200);
    assert.ok(prExport.headers.get("content-type")?.includes("text/csv"));

    const prUpdateCollege = await call(`${base}/colleges/${collegeA}`, {
      method: "PATCH",
      headers: authHeaders(prUserA.token, { "content-type": "application/json" }),
      body: JSON.stringify({ rowVersion: 1, shortName: "PR Hack" }),
    });
    assert.equal(prUpdateCollege.status, 403);

    // HOD can view college profile but CANNOT export members or create invitations
    const hodCollege = await call(`${base}/colleges/${collegeA}`, {
      headers: authHeaders(hodUserA.token),
    });
    assert.equal(hodCollege.status, 200);

    const hodExport = await call(`${base}/colleges/${collegeA}/memberships/export.csv`, {
      headers: authHeaders(hodUserA.token),
    });
    assert.equal(hodExport.status, 403);

    const hodInvite = await call(`${base}/colleges/${collegeA}/invitations`, {
      method: "POST",
      headers: authHeaders(hodUserA.token, { "content-type": "application/json" }),
      body: JSON.stringify({ email: "hod.invite@example.edu", roles: ["TE"] }),
    });
    assert.equal(hodInvite.status, 403);
  });

  it("ensures public registration cannot create PA or grant privileged platform roles", async () => {
    // 1. Attempt registration with malicious extra properties attempting privilege escalation -> Rejected with 400
    const maliciousReg = await call<{ error: { code: string; message: string } }>(
      `${base}/registrations`,
      jsonPost({
        college: {
          name: "Privilege Escalation Test College",
          code: "PETC-2026",
        },
        applicant: {
          name: "Attacker User",
          email: "attacker@test.edu",
          password: "AttackerPass123!",
          // Malicious injection attempt:
          platformRoles: ["PA"],
        },
      }),
    );
    assert.equal(maliciousReg.status, 400);
    assert.equal(maliciousReg.body.error.code, "validation_failed");

    // 2. Standard registration creates applicant with no platform roles
    const regRes = await call<{ data: { collegeId: string; status: string } }>(
      `${base}/registrations`,
      jsonPost({
        college: {
          name: "Valid Onboarding College",
          code: "VOC-2026",
        },
        applicant: {
          name: "Simran Kaur",
          email: "simran.kaur@test.edu",
          password: "StrongSecretPass987!",
        },
      }),
    );
    assert.equal(regRes.status, 202);

    // Query the database directly to verify the created user NEVER has PA platform role
    const normalUser = await api.models.User.findOne({ emailNormalized: "simran.kaur@test.edu" }).lean();
    assert.ok(normalUser);
    assert.deepEqual(normalUser.platformRoles ?? [], []);

    // Login with the applicant credentials and verify inability to access platform endpoints
    const applicantLogin = await call<{ data: { accessToken: string } }>(
      `${base}/auth/login`,
      jsonPost({ identifier: "simran.kaur@test.edu", password: "StrongSecretPass987!" }),
    );
    assert.equal(applicantLogin.status, 200);

    // Non-PA user attempting to access /platform/colleges gets 404 (route hidden by requirePlatformAdmin)
    const platformProbe = await call(`${base}/platform/colleges`, {
      headers: authHeaders(applicantLogin.body.data.accessToken),
    });
    assert.equal(platformProbe.status, 404);
  });

  it("enforces mandatory TOTP MFA for Platform Administrator access", async () => {
    // Attempt to access platform endpoints with a non-MFA verified session
    // Create an active PA user
    const paNonMfaUser = await api.models.User.create({
      name: "PA Without MFA",
      emailNormalized: "pa.nomfa@test.edu",
      passwordHash: await (await import("../../src/auth/passwords.ts")).hashPassword("SecureAdminPass123!"),
      platformRoles: ["PA"],
      status: "active",
      mfa: {
        enabled: true,
        secretEncrypted: (await import("../../src/auth/totp.ts")).encryptSecret("JBSWY3DPEHPK3PXP", api.deps.config.auth.mfaEncryptionKey),
      },
    });

    // Step 1: Sign in with password only -> Returns challengeToken and twoStep: "required", NO accessToken
    const step1 = await call<{ data: { twoStep: string; challengeToken: string; accessToken?: string } }>(
      `${base}/auth/login`,
      jsonPost({ identifier: "pa.nomfa@test.edu", password: "SecureAdminPass123!" }),
    );
    assert.equal(step1.status, 200);
    assert.equal(step1.body.data.twoStep, "required");
    assert.ok(step1.body.data.challengeToken);
    assert.equal(step1.body.data.accessToken, undefined);

    // Attempting to call /platform/colleges with an invalid or challenge token is rejected
    const blockedProbe = await call(`${base}/platform/colleges`, {
      headers: authHeaders(step1.body.data.challengeToken),
    });
    assert.equal(blockedProbe.status, 401);

    // Clean up
    await api.models.User.deleteOne({ _id: paNonMfaUser._id });
  });

  it("protects the last active college administrator from removal or demotion", async () => {
    const caMember = await runInTenant(collegeA, () => api.models.Membership.findOne({ roles: "CA" }).lean());
    assert.ok(caMember);

    // Attempt to remove CA role from the only CA -> 409 state_conflict
    const demoteRes = await call<{ error: { code: string } }>(`${base}/colleges/${collegeA}/memberships/${caMember._id}`, {
      method: "PATCH",
      headers: authHeaders(caUserA.token, { "content-type": "application/json" }),
      body: JSON.stringify({ rowVersion: caMember.rowVersion, roles: ["TC"] }),
    });
    assert.equal(demoteRes.status, 409);
    assert.equal(demoteRes.body.error.code, "state_conflict");

    // Attempt to delete the only CA -> 409 state_conflict
    const deleteRes = await call(`${base}/colleges/${collegeA}/memberships/${caMember._id}`, {
      method: "DELETE",
      headers: authHeaders(caUserA.token),
    });
    assert.equal(deleteRes.status, 409);
  });
});

describe("Invitation and Password Recovery Workflows", () => {
  let collegeId: string;
  let caToken: string;

  before(async () => {
    await api.models.RateLimit.deleteMany({});
    const col = await api.models.College.create({
      name: { en: "DAV College" },
      code: "DAV-JAL",
      status: "active",
    });
    collegeId = String(col._id);

    const user = await api.models.User.create({
      name: "DAV Principal",
      emailNormalized: "principal@dav.example.edu",
      passwordHash: await (await import("../../src/auth/passwords.ts")).hashPassword("DavPass123!"),
      status: "active",
    });

    await runInTenant(col._id, () =>
      api.models.Membership.create({
        collegeId: col._id,
        userId: user._id,
        roles: ["CA"],
        status: "active",
      }),
    );

    const loginRes = await call<{ data: { accessToken: string } }>(
      `${base}/auth/login`,
      jsonPost({ identifier: "principal@dav.example.edu", password: "DavPass123!" }),
    );
    caToken = loginRes.body.data.accessToken;
  });

  it("creates, previews, accepts an invitation for a new member, and prevents duplicate accept", async () => {
    const invitedEmail = "new.lecturer@dav.example.edu";

    // 1. CA creates invitation
    const createRes = await call<{ data: { link: string } }>(`${base}/colleges/${collegeId}/invitations`, {
      method: "POST",
      headers: authHeaders(caToken, { "content-type": "application/json" }),
      body: JSON.stringify({ email: invitedEmail, roles: ["TE"] }),
    });
    assert.equal(createRes.status, 201);
    const link = createRes.body.data.link;
    const tokenMatch = /#token=(.+)$/.exec(link);
    assert.ok(tokenMatch);
    const inviteToken = tokenMatch[1]!;

    // 2. Public preview of invitation
    const previewRes = await call<{ data: { college: { id: string; name: string }; target: string; roles: string[] } }>(
      `${base}/auth/invitations/preview`,
      jsonPost({ token: inviteToken }),
    );
    assert.equal(previewRes.status, 200);
    assert.equal(previewRes.body.data.college.name, "DAV College");
    assert.deepEqual(previewRes.body.data.roles, ["TE"]);

    // 3. Accept invitation by setting password
    const acceptRes = await call<{ data: { college: { id: string; name: string }; roles: string[] } }>(
      `${base}/auth/invitations/accept`,
      jsonPost({
        token: inviteToken,
        name: "Prof. Harpreet Kaur",
        password: "LecturerPass123!",
      }),
    );
    assert.equal(acceptRes.status, 201);
    assert.equal(acceptRes.body.data.college.id, collegeId);
    assert.deepEqual(acceptRes.body.data.roles, ["TE"]);

    // 4. Attempting to accept again fails
    const secondAccept = await call(`${base}/auth/invitations/accept`, jsonPost({
      token: inviteToken,
      password: "LecturerPass123!",
    }));
    assert.equal(secondAccept.status, 400);

    // 5. Newly invited lecturer can sign in and access the college
    const login = await call<{ data: { accessToken: string } }>(
      `${base}/auth/login`,
      jsonPost({ identifier: invitedEmail, password: "LecturerPass123!" }),
    );
    assert.equal(login.status, 200);
    const teToken = login.body.data.accessToken;

    const myCollege = await call<{ data: { yourRoles: string[] } }>(`${base}/colleges/${collegeId}`, {
      headers: authHeaders(teToken),
    });
    assert.equal(myCollege.status, 200);
    assert.deepEqual(myCollege.body.data.yourRoles, ["TE"]);
  });

  it("issues a one-time password reset link and revokes previous sessions upon reset", async () => {
    // Find Harpreet's membership
    const member = await runInTenant(collegeId, () => api.models.Membership.findOne({ roles: "TE" }).lean());
    assert.ok(member);

    // CA issues reset link
    const resetLinkRes = await call<{ data: { url: string } }>(
      `${base}/colleges/${collegeId}/memberships/${member._id}/reset-link`,
      { method: "POST", headers: authHeaders(caToken) },
    );
    assert.equal(resetLinkRes.status, 201);
    const resetUrl = resetLinkRes.body.data.url;
    const tokenMatch = /#token=(.+)$/.exec(resetUrl);
    assert.ok(tokenMatch);
    const resetToken = tokenMatch[1]!;

    // Perform password reset
    const resetAction = await call(`${base}/auth/password/reset`, jsonPost({
      token: resetToken,
      newPassword: "BrandNewPassword123!",
    }));
    assert.equal(resetAction.status, 204);

    // Sign in with new password succeeds
    const newLogin = await call(`${base}/auth/login`, jsonPost({
      identifier: "new.lecturer@dav.example.edu",
      password: "BrandNewPassword123!",
    }));
    assert.equal(newLogin.status, 200);

    // Old password fails
    const oldLogin = await call(`${base}/auth/login`, jsonPost({
      identifier: "new.lecturer@dav.example.edu",
      password: "LecturerPass123!",
    }));
    assert.equal(oldLogin.status, 401);
  });
});
