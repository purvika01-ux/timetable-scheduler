"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { useNow, useWorkspace, type Role } from "@/lib/store";

import { Icon, type IconName } from "./icons";
import { Banner, cx, Stamp } from "./ui";

type NavItem = { href: string; label: string; short: string; icon: IconName; phone?: boolean };

const COORDINATOR_NAV: NavItem[] = [
  { href: "/", label: "Home", short: "Home", icon: "dashboard", phone: true },
  { href: "/setup", label: "Set up college", short: "Setup", icon: "settings", phone: true },
  { href: "/generate", label: "Generate", short: "Generate", icon: "generate", phone: true },
  { href: "/timetable", label: "Timetable", short: "Timetable", icon: "calendar", phone: true },
  { href: "/reports", label: "Reports", short: "Reports", icon: "chart", phone: true },
  { href: "/data", label: "Save and open", short: "Data", icon: "download" },
];

const PRINCIPAL_NAV: NavItem[] = [
  { href: "/", label: "Executive Dashboard", short: "Home", icon: "dashboard", phone: true },
  { href: "/timetable", label: "Master Timetable", short: "Timetable", icon: "calendar", phone: true },
  { href: "/reports", label: "Institutional Reports", short: "Reports", icon: "chart", phone: true },
  { href: "/data", label: "College Data Archive", short: "Data", icon: "download" },
];

const HOD_NAV: NavItem[] = [
  { href: "/", label: "Department Dashboard", short: "Home", icon: "dashboard", phone: true },
  { href: "/timetable", label: "Department Timetable", short: "Timetable", icon: "calendar", phone: true },
  { href: "/reports", label: "Department Reports", short: "Reports", icon: "chart", phone: true },
];

const TEACHER_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", short: "Home", icon: "dashboard", phone: true },
  { href: "/timetable", label: "My Timetable", short: "Timetable", icon: "calendar", phone: true },
  { href: "/availability", label: "My Availability", short: "Availability", icon: "availability", phone: true },
  { href: "/profile", label: "Profile", short: "Profile", icon: "user", phone: true },
];

const STUDENT_NAV: NavItem[] = [
  { href: "/", label: "Class Schedule", short: "Home", icon: "dashboard", phone: true },
  { href: "/timetable", label: "Weekly Timetable", short: "Timetable", icon: "calendar", phone: true },
];

