"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useWorkspace } from "@/lib/store";
import { checkDataset, type SetupArea } from "@/lib/timetable/college";

import { RoleNotice } from "./app-shell";
import { Icon } from "./icons";
import { cx, PageSkeleton } from "./ui";

export const SETUP_STEPS: { href: string; label: string; area?: SetupArea; count?: (d: ReturnType<typeof useWorkspace>["dataset"]) => number }[] = [
  { href: "/setup", label: "Overview" },
  { href: "/setup/college", label: "College and week", area: "grid" },
  { href: "/setup/departments", label: "Departments", area: "departments", count: (d) => d.departments.length },
  { href: "/setup/rooms", label: "Rooms", area: "rooms", count: (d) => d.rooms.length },
  { href: "/setup/teachers", label: "Teachers", area: "teachers", count: (d) => d.teachers.length },
  { href: "/setup/subjects", label: "Subjects", area: "subjects", count: (d) => d.subjects.length },
  { href: "/setup/sections", label: "Sections", area: "sections", count: (d) => d.sections.length },
  { href: "/setup/courses", label: "Courses", area: "courses", count: (d) => d.requirements.length },
  { href: "/setup/availability", label: "Availability" },
];

/** Tabs for the setup screens; only coordinators can edit the college. */
export function SetupFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, role, dataset } = useWorkspace();
  if (!ready) return <PageSkeleton />;
  if (role.kind !== "coordinator" && role.kind !== "principal" && role.kind !== "hod") return <RoleNotice needs="coordinator" />;
  const problems = checkDataset(dataset);
  return (
    <div>
      <nav aria-label="Set up college" className="no-print -mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-line">
          {SETUP_STEPS.map((s) => {
            const active = pathname === s.href;
            const bad = s.area && problems.some((p) => p.area === s.area || (s.area === "grid" && p.area === "college"));
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "-mb-px flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium",
                    active ? "border-primary text-primary" : "border-transparent text-ink-muted hover:text-ink",
                  )}
                >
                  {s.label}
                  {s.count && <span className="rounded bg-surface px-1.5 text-xs tabular-nums text-ink-muted">{s.count(dataset)}</span>}
                  {bad && (
                    <span className="text-danger">
                      <Icon name="alert" className="h-3.5 w-3.5" />
                      <span className="sr-only">(needs fixing)</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </div>
  );
}
