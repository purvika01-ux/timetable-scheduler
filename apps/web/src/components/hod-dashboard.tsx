"use client";

import { useMemo } from "react";

import { Button, ButtonLink, Panel, StatTile } from "@/components/ui";
import { useWorkspace } from "@/lib/store";
import { teacherLoadReport } from "@/lib/timetable/reports";
import type { Department } from "@/lib/timetable/types";

export function HodDashboard({ department }: { department: Department }) {
  const { dataset, timetable, setRole } = useWorkspace();

  const entries = useMemo(() => timetable?.entries ?? [], [timetable]);
  const teacherLoads = useMemo(() => (timetable ? teacherLoadReport(dataset, entries) : []), [dataset, entries, timetable]);

  const deptTeachers = dataset.teachers.filter((t) => t.departmentId === department.id);
  const deptSections = dataset.sections.filter((s) => s.departmentId === department.id);
  const deptRooms = dataset.rooms.filter((r) => r.departmentId === department.id);

  const deptCourseReqs = dataset.requirements.filter((r) =>
    deptSections.some((s) => s.id === r.sectionId),
  );
  const deptTotalSessions = deptCourseReqs.reduce((n, r) => n + r.sessionsPerWeek, 0);

  const deptTeacherLoads = teacherLoads.filter((l) =>
    deptTeachers.some((t) => t.id === l.teacherId),
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-600" />
            Head of Department · {department.code}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
            {department.name}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Departmental faculty load distribution, specialized lab schedules, and cohort routines
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
          {dataset.departments.length > 1 && (
            <select
              value={department.id}
              onChange={(e) => setRole({ kind: "hod", departmentId: e.target.value })}
              className="h-10 rounded-md border border-line bg-white px-3 text-xs font-medium text-ink focus:border-primary focus:outline-none"
            >
              {dataset.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  Dept: {d.name} ({d.code})
                </option>
              ))}
            </select>
          )}
          <Button variant="ghost" icon="refresh" onClick={() => setRole({ kind: "portal" })}>
            Switch Role
          </Button>
          <ButtonLink href="/timetable" variant="primary" icon="calendar">
            Department Timetable
          </ButtonLink>
        </div>
      </div>

      {/* Primary KPI Tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Department Faculty"
          value={deptTeachers.length}
          hint={`${deptTeacherLoads.reduce((n, l) => n + l.periods, 0)} teaching periods`}
        />
        <StatTile
          label="Student Cohorts"
          value={deptSections.length}
          hint={`${deptSections.reduce((n, s) => n + s.strength, 0)} total students`}
        />
        <StatTile
          label="Weekly Course Sessions"
          value={deptTotalSessions}
          hint={`${deptCourseReqs.length} assigned courses`}
        />
        <StatTile
          label="Specialized Labs & Rooms"
          value={deptRooms.length}
          hint={deptRooms.map((r) => r.name).join(", ") || "Shared rooms only"}
        />
      </div>

      {/* Department Faculty Table */}
      <Panel title="Department Faculty Workload Summary">
        {deptTeacherLoads.length === 0 ? (
          <p className="text-xs text-ink-muted py-2">No faculty assigned to this department.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs font-semibold uppercase text-ink-muted">
                <tr>
                  <th className="py-2.5 px-3">Faculty Member</th>
                  <th className="py-2.5 px-3">Designation</th>
                  <th className="py-2.5 px-3 text-right">Periods / Week</th>
                  <th className="py-2.5 px-3 text-right">Busiest Day</th>
                  <th className="py-2.5 px-3 text-right">Daily Limit</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {deptTeacherLoads.map((load) => {
                  const teacher = deptTeachers.find((t) => t.id === load.teacherId);
                  const isOver = load.busiestDay && load.busiestDay.periods > load.dailyLimit;

                  return (
                    <tr key={load.teacherId} className="hover:bg-surface/50">
                      <td className="py-3 px-3 font-medium text-ink">{teacher?.name ?? "Teacher"}</td>
                      <td className="py-3 px-3 text-ink-muted">{teacher?.designation || "Assistant Professor"}</td>
                      <td className="py-3 px-3 text-right font-semibold text-ink">{load.periods}</td>
                      <td className="py-3 px-3 text-right text-ink">
                        {load.busiestDay ? `${load.busiestDay.day} (${load.busiestDay.periods})` : "–"}
                      </td>
                      <td className="py-3 px-3 text-right text-ink-muted">{load.dailyLimit} periods</td>
                      <td className="py-3 px-3 text-right">
                        {isOver ? (
                          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                            Over Limit
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            Normal
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Cohorts & Labs Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-white p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-ink text-sm">Department Student Sections</h3>
            <span className="text-xs text-ink-muted">{deptSections.length} Sections</span>
          </div>
          <div className="space-y-2">
            {deptSections.map((sec) => (
              <div key={sec.id} className="flex items-center justify-between rounded-lg border border-line/60 bg-surface/50 p-2.5 text-xs">
                <span className="font-medium text-ink">Section {sec.name}</span>
                <span className="text-ink-muted">{sec.strength} Students</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-white p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-ink text-sm">Department Laboratories</h3>
            <span className="text-xs text-ink-muted">{deptRooms.length} Facilities</span>
          </div>
          <div className="space-y-2">
            {deptRooms.length === 0 ? (
              <p className="text-xs text-ink-muted">No dedicated labs; courses utilize shared campus spaces.</p>
            ) : (
              deptRooms.map((room) => (
                <div key={room.id} className="flex items-center justify-between rounded-lg border border-line/60 bg-surface/50 p-2.5 text-xs">
                  <span className="font-medium text-ink">{room.name}</span>
                  <span className="text-ink-muted">{room.capacity} Seats · {room.type}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
