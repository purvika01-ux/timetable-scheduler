"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

const TEACHER_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", short: "Home", icon: "dashboard", phone: true },
  { href: "/timetable", label: "My Timetable", short: "Timetable", icon: "calendar", phone: true },
  { href: "/availability", label: "My Availability", short: "Availability", icon: "availability", phone: true },
  { href: "/profile", label: "Profile", short: "Profile", icon: "user", phone: true },
];

function RoleSwitcher({ id }: { id: string }) {
  const { dataset, role, setRole } = useWorkspace();
  const value = role.kind === "coordinator" ? "coordinator" : `teacher:${role.teacherId}`;
  return (
    <label className="flex items-center gap-2 text-xs text-ink-muted" htmlFor={id}>
      <span className="hidden whitespace-nowrap sm:inline">Demo view</span>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          const next: Role = v === "coordinator" ? { kind: "coordinator" } : { kind: "teacher", teacherId: v.slice("teacher:".length) };
          setRole(next);
        }}
        className="h-9 max-w-44 rounded-md border border-line bg-white px-2 text-sm text-ink sm:max-w-64"
        aria-label="Demo view: choose whose view of the app to see (there is no sign-in in this prototype)"
      >
        <option value="coordinator">Coordinator</option>
        {dataset.teachers.length > 0 && (
          <optgroup label="Teacher">
            {dataset.teachers.map((t) => (
              <option key={t.id} value={`teacher:${t.id}`}>
                {t.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, dataset, role, notices, dismissNotices } = useWorkspace();
  const now = useNow();
  const nav = role.kind === "coordinator" ? COORDINATOR_NAV : TEACHER_NAV;
  const phoneNav = nav.filter((n) => n.phone);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const sample = dataset.id !== "custom";

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
        <nav aria-label="Main" className="flex-1 px-3 py-4">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {role.kind === "coordinator" ? "Coordinator" : "Teacher"}
          </p>
          <ul className="space-y-1">
            {nav.map((item) => {
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
        </nav>
        <div className="border-t border-line px-5 py-4 text-xs text-ink-muted">
          <Stamp tone="warning">{sample ? "Sample data" : "Prototype"}</Stamp>
          <p className="mt-2 leading-relaxed">No sign-in: use Demo view to switch roles. Data is saved in this browser only.</p>
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
                {dataset.college.name || "New college (not named yet)"}
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
            {sample && (
              <span className="hidden lg:inline-flex">
                <Stamp tone="warning">Sample data</Stamp>
              </span>
            )}
            {ready && <RoleSwitcher id="role-switcher" />}
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

/** Shown when a page belongs to the other demo role. */
export function RoleNotice({ needs }: { needs: Role["kind"] }) {
  const { dataset, setRole } = useWorkspace();
  const first = dataset.teachers[0];
  return (
    <div className="rounded-lg border border-line bg-white px-6 py-10 text-center">
      <Icon name="users" className="mx-auto h-8 w-8 text-ink-muted" />
      <p className="mt-3 font-semibold text-ink">This page is for the {needs === "coordinator" ? "timetable coordinator" : "teacher"} view</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
        {needs === "coordinator"
          ? "Teachers see their own timetable and availability. Switch the demo view to Coordinator to set up the college and generate timetables."
          : first
            ? "Coordinators manage every teacher's availability from Set up college. Switch the demo view to a teacher to see their pages."
            : "Add teachers in Set up college first; then you can view the app as one of them."}
      </p>
      {(needs === "coordinator" || first) && (
        <button
          type="button"
          onClick={() => setRole(needs === "coordinator" ? { kind: "coordinator" } : { kind: "teacher", teacherId: first.id })}
          className="mt-4 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover"
        >
          {needs === "coordinator" ? "View as coordinator" : `View as ${first.name}`}
        </button>
      )}
    </div>
  );
}
