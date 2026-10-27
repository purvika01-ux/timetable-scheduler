// Roles to capabilities (PRODUCT_REQUIREMENTS.md section 2.3). The server decides every request
// from the caller's database membership; the web app may use the same map only to hide controls.
//
// Platform administrators have NO college capabilities by role: they act on a college only through
// platform routes, or through an ordinary membership like anyone else.

export const COLLEGE_ROLES = ["CA", "PR", "TC", "HOD", "TE", "ST"] as const;
export type CollegeRole = (typeof COLLEGE_ROLES)[number];

export const ROLE_LABELS: Record<CollegeRole, string> = {
  CA: "College administrator",
  PR: "Principal",
  TC: "Timetable coordinator",
  HOD: "Head of department",
  TE: "Teacher",
  ST: "Student",
};

export const CAPABILITIES = [
  "college.view",
  "college.update",
  "members.view",
  "members.manage",
  "members.export",
  "invitations.manage",
  "audit.view",
  "passwordReset.issue",
  /** Time grid, timetable and the names it shows; no contact details or availability. */
  "timetable.view",
  /** All master data, including teachers' contact details and availability. */
  "academic.view",
  "academic.manage",
  "availability.manage",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<CollegeRole, readonly Capability[]> = {
  CA: CAPABILITIES,
  // PR views master data and timetables; publishing arrives with versions (Phase 8).
  PR: ["college.view", "members.view", "members.export", "audit.view", "timetable.view", "academic.view"],
  TC: ["college.view", "timetable.view", "academic.view", "academic.manage", "availability.manage"],
  // HOD edits are department-scoped (D) in the matrix; until memberships carry that scope, view only.
  HOD: ["college.view", "timetable.view", "academic.view"],
  // TE edits only their own availability (O); until a membership is linked to its teacher record, none.
  TE: ["college.view", "timetable.view"],
  ST: ["college.view", "timetable.view"],
};

/** Union of the capabilities of every role held (a person may hold several roles). */
export function capabilitiesOf(roles: readonly string[]): Set<Capability> {
  const caps = new Set<Capability>();
  for (const role of roles) for (const c of ROLE_CAPABILITIES[role as CollegeRole] ?? []) caps.add(c);
  return caps;
}

export function can(roles: readonly string[], capability: Capability): boolean {
  return capabilitiesOf(roles).has(capability);
}

/** Roles a college administrator may grant through invitations or membership changes. */
export const GRANTABLE_ROLES: readonly CollegeRole[] = COLLEGE_ROLES;

/** Users holding any of these roles get the stricter staff session timeouts (M19). */
export const STAFF_ROLES: readonly string[] = ["CA", "PR", "TC", "HOD"];