function RoleSwitcher({ id }: { id: string }) {
  const { dataset, role, setRole } = useWorkspace();
  const value =
    role.kind === "portal"
      ? "portal"
      : role.kind === "coordinator"
        ? "coordinator"
        : role.kind === "principal"
          ? "principal"
          : role.kind === "hod"
            ? `hod:${role.departmentId}`
            : role.kind === "teacher"
              ? `teacher:${role.teacherId}`
              : role.kind === "student"
                ? `student:${role.sectionId}`
                : "portal";

  return (
    <div className="flex items-center gap-1.5">
      <label className="flex items-center gap-1 text-xs text-ink-muted" htmlFor={id}>
        <span className="hidden whitespace-nowrap sm:inline font-medium">Role:</span>
        <select
          id={id}
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "portal") {
              setRole({ kind: "portal" });
            } else if (v === "coordinator") {
              setRole({ kind: "coordinator" });
            } else if (v === "principal") {
              setRole({ kind: "principal" });
            } else if (v.startsWith("hod:")) {
              setRole({ kind: "hod", departmentId: v.slice("hod:".length) });
            } else if (v.startsWith("teacher:")) {
              setRole({ kind: "teacher", teacherId: v.slice("teacher:".length) });
            } else if (v.startsWith("student:")) {
              setRole({ kind: "student", sectionId: v.slice("student:".length) });
            }
          }}
          className="h-9 max-w-40 rounded-md border border-line bg-white px-2 text-xs font-medium text-ink sm:max-w-60 focus:border-primary focus:outline-none"
          aria-label="Role: choose whose view of the app to see"
        >
          <option value="portal">✦ Role Selection Portal</option>
          <option value="coordinator">⚙️ Coordinator</option>
          <option value="principal">🎓 Principal / Admin</option>
          {dataset.departments.length > 0 && (
            <optgroup label="Head of Department (HOD)">
              {dataset.departments.map((d) => (
                <option key={d.id} value={`hod:${d.id}`}>
                  🏢 HOD: {d.name} ({d.code})
                </option>
              ))}
            </optgroup>
          )}
          {dataset.teachers.length > 0 && (
            <optgroup label="Teacher">
              {dataset.teachers.map((t) => (
                <option key={t.id} value={`teacher:${t.id}`}>
                  👨‍🏫 {t.name}
                </option>
              ))}
            </optgroup>
          )}
          {dataset.sections.length > 0 && (
            <optgroup label="Student">
              {dataset.sections.map((s) => (
                <option key={s.id} value={`student:${s.id}`}>
                  🎒 Section {s.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <button
        type="button"
        onClick={() => setRole({ kind: "portal" })}
        className="inline-flex h-9 items-center gap-1 rounded-md border border-line bg-white px-2.5 text-xs font-semibold text-ink hover:bg-surface shadow-2xs"
        title="Return to Role Selection Gateway"
      >
        <Icon name="refresh" className="h-3.5 w-3.5 text-primary" />
        <span className="hidden lg:inline">Switch Role</span>
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, dataset, role, notices, dismissNotices } = useWorkspace();
  const { user, status, activeCollege } = useAuth();
  const now = useNow();

  const userRoles = activeCollege?.roles ?? [];

  let effectiveNav: NavItem[] = COORDINATOR_NAV;
  let roleLabel = "Coordinator";

  if (role.kind === "portal") {
    effectiveNav = [{ href: "/", label: "Role Portal", short: "Portal", icon: "sparkle", phone: true }];
    roleLabel = "Role Portal";
  } else if (role.kind === "coordinator") {
    effectiveNav = COORDINATOR_NAV;
    roleLabel = "Timetable Coordinator";
  } else if (role.kind === "principal") {
    effectiveNav = PRINCIPAL_NAV;
    roleLabel = "Principal / Admin";
  } else if (role.kind === "hod") {
    effectiveNav = HOD_NAV;
    const dept = dataset.departments.find((d) => d.id === role.departmentId);
    roleLabel = dept ? `HOD (${dept.code})` : "Head of Department";
  } else if (role.kind === "teacher") {
    effectiveNav = TEACHER_NAV;
    const teacher = dataset.teachers.find((t) => t.id === role.teacherId);
    roleLabel = teacher ? `Teacher (${teacher.name.split(" ")[0]})` : "Teacher";
  } else if (role.kind === "student") {
    effectiveNav = STUDENT_NAV;
    const sec = dataset.sections.find((s) => s.id === role.sectionId);
    roleLabel = sec ? `Student (${sec.name})` : "Student";
  }

  // Signed in, `role` already comes from the membership (lib/signed-in-role.ts); only labels differ.
  if (status === "authenticated" && user) {
    if (user.platformRoles.includes("PA") && !activeCollege) {
      effectiveNav = [];
      roleLabel = "Platform Admin";
    } else if (role.kind === "coordinator") {
      roleLabel = userRoles.includes("CA") ? "College Administrator" : "Timetable Coordinator";
    } else if (role.kind === "principal") {
      roleLabel = "Principal";
    } else if (role.kind === "unlinked") {
      effectiveNav =
        role.reason === "hod"
          ? [HOME_NAV, { href: "/timetable", label: "Timetable", short: "Timetable", icon: "calendar", phone: true }]
          : [HOME_NAV];
      roleLabel = UNLINKED_LABEL[role.reason];
    }
  }

  const phoneNav = effectiveNav.filter((n) => n.phone);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="min-h-screen bg-surface">
      <a
        href="#main"
        className="no-print sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      {/* Sidebar: tablet and desktop */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-white md:flex">
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-primary text-white" aria-hidden="true">
            <Icon name="calendar" className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold leading-tight text-ink">
            College Timetable
            <br />
            Optimizer
          </span>
        </div>
        <nav aria-label="Main" className="flex-1 px-3 py-4 space-y-4">
          {effectiveNav.length > 0 && (
            <div>
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {roleLabel}
              </p>
              <ul className="space-y-1">
                {effectiveNav.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cx(
                          "relative flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                          active ? "bg-blue-50 text-primary" : "text-ink-muted hover:bg-surface hover:text-ink",
                        )}
                      >
                        {active && <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-primary" aria-hidden="true" />}
                        <Icon name={item.icon} className="h-[18px] w-[18px]" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              Account & Security
            </p>
            <ul className="space-y-1">
              {status === "authenticated" && user ? (
                <>
                  {user.platformRoles.includes("PA") && (
                    <li>
                      <Link
                        href="/platform"
                        aria-current={pathname === "/platform" ? "page" : undefined}
                        className={cx(
                          "relative flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                          pathname === "/platform" ? "bg-purple-50 text-purple-800" : "text-ink-muted hover:bg-surface hover:text-ink",
                        )}
                      >
                        {pathname === "/platform" && <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-purple-600" aria-hidden="true" />}
                        <Icon name="dashboard" className="h-[18px] w-[18px]" />
                        Platform Dashboard
                      </Link>
                    </li>
                  )}
                  <li>
                    <Link
                      href="/account"
                      aria-current={pathname === "/account" ? "page" : undefined}
                      className={cx(
                        "relative flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                        pathname === "/account" ? "bg-blue-50 text-primary" : "text-ink-muted hover:bg-surface hover:text-ink",
                      )}
                    >
                      {pathname === "/account" && <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-primary" aria-hidden="true" />}
                      <Icon name="user" className="h-[18px] w-[18px]" />
                      Account & Roles
                    </Link>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <Link
                      href="/login"
                      aria-current={pathname === "/login" ? "page" : undefined}
                      className={cx(
                        "relative flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                        pathname === "/login" ? "bg-blue-50 text-primary" : "text-ink-muted hover:bg-surface hover:text-ink",
                      )}
                    >
                      <Icon name="user" className="h-[18px] w-[18px]" />
                      Sign in
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/register"
                      aria-current={pathname === "/register" ? "page" : undefined}
                      className={cx(
                        "relative flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                        pathname === "/register" ? "bg-blue-50 text-primary" : "text-ink-muted hover:bg-surface hover:text-ink",
                      )}
                    >
                      <Icon name="settings" className="h-[18px] w-[18px]" />
                      Register College
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>
        </nav>
        <div className="border-t border-line px-5 py-4 text-xs text-ink-muted">
          {status === "authenticated" && user ? (
            <>
              <Stamp tone="success">Signed in</Stamp>
              <p className="mt-2 leading-relaxed">
                {user.name}
                {activeCollege ? ` · ${activeCollege.collegeName}` : ""}
              </p>
            </>
          ) : null}
        </div>
      </aside>

      <div className="md:pl-60">
        <header className="no-print sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex min-h-14 max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-6">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-white md:hidden" aria-hidden="true">
              <Icon name="calendar" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink" title={dataset.college.name}>
                {status === "authenticated" && activeCollege
                  ? activeCollege.collegeName
                  : dataset.college.name || "New college (not named yet)"}
              </p>
              <p className="truncate text-xs text-ink-muted">
                {dataset.college.semesterLabel}
                {now && (
                  <span className="hidden sm:inline">
                    {dataset.college.semesterLabel ? " · " : ""}
                    {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </span>
                )}
              </p>
            </div>
            {status === "authenticated" && user ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/account"
                  className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface"
                >
                  {user.name} ({activeCollege?.roles?.join(", ") ?? "User"})
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
                >
                  Sign In
                </Link>
                {ready && <RoleSwitcher id="role-switcher" />}
              </div>
            )}
          </div>
        </header>

        <main id="main" className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-12">
          {notices.length > 0 && (
            <div className="no-print mb-6">
              <Banner tone="warning" title="Some saved data was reset" onDismiss={dismissNotices}>
                <ul className="list-disc pl-4">
                  {notices.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </Banner>
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Bottom tab bar: phones */}
      <nav aria-label="Main" className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white md:hidden">
        <ul className={cx("grid", phoneNav.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
          {phoneNav.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                    active ? "text-primary" : "text-ink-muted",
                  )}
                >
                  <Icon name={item.icon} className="h-5 w-5" />
                  <span className={cx(active && "underline decoration-2 underline-offset-4")}>{item.short}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

const HOME_NAV: NavItem = { href: "/", label: "Home", short: "Home", icon: "dashboard", phone: true };

const UNLINKED_LABEL: Record<Extract<Role, { kind: "unlinked" }>["reason"], string> = {
  hod: "Head of Department",
  teacher: "Teacher",
  student: "Student",
  noCollege: "No college",
};

/** Signed in, but the account is not linked to the record its role needs yet. */
export function UnlinkedNotice({ reason }: { reason: Extract<Role, { kind: "unlinked" }>["reason"] }) {
  const { activeCollege } = useAuth();
  const college = activeCollege?.collegeName ?? "your college";
  const text =
    reason === "noCollege"
      ? "Your account is not a member of a college yet. Accept an invitation from your college administrator, or register a college."
      : reason === "hod"
        ? `Your account in ${college} is not linked to a department yet, so there is no department view. You can open the college timetable (read only). Ask your college administrator to link your department.`
        : reason === "teacher"
          ? `Your account in ${college} is not linked to a teacher record yet, so your own timetable and availability cannot be shown. Ask your college administrator to link it.`
          : `Your account in ${college} is not linked to a section yet, so your section's timetable cannot be shown. Ask your college administrator to link it.`;
  return (
    <div className="rounded-xl border border-line bg-white px-6 py-12 text-center shadow-xs">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
        <Icon name="info" className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-bold text-ink">{reason === "noCollege" ? "No college yet" : "Your account is not linked yet"}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">{text}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link
          href="/account"
          className="inline-flex min-h-10 items-center rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-surface"
        >
          Your account
        </Link>
      </div>
    </div>
  );
}

/** Shown when a page belongs to another role: in the demo it offers the switch, signed in it does not. */
export function RoleNotice({ needs }: { needs: Role["kind"] }) {
  const { dataset, setRole, isDemo } = useWorkspace();
  const label =
    needs === "coordinator"
      ? "Timetable Coordinator"
      : needs === "principal"
        ? "Principal"
        : needs === "hod"
          ? "Head of Department"
          : needs === "student"
            ? "Student"
            : "Teacher";

  const firstTeacher = dataset.teachers[0];

  if (!isDemo) {
    return (
      <div className="rounded-xl border border-line bg-white px-6 py-12 text-center shadow-xs">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <Icon name="alert" className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-ink">Not available for your role</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
          This page is for the {label}. Your roles in this college do not include it.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/" className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover">
            Go to your home page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-white px-6 py-12 text-center shadow-xs">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
        <Icon name="alert" className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-bold text-ink">Restricted to {label} View</h2>
      <p className="mx-auto mt-2 max-w-md text-xs text-ink-muted leading-relaxed">
        This configuration and operational tool is only accessible when logged in as the {label}.
        You can easily switch your role to access this area.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => setRole({ kind: "portal" })}
          className="inline-flex min-h-10 items-center rounded-md border border-line bg-white px-4 text-xs font-semibold text-ink hover:bg-surface"
        >
          Open Role Portal
        </button>
        <button
          type="button"
          onClick={() => {
            if (needs === "coordinator") {
              setRole({ kind: "coordinator" });
            } else if (needs === "principal") {
              setRole({ kind: "principal" });
            } else if (needs === "hod") {
              setRole({ kind: "hod", departmentId: dataset.departments[0]?.id ?? "" });
            } else if (needs === "teacher" && firstTeacher) {
              setRole({ kind: "teacher", teacherId: firstTeacher.id });
            } else if (needs === "student") {
              setRole({ kind: "student", sectionId: dataset.sections[0]?.id ?? "" });
            }
          }}
          className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-xs font-semibold text-white hover:bg-primary-hover"
        >
          Switch to {label}
        </button>
      </div>
    </div>
  );
}
