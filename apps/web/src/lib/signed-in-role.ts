// The view a signed-in user gets, decided only by their college membership (the server's roles),
// never by the demo role switch. A person may hold several roles; the most capable view wins.
//
// HOD, TE and ST views need the account linked to its department, teacher record or section.
// Memberships do not carry that link yet, so those roles get an "unlinked" notice instead of
// someone else's timetable.

import type { Role } from "./store.tsx";

export function roleFromMembership(roles: readonly string[] | null): Role {
  if (!roles) return { kind: "unlinked", reason: "noCollege" };
  if (roles.includes("CA") || roles.includes("TC")) return { kind: "coordinator" };
  if (roles.includes("PR")) return { kind: "principal" };
  if (roles.includes("HOD")) return { kind: "unlinked", reason: "hod" };
  if (roles.includes("TE")) return { kind: "unlinked", reason: "teacher" };
  if (roles.includes("ST")) return { kind: "unlinked", reason: "student" };
  return { kind: "unlinked", reason: "noCollege" };
}

/** Where sign-in lands: platform administrators without a college go to the platform page. */
export function landingPath(platformRoles: readonly string[], hasCollege: boolean): string {
  if (platformRoles.includes("PA") && !hasCollege) return "/platform";
  return "/";
}
