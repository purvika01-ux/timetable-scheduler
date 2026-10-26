// A college's own settings, members, invitations, audit log and member export. Every function runs
// inside the college's tenant scope (set by requireMember), so tenant queries cannot reach another
// college; the college id always comes from the verified membership, never from the request body.

import { trusted, Types } from "mongoose";

import type { MemberContext } from "../auth/context.ts";
import { can, type CollegeRole } from "../auth/permissions.ts";
import { normalizeEmail, normalizeMobile, randomToken, sha256 } from "../auth/secrets.ts";
import { hashPassword, passwordProblems } from "../auth/passwords.ts";
import { runInTenant } from "../db/tenant.ts";
import { withTransaction } from "../db/transaction.ts";
import type { Deps } from "../deps.ts";
import { ApiError } from "../http/errors.ts";
import { auditCollege } from "./audit.service.ts";
import { maskContact, publicUser, type AuthService } from "./auth.service.ts";

export const INVITATION_DAYS = 7;

const memberNotFound = () => new ApiError(404, "not_found", "We couldn't find that member in this college.");
const conflict = (message: string) => new ApiError(409, "version_conflict", message);

interface Actor {
  userId: Types.ObjectId;
  member: MemberContext;
  requestId?: string;
}

export function createCollegeAccessService(deps: Deps, auth: AuthService) {
  const { models, db, now, config } = deps;
  const audit = (actor: Actor, action: string, target: { kind: string; id: string }, summary?: Record<string, unknown>, session?: import("mongoose").ClientSession) =>
    auditCollege(models, { action, target, actorUserId: actor.userId, actorRoles: actor.member.roles, summary, requestId: actor.requestId }, session);

  // ---- College ------------------------------------------------------------------------------

  async function getCollege(member: MemberContext) {
    const c = await models.College.findById(member.collegeId).lean();
    if (!c) throw new ApiError(404, "not_found", "We couldn't find that college.");
    return {
      id: String(c._id),
      name: c.name,
      shortName: c.shortName ?? null,
      code: c.code,
      district: c.district ?? null,
      kind: c.kind ?? null,
      status: c.status,
      settings: { timeFormat: c.settings?.timeFormat ?? "12h", publishUndoMinutes: c.settings?.publishUndoMinutes ?? 15 },
      rowVersion: c.rowVersion,
      yourRoles: member.roles,
    };
  }

  async function updateCollege(actor: Actor, input: { rowVersion: number; name?: { en: string; pa?: string }; shortName?: string; district?: string; settings?: { timeFormat?: "12h" | "24h" } }) {
    const set: Record<string, unknown> = {};
    if (input.name) set.name = input.name;
    if (input.shortName !== undefined) set.shortName = input.shortName;
    if (input.district !== undefined) set.district = input.district;
    if (input.settings?.timeFormat) set["settings.timeFormat"] = input.settings.timeFormat;
    await withTransaction(db.connection, async (session) => {
      const r = await models.College.updateOne({ _id: actor.member.collegeId, rowVersion: input.rowVersion }, { $set: set, $inc: { rowVersion: 1 } }, { session });
      if (r.matchedCount !== 1) throw conflict("Someone else changed the college settings. Reload to see their changes; yours were not saved.");
      await audit(actor, "college.updated", { kind: "college", id: String(actor.member.collegeId) }, { fields: Object.keys(set) }, session);
    });
    return getCollege(actor.member);
  }

  // ---- Members ------------------------------------------------------------------------------

  async function listMembers(member: MemberContext) {
    const memberships = await models.Membership.find().sort({ createdAt: 1 }).lean();
    const userIds = memberships.map((m) => m.userId);
    const users =
      userIds.length > 0
        ? new Map((await models.User.find({ _id: trusted({ $in: userIds }) }).lean()).map((u) => [String(u._id), u]))
        : new Map();
    const showContacts = can(member.roles, "members.manage");
    return memberships.map((m) => {
      const u = users.get(String(m.userId));
      return {
        id: String(m._id),
        userId: String(m.userId),
        name: u?.name ?? "(unknown)",
        email: showContacts ? (u?.email ?? null) : maskContact(u?.email),
        mobile: showContacts ? (u?.mobile ?? null) : maskContact(u?.mobile),
        accountStatus: u?.status ?? "disabled",
        roles: m.roles,
        status: m.status,
        rowVersion: m.rowVersion,
      };
    });
  }

  /** Refuse any change that would leave the college without an active administrator. */
  async function assertAnotherAdmin(excludingMembershipId: Types.ObjectId, session: import("mongoose").ClientSession) {
    const others = await models.Membership.countDocuments({ _id: trusted({ $ne: excludingMembershipId }), roles: "CA", status: "active" }).session(session);
    if (others === 0) throw new ApiError(409, "state_conflict", "This is the college's only active administrator. Make someone else an administrator first.");
  }

  async function updateMember(actor: Actor, membershipId: Types.ObjectId, input: { rowVersion: number; roles?: CollegeRole[]; status?: "active" | "suspended" }) {
    await withTransaction(db.connection, async (session) => {
      const existing = await models.Membership.findOne({ _id: membershipId }).session(session).lean();
      if (!existing || existing.status === "pending") throw memberNotFound();
      const losesAdmin =
        (existing.roles as string[]).includes("CA") &&
        existing.status === "active" &&
        ((input.roles && !input.roles.includes("CA")) || input.status === "suspended");
      if (losesAdmin) await assertAnotherAdmin(membershipId, session);
      const set: Record<string, unknown> = {};
      if (input.roles) set.roles = [...new Set(input.roles)];
      if (input.status) set.status = input.status;
      const r = await models.Membership.updateOne({ _id: membershipId, rowVersion: input.rowVersion }, { $set: set, $inc: { rowVersion: 1 } }, { session });
      if (r.matchedCount !== 1) throw conflict("Someone else changed this member. Reload to see their changes; yours were not saved.");
      await audit(actor, "membership.updated", { kind: "membership", id: String(membershipId) }, { before: { roles: existing.roles, status: existing.status }, after: set }, session);
    });
    return (await listMembers(actor.member)).find((m) => m.id === String(membershipId))!;
  }

  async function removeMember(actor: Actor, membershipId: Types.ObjectId) {
    await withTransaction(db.connection, async (session) => {
      const existing = await models.Membership.findOne({ _id: membershipId }).session(session).lean();
      if (!existing || existing.status === "pending") throw memberNotFound();
      if ((existing.roles as string[]).includes("CA") && existing.status === "active") await assertAnotherAdmin(membershipId, session);
      await models.Membership.deleteOne({ _id: membershipId }, { session });
      await audit(actor, "membership.removed", { kind: "membership", id: String(membershipId) }, { userId: String(existing.userId), roles: existing.roles }, session);
    });
  }

  /**
   * A college administrator may issue a reset link only for someone who belongs to this college
   * alone; otherwise one college could take over an account another college relies on.
   */
  async function issueResetLink(actor: Actor, membershipId: Types.ObjectId) {
    const m = await models.Membership.findOne({ _id: membershipId }).lean();
    if (!m || m.status === "pending") throw memberNotFound();
    const user = await models.User.findById(m.userId, { platformRoles: 1 }).lean();
    const elsewhere = await models.Membership.countDocuments({ userId: m.userId, collegeId: trusted({ $ne: actor.member.collegeId }) }).setOptions({ platformScope: true });
    if (elsewhere > 0 || user?.platformRoles?.length) {
      throw new ApiError(409, "state_conflict", "This person also belongs to another college or the platform team, so only the platform team can reset their password.");
    }
    const link = await auth.issueResetLink(m.userId, actor.userId, actor.member.collegeId);
    await audit(actor, "password_reset_link.issued", { kind: "user", id: String(m.userId) });
    return { url: link.url, expiresAt: link.expiresAt };
  }

  /** CSV of members for administrators and principals. Cells that spreadsheets would run as formulas are escaped. */
  async function exportMembersCsv(actor: Actor): Promise<string> {
    const rows = await listMembers(actor.member);
    await audit(actor, "members.exported", { kind: "college", id: String(actor.member.collegeId) }, { rows: rows.length });
    const cell = (v: unknown) => {
      let s = v === null || v === undefined ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [["Name", "Email", "Mobile", "Roles", "Membership", "Account"], ...rows.map((r) => [r.name, r.email, r.mobile, r.roles.join(" "), r.status, r.accountStatus])];
    return lines.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
  }

  async function listAudit(limit: number) {
    const events = await models.AuditEvent.find().sort({ at: -1 }).limit(limit).lean();
    return events.map((e) => ({ id: String(e._id), action: e.action, target: e.target, actorUserId: e.actor?.userId ? String(e.actor.userId) : null, at: e.at, summary: e.summary ?? null }));
  }

  // ---- Invitations ---------------------------------------------------------------------------

  async function createInvitation(actor: Actor, input: { email?: string; mobile?: string; roles: CollegeRole[] }) {
    const email = normalizeEmail(input.email);
    const mobile = normalizeMobile(input.mobile);
    if (input.mobile && !mobile) throw new ApiError(400, "validation_failed", "Check the mobile number.", [{ path: "body.mobile", code: "invalid", message: "is not a valid Indian mobile number" }]);
    if (!email === !mobile) throw new ApiError(400, "validation_failed", "Enter either an email address or a mobile number.", [{ path: "body.email", code: "invalid", message: "enter exactly one of email or mobile" }]);
    const existingUser = await models.User.findOne(email ? { emailNormalized: email } : { mobileNormalized: mobile }, { _id: 1 }).lean();
    if (existingUser && (await models.Membership.exists({ userId: existingUser._id }))) {
      throw new ApiError(409, "duplicate", "This person is already a member of the college. Change their roles instead.");
    }
    const token = randomToken();
    const expiresAt = new Date(now().getTime() + INVITATION_DAYS * 86_400_000);
    const created = await withTransaction(db.connection, async (session) => {
      const [inv] = await models.Invitation.create([{ tokenHash: sha256(token), target: email ? { email } : { mobile: mobile! }, roles: [...new Set(input.roles)], invitedBy: actor.userId, expiresAt }], { session });
      await audit(actor, "invitation.created", { kind: "invitation", id: String(inv!._id) }, { roles: inv!.roles }, session);
      return inv!;
    });
    return { invitation: invitationView(created), link: `${config.auth.publicAppUrl}/invite#token=${token}` };
  }

  function invitationView(inv: { _id: Types.ObjectId; target?: { email?: string | null; mobile?: string | null } | null; roles: string[]; expiresAt: Date; acceptedAt?: Date | null; revokedAt?: Date | null; createdAt?: Date }) {
    const at = now().getTime();
    return {
      id: String(inv._id),
      email: inv.target?.email ?? null,
      mobile: inv.target?.mobile ?? null,
      roles: inv.roles,
      expiresAt: inv.expiresAt,
      status: inv.acceptedAt ? "accepted" : inv.revokedAt ? "revoked" : inv.expiresAt.getTime() <= at ? "expired" : "pending",
    };
  }

  async function listInvitations() {
    const invitations = await models.Invitation.find().sort({ createdAt: -1 }).limit(200).lean();
    return invitations.map(invitationView);
  }

  async function revokeInvitation(actor: Actor, invitationId: Types.ObjectId) {
    await withTransaction(db.connection, async (session) => {
      const r = await models.Invitation.updateOne({ _id: invitationId, acceptedAt: null, revokedAt: null }, { $set: { revokedAt: now() } }, { session });
      if (r.matchedCount !== 1) throw new ApiError(404, "not_found", "We couldn't find a pending invitation with that id in this college.");
      await audit(actor, "invitation.revoked", { kind: "invitation", id: String(invitationId) }, undefined, session);
    });
  }

  // ---- Accepting an invitation (public: the token is the authority) -------------------------

  async function findInvitation(token: string) {
    const inv = await models.Invitation.findOne({ tokenHash: sha256(token) }).setOptions({ platformScope: true }).lean();
    const invalid = () => new ApiError(400, "bad_request", "This invitation link is not valid. Ask your college administrator for a new one.");
    if (!inv) throw invalid();
    if (inv.acceptedAt) throw new ApiError(400, "bad_request", "This invitation has already been used. Sign in instead.");
    if (inv.revokedAt) throw invalid();
    if (inv.expiresAt.getTime() <= now().getTime()) throw new ApiError(400, "bad_request", "This invitation has expired. Ask your college administrator to send a new one.");
    const college = await models.College.findById(inv.collegeId, { name: 1, status: 1 }).lean();
    if (!college || college.status !== "active") throw invalid();
    return { inv, college };
  }

  async function previewInvitation(token: string) {
    const { inv, college } = await findInvitation(token);
    const filter = inv.target?.email ? { emailNormalized: inv.target.email } : { mobileNormalized: inv.target!.mobile! };
    const accountExists = Boolean(await models.User.exists(filter));
    return {
      college: { id: String(college._id), name: college.name.en },
      roles: inv.roles,
      sentTo: inv.target?.email ?? maskContact(inv.target?.mobile),
      expiresAt: inv.expiresAt,
      accountExists,
    };
  }

  /**
   * New people create their account (the email or mobile comes from the invitation, not the form).
   * People with an account must be signed in as the invited email or mobile.
   */
  async function acceptInvitation(token: string, signedInUserId: Types.ObjectId | null, input: { name?: string; password?: string }, requestId?: string) {
    const { inv, college } = await findInvitation(token);
    const target = inv.target?.email ? { emailNormalized: inv.target.email } : { mobileNormalized: inv.target!.mobile! };
    const existing = await models.User.findOne(target).lean();

    let newUser: { name: string; passwordHash: string } | null = null;
    if (existing) {
      if (!signedInUserId || String(signedInUserId) !== String(existing._id)) {
        throw new ApiError(401, "unauthenticated", "You already have an account with this email or mobile number. Sign in with it, then open the invitation again.");
      }
    } else {
      if (signedInUserId) throw new ApiError(409, "state_conflict", "This invitation is for a different email or mobile number than the account you are signed in with. Sign out first.");
      if (!input.name?.trim() || !input.password) {
        throw new ApiError(400, "validation_failed", "Enter your name and choose a password.", [
          ...(!input.name?.trim() ? [{ path: "body.name", code: "required", message: "is required" }] : []),
          ...(!input.password ? [{ path: "body.password", code: "required", message: "is required" }] : []),
        ]);
      }
      const problems = await passwordProblems(input.password, { name: input.name, email: inv.target?.email, mobile: inv.target?.mobile });
      if (problems.length > 0) throw new ApiError(400, "validation_failed", "Choose a different password.", problems.map((message) => ({ path: "body.password", code: "password_policy", message })));
      newUser = { name: input.name.trim(), passwordHash: await hashPassword(input.password) };
    }

    const result = await withTransaction(db.connection, async (session) => {
      const claimed = await models.Invitation.updateOne({ _id: inv._id, acceptedAt: null, revokedAt: null }, { $set: { acceptedAt: now() } }).setOptions({ platformScope: true }).session(session);
      if (claimed.modifiedCount !== 1) throw new ApiError(400, "bad_request", "This invitation has already been used. Sign in instead.");
      let userId = existing?._id;
      if (newUser) {
        const contact = inv.target?.email ? { email: inv.target.email, emailNormalized: inv.target.email } : { mobile: inv.target!.mobile!, mobileNormalized: inv.target!.mobile! };
        const [u] = await models.User.create([{ ...contact, ...newUser }], { session });
        userId = u!._id;
      }
      await runInTenant(inv.collegeId, async () => {
        if (await models.Membership.exists({ userId }).session(session)) throw new ApiError(409, "duplicate", "You are already a member of this college.");
        const [m] = await models.Membership.create([{ userId, roles: inv.roles, status: "active", invitedBy: inv.invitedBy }], { session });
        await models.Invitation.updateOne({ _id: inv._id }, { $set: { acceptedBy: userId } }, { session });
        await auditCollege(models, { action: "invitation.accepted", target: { kind: "membership", id: String(m!._id) }, actorUserId: userId, actorRoles: inv.roles, requestId }, session);
      });
      return { userId: userId! };
    });
    const user = await models.User.findById(result.userId).lean();
    return { user: publicUser(user!), college: { id: String(college._id), name: college.name.en }, roles: inv.roles, accountCreated: newUser !== null };
  }

  return {
    getCollege,
    updateCollege,
    listMembers,
    updateMember,
    removeMember,
    issueResetLink,
    exportMembersCsv,
    listAudit,
    createInvitation,
    listInvitations,
    revokeInvitation,
    previewInvitation,
    acceptInvitation,
  };
}

export type CollegeAccessService = ReturnType<typeof createCollegeAccessService>;
