"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useDemoStore, useNow } from "@/lib/store";

import { Icon, type IconName } from "./icons";
import { Banner, cx, Stamp } from "./ui";

const NAV: { href: string; label: string; short: string; icon: IconName }[] = [
  { href: "/", label: "Dashboard", short: "Home", icon: "dashboard" },
  { href: "/timetable", label: "My Timetable", short: "Timetable", icon: "calendar" },
  { href: "/availability", label: "My Availability", short: "Availability", icon: "availability" },
  { href: "/generate", label: "Generate Timetable", short: "Generate", icon: "generate" },
  { href: "/profile", label: "Profile", short: "Profile", icon: "user" },
];

function initials(name: string) {
  return name
    .replace(/^(Dr|Prof|Mr|Ms|Mrs)\.\s*/, "")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { teacher, dataset, notices, dismissNotices } = useDemoStore();
  const now = useNow();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="min-h-screen bg-surface">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      {/* Sidebar: tablet and desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-white md:flex">
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
          <ul className="space-y-1">
            {NAV.map((item) => {
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
          <Stamp tone="warning">Sample data</Stamp>
          <p className="mt-2 leading-relaxed">
            Prototype. Changes are saved in this browser only.
          </p>
        </div>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-white md:hidden" aria-hidden="true">
              <Icon name="calendar" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink" title={dataset.college.name}>
                {dataset.college.name}
              </p>
              <p className="truncate text-xs text-ink-muted">
                {dataset.college.semesterLabel}
                {now && (
                  <span className="hidden sm:inline">
                    {" · "}
                    {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </span>
                )}
              </p>
            </div>
            <span className="hidden sm:inline-flex">
              <Stamp tone="warning">Sample data</Stamp>
            </span>
            <Link
              href="/profile"
              className="flex items-center gap-2 rounded-md p-1 hover:bg-surface"
              aria-label={`Profile: ${teacher.name}`}
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-800 text-xs font-semibold text-white" aria-hidden="true">
                {initials(teacher.name)}
              </span>
              <span className="hidden text-left lg:block">
                <span className="block text-sm font-medium leading-tight text-ink">{teacher.name}</span>
                <span className="block text-xs leading-tight text-ink-muted">Teacher</span>
              </span>
            </Link>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-12">
          {notices.length > 0 && (
            <div className="mb-6">
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
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white md:hidden">
        <ul className="grid grid-cols-5">
          {NAV.map((item) => {
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
