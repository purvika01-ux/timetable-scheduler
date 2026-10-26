"use client";

import Link from "next/link";

import { useWorkspace } from "@/lib/store";
import { checkDataset, type SetupArea } from "@/lib/timetable/college";
import { precheck } from "@/lib/timetable/precheck";
import { validateTimetable } from "@/lib/timetable/validator";

import { Icon } from "./icons";
import { cx, Panel } from "./ui";

type Status = "done" | "todo" | "problem" | "optional";

const STATUS_TEXT: Record<Status, string> = {
  done: "Done",
  todo: "To do",
  problem: "Needs fixing",
  optional: "Optional",
};

/** "What should I do now?" for coordinators: each setup step, its state, and a link to it. */
export function SetupChecklist() {
  const { dataset: d, timetable } = useWorkspace();
  const problems = checkDataset(d);
  const has = (area: SetupArea) => problems.some((p) => p.area === area);
  const status = (count: number, area: SetupArea): Status => (has(area) ? "problem" : count > 0 ? "done" : "todo");
  const blocking = problems.length === 0 ? precheck(d).filter((i) => i.severity === "blocking") : [];
  const report = timetable ? validateTimetable(d, timetable.entries, d.availability) : null;
  const withAvailability = d.teachers.filter((t) => (d.availability[t.id] ?? []).length > 0).length;

  const steps: { label: string; detail: string; href: string; status: Status }[] = [
    {
      label: "College and week",
      detail: "Name, semester, teaching days, periods and breaks",
      href: "/setup/college",
      status: has("college") || has("grid") ? "problem" : "done",
    },
    { label: "Departments", detail: `${d.departments.length} added`, href: "/setup/departments", status: status(d.departments.length, "departments") },
    { label: "Rooms and labs", detail: `${d.rooms.length} added; owned by a department or shared`, href: "/setup/rooms", status: status(d.rooms.length, "rooms") },
    { label: "Teachers", detail: `${d.teachers.length} added, with daily limits`, href: "/setup/teachers", status: status(d.teachers.length, "teachers") },
    { label: "Subjects", detail: `${d.subjects.length} added`, href: "/setup/subjects", status: status(d.subjects.length, "subjects") },
    { label: "Sections", detail: `${d.sections.length} added, with student numbers`, href: "/setup/sections", status: status(d.sections.length, "sections") },
    {
      label: "Courses",
      detail: `${d.requirements.length} added: who teaches what to whom, how often`,
      href: "/setup/courses",
      status: status(d.requirements.length, "courses"),
    },
    {
      label: "Teacher availability",
      detail: `${withAvailability} of ${d.teachers.length} teachers have unavailable periods marked`,
      href: "/setup/availability",
      status: "optional",
    },
    {
      label: "Check and generate",
      detail:
        problems.length > 0
          ? "Fix the data problems above first"
          : blocking.length > 0
            ? `${blocking.length} ${blocking.length === 1 ? "problem stops" : "problems stop"} some classes from fitting`
            : !timetable
              ? "Ready to generate"
              : !report?.valid
                ? "The timetable breaks rules after data changes; generate again"
                : !report.complete
                  ? `${report.missing.reduce((n, m) => n + m.missing, 0)} sessions are not placed yet`
                  : "Timetable is clash-free and complete",
      href: "/generate",
      status: problems.length > 0 || blocking.length > 0 || (report && !report.valid) ? "problem" : timetable && report?.complete ? "done" : "todo",
    },
  ];
  const next = steps.find((s) => s.status === "problem" || s.status === "todo");

  return (
    <Panel title="Set up and generate">
      {next && (
        <p className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-ink">
          <Icon name="info" className="h-4 w-4 text-primary" />
          <span>
            Next step: <strong>{next.label}</strong>. {next.detail}.
          </span>
          <Link href={next.href} className="font-semibold text-primary underline underline-offset-2">
            Go to {next.label.toLowerCase()}
          </Link>
        </p>
      )}
      <ol className="divide-y divide-line-soft">
        {steps.map((s, i) => (
          <li key={s.href}>
            <Link href={s.href} className="flex items-center gap-3 rounded-md px-1 py-2.5 hover:bg-surface">
              <span
                className={cx(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                  s.status === "done" && "border-green-600 bg-green-50 text-green-700",
                  s.status === "problem" && "border-red-600 bg-red-50 text-danger",
                  (s.status === "todo" || s.status === "optional") && "border-line bg-white text-ink-muted",
                )}
                aria-hidden="true"
              >
                {s.status === "done" ? <Icon name="check" className="h-4 w-4" /> : s.status === "problem" ? <Icon name="alert" className="h-4 w-4" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{s.label}</span>
                <span className="block text-xs text-ink-muted">{s.detail}</span>
              </span>
              <span
                className={cx(
                  "shrink-0 text-xs font-medium",
                  s.status === "done" ? "text-success" : s.status === "problem" ? "text-danger" : "text-ink-muted",
                )}
              >
                {STATUS_TEXT[s.status]}
              </span>
              <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-ink-muted" />
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
