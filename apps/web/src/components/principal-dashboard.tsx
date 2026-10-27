"use client";

import { useMemo } from "react";

import { Icon } from "@/components/icons";
import { Banner, Button, ButtonLink, Panel, StatTile } from "@/components/ui";
import { useWorkspace } from "@/lib/store";
import { roomUseReport, teacherLoadReport } from "@/lib/timetable/reports";
import { validateTimetable } from "@/lib/timetable/validator";

export function PrincipalDashboard() {
  const { dataset, timetable, setRole, isDemo } = useWorkspace();

  const report = useMemo(
    () => (timetable ? validateTimetable(dataset, timetable.entries, dataset.availability) : null),
    [dataset, timetable],
  );
  const teacherLoads = useMemo(() => (timetable ? teacherLoadReport(dataset, timetable.entries) : []), [dataset, timetable]);
  const roomReports = useMemo(() => (timetable ? roomUseReport(dataset, timetable.entries) : []), [dataset, timetable]);
  const scheduledCount = timetable?.entries.length ?? 0;
  const missing = report?.missing.reduce((n, m) => n + m.missing, 0) ?? 0;
  const overLimitTeachers = teacherLoads.filter((l) => l.busiestDay && l.busiestDay.periods > l.dailyLimit).length;

  const totalRoomPeriodsPossible = dataset.rooms.length * (dataset.grid?.days.length ?? 5) * (dataset.grid?.days[0]?.periodCount ?? 7);
  const totalPeriodsUsed = roomReports.reduce((n, r) => n + r.used, 0);
  const roomUtilization = totalRoomPeriodsPossible > 0 ? Math.round((totalPeriodsUsed / totalRoomPeriodsPossible) * 100) : 0;

  // Department level summary
  const deptSummaries = useMemo(() => {
    return dataset.departments.map((dept) => {
      const teachers = dataset.teachers.filter((t) => t.departmentId === dept.id);
      const sections = dataset.sections.filter((s) => s.departmentId === dept.id);
      const rooms = dataset.rooms.filter((r) => r.departmentId === dept.id);
      const deptCourses = dataset.requirements.filter((r) => sections.some((s) => s.id === r.sectionId));
      const sessions = deptCourses.reduce((n, r) => n + r.sessionsPerWeek, 0);

      return {
        dept,
        teacherCount: teachers.length,
        sectionCount: sections.length,
        roomCount: rooms.length,
        sessionCount: sessions,
      };
    });
  }, [dataset]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-700">
            <span className="inline-block h-2 w-2 rounded-full bg-purple-600" />
            Executive Oversight · Principal
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
            {dataset.college.name || "Punjab College Timetable"}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {dataset.college.semesterLabel ? `${dataset.college.semesterLabel} · ` : ""}
            Clash-free institutional schedule audit and operational health
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
          {isDemo && (
            <Button variant="ghost" icon="refresh" onClick={() => setRole({ kind: "portal" })}>
              Switch Role
            </Button>
          )}
          <ButtonLink href="/register" icon="settings">
            Register college
          </ButtonLink>
          <Button icon="print" onClick={() => window.print()}>
            Print Master
          </Button>
          <ButtonLink href="/timetable" variant="primary" icon="calendar">
            Review Timetable
          </ButtonLink>
        </div>
      </div>

      {/* Primary KPI Tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Timetable Integrity"
          value={!timetable ? "No Schedule" : report?.valid ? (missing ? "Incomplete" : "100% Clash-Free") : "Has Clashes"}
          hint={timetable ? `${scheduledCount} sessions placed` : "Pending generation"}
          tone={!timetable ? undefined : report?.valid && !missing ? "success" : "danger"}
        />
        <StatTile
          label="Unscheduled Sessions"
          value={timetable ? missing : "–"}
          hint={missing > 0 ? "Requires review" : "All courses placed"}
          tone={missing > 0 ? "danger" : "success"}
        />
        <StatTile
          label="Teacher Workload Alert"
          value={overLimitTeachers}
          hint={overLimitTeachers > 0 ? "Faculty exceeding daily limit" : "All within daily quotas"}
          tone={overLimitTeachers > 0 ? "danger" : "success"}
        />
        <StatTile
          label="Room Utilization"
          value={`${roomUtilization}%`}
          hint={`${totalPeriodsUsed} of ${totalRoomPeriodsPossible} room-periods`}
        />
      </div>

      {/* Compliance & Audit Banner */}
      {report?.valid && missing === 0 && (
        <Banner tone="success" title="Clash-free and complete">
          The validator found no teacher, room or section clashes, no class in a too-small or wrong-type room, no class in
          a teacher&apos;s unavailable period, and every course has all its weekly sessions.
        </Banner>
      )}

      {/* Departmental Overview Table */}
      <Panel title="Academic Departments & Resource Allocation">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs font-semibold uppercase text-ink-muted">
              <tr>
                <th className="py-2.5 px-3">Department</th>
                <th className="py-2.5 px-3">Code</th>
                <th className="py-2.5 px-3 text-right">Faculty</th>
                <th className="py-2.5 px-3 text-right">Sections</th>
                <th className="py-2.5 px-3 text-right">Labs & Rooms</th>
                <th className="py-2.5 px-3 text-right">Weekly Load</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {deptSummaries.map(({ dept, teacherCount, sectionCount, roomCount, sessionCount }) => (
                <tr key={dept.id} className="hover:bg-surface/50">
                  <td className="py-3 px-3 font-medium text-ink">{dept.name}</td>
                  <td className="py-3 px-3 text-ink-muted">{dept.code}</td>
                  <td className="py-3 px-3 text-right text-ink">{teacherCount}</td>
                  <td className="py-3 px-3 text-right text-ink">{sectionCount}</td>
                  <td className="py-3 px-3 text-right text-ink">{roomCount}</td>
                  <td className="py-3 px-3 text-right font-medium text-ink">{sessionCount} hrs/wk</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Actions Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-white p-5 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <Icon name="chart" className="h-5 w-5" />
            <span>Campus Analytical Reports</span>
          </div>
          <p className="text-xs text-ink-muted">
            Inspect teacher loads against contracted hours, view room utilization percentages, and monitor shared resource usage across departments.
          </p>
          <div className="pt-2">
            <ButtonLink href="/reports" icon="chart">
              Open Institutional Reports
            </ButtonLink>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-white p-5 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-indigo-700 font-semibold">
            <Icon name="download" className="h-5 w-5" />
            <span>Master Timetable Archive</span>
          </div>
          <p className="text-xs text-ink-muted">
            Export a certified backup copy of the complete college dataset and verified timetable for documentation and compliance records.
          </p>
          <div className="pt-2">
            <ButtonLink href="/data" icon="download">
              Download College Archive
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}
