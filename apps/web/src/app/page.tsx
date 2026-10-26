"use client";

import Link from "next/link";
import { useMemo } from "react";

import { Icon } from "@/components/icons";
import { SetupChecklist } from "@/components/setup-checklist";
import { TeacherDashboard } from "@/components/teacher-dashboard";
import { ButtonLink, PageSkeleton, Panel, StatTile } from "@/components/ui";
import { useWorkspace } from "@/lib/store";
import { teacherLoadReport } from "@/lib/timetable/reports";
import { validateTimetable } from "@/lib/timetable/validator";

export default function HomePage() {
  const { ready, viewTeacher } = useWorkspace();
  if (!ready) return <PageSkeleton />;
  return viewTeacher ? <TeacherDashboard teacher={viewTeacher} /> : <CoordinatorHome />;
}

function CoordinatorHome() {
  const { dataset, timetable } = useWorkspace();
  const report = useMemo(() => (timetable ? validateTimetable(dataset, timetable.entries, dataset.availability) : null), [dataset, timetable]);
  const loads = useMemo(() => (timetable ? teacherLoadReport(dataset, timetable.entries) : []), [dataset, timetable]);
  const overLimit = loads.filter((l) => l.busiestDay && l.busiestDay.periods > l.dailyLimit).length;
  const missing = report?.missing.reduce((n, m) => n + m.missing, 0) ?? 0;
  const sessions = dataset.requirements.reduce((n, r) => n + r.sessionsPerWeek, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-ink-muted">Timetable coordinator</p>
          <h1 className="mt-0.5 text-2xl font-semibold text-ink">{dataset.college.name || "Set up your college"}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {dataset.id === "custom"
              ? "Your college's data is saved in this browser. Keep a copy with Save and open."
              : "You are looking at invented sample data. Start a blank college from Save and open to enter your own."}
          </p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/setup" icon="settings">
            Set up college
          </ButtonLink>
          <ButtonLink href="/generate" variant="primary" icon="generate">
            Generate
          </ButtonLink>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Sessions a week" value={sessions} hint={`${dataset.requirements.length} courses`} />
        <StatTile
          label="Timetable"
          value={!timetable ? "None yet" : report?.valid ? (missing ? "Incomplete" : "Clash-free") : "Has problems"}
          hint={timetable ? `${timetable.entries.length} classes placed` : "Generate one when setup is done"}
          tone={!timetable ? undefined : report?.valid && !missing ? "success" : "danger"}
        />
        <StatTile label="Not scheduled" value={timetable ? missing : "–"} hint="sessions missing" tone={missing ? "danger" : undefined} />
        <StatTile label="Over daily limit" value={timetable ? overLimit : "–"} hint="teachers" tone={overLimit ? "danger" : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SetupChecklist />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <Panel title="See and share">
            <ul className="space-y-3 text-sm">
              {[
                { href: "/timetable", icon: "calendar" as const, title: "Timetable", text: "By section, teacher, room or department. Move a class; print or save as PDF." },
                { href: "/reports", icon: "chart" as const, title: "Reports", text: "Teacher loads against limits, and how much each room (including shared rooms) is used." },
                { href: "/data", icon: "download" as const, title: "Save and open", text: "Download the college as a file, open one, or start a blank college." },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="flex gap-3 rounded-md p-1 hover:bg-surface">
                    <Icon name={l.icon} className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <span>
                      <span className="block font-medium text-ink">{l.title}</span>
                      <span className="block text-ink-muted">{l.text}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Teacher view">
            <p className="text-sm text-ink-muted">
              Use <strong>Demo view</strong> at the top to see the app as any teacher: their day, week and availability. In the full product each
              person signs in and sees only their own view.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
