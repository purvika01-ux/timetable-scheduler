"use client";

import { useMemo } from "react";

import { RoleNotice } from "@/components/app-shell";
import { Icon } from "@/components/icons";
import { Button, ButtonLink, EmptyState, PageHeader, PageSkeleton, Panel, Stamp, cx } from "@/components/ui";
import { useWorkspace } from "@/lib/store";
import { DAY_LABELS } from "@/lib/timetable/college";
import { roomUseReport, teacherLoadReport } from "@/lib/timetable/reports";

const TH = "px-4 py-2 font-semibold";

export default function ReportsPage() {
  const { ready, role, dataset, timetable } = useWorkspace();
  const entries = useMemo(() => timetable?.entries ?? [], [timetable]);
  const loads = useMemo(() => teacherLoadReport(dataset, entries), [dataset, entries]);
  const rooms = useMemo(() => roomUseReport(dataset, entries), [dataset, entries]);

  const filteredLoads = useMemo(() => {
    if (role.kind === "hod") {
      const deptTeachers = dataset.teachers.filter((t) => t.departmentId === role.departmentId);
      return loads.filter((l) => deptTeachers.some((t) => t.id === l.teacherId));
    }
    return loads;
  }, [loads, role, dataset.teachers]);

  const filteredRooms = useMemo(() => {
    if (role.kind === "hod") {
      return rooms.filter((r) => {
        const rm = dataset.rooms.find((ro) => ro.id === r.roomId);
        return !rm?.departmentId || rm.departmentId === role.departmentId;
      });
    }
    return rooms;
  }, [rooms, role, dataset.rooms]);

  if (!ready) return <PageSkeleton />;
  if (role.kind !== "coordinator" && role.kind !== "principal" && role.kind !== "hod") {
    return <RoleNotice needs="coordinator" />;
  }
  if (!timetable) {
    return (
      <div>
        <PageHeader title="Reports" />
        <EmptyState icon="chart" title="No timetable yet" action={role.kind === "coordinator" ? <ButtonLink href="/generate" variant="primary" icon="generate">Generate timetable</ButtonLink> : undefined}>
          Reports on teacher loads and room use appear once a timetable exists.
        </EmptyState>
      </div>
    );
  }

  const dept = (id: string) => dataset.departments.find((d) => d.id === id);
  const teacher = (id: string) => dataset.teachers.find((t) => t.id === id);
  const room = (id: string) => dataset.rooms.find((r) => r.id === id);
  const idle = filteredRooms.filter((r) => r.used === 0).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        description="Teaching loads against each teacher's limits, and how much every room is used, including which departments use shared rooms."
        actions={
          <Button icon="print" onClick={() => window.print()} className="no-print">
            Print or save as PDF
          </Button>
        }
      />

      <Panel title="Teacher load">
        <div className="relative -mx-4 overflow-x-auto">
          <table className="w-full min-w-160 text-sm">
            <caption className="sr-only">Teacher load: periods scheduled per week, busiest day against the daily limit, and gaps</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th scope="col" className={TH}>Teacher</th>
                <th scope="col" className={TH}>Department</th>
                <th scope="col" className={`${TH} text-right`}>Periods / week</th>
                <th scope="col" className={TH}>Busiest day</th>
                <th scope="col" className={`${TH} text-right`}>Gaps / week</th>
              </tr>
            </thead>
            <tbody>
              {filteredLoads.map((l) => {
                const over = l.busiestDay !== null && l.busiestDay.periods > l.dailyLimit;
                const short = l.periods < l.required;
                return (
                  <tr key={l.teacherId} className="border-b border-line-soft last:border-0">
                    <th scope="row" className="px-4 py-2 text-left font-semibold">{teacher(l.teacherId)?.name}</th>
                    <td className="px-4 py-2">{dept(teacher(l.teacherId)?.departmentId ?? "")?.code ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {l.periods} of {l.required}
                      {short && (
                        <span className="ml-2">
                          <Stamp tone="warning">{l.required - l.periods} missing</Stamp>
                        </span>
                      )}
                    </td>
                    <td className={cx("px-4 py-2", over && "font-semibold text-danger")}>
                      {l.busiestDay ? `${DAY_LABELS[l.busiestDay.day].short}: ${l.busiestDay.periods} of max ${l.dailyLimit}` : "No classes"}
                      {over && <span className="sr-only"> (over the daily limit)</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{l.gaps}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-muted">Gaps are free periods between a teacher&apos;s first and last class of a day, added up over the week.</p>
      </Panel>

      <Panel title={`Room use${idle ? ` (${idle} ${idle === 1 ? "room is" : "rooms are"} never used)` : ""}`}>
        <div className="relative -mx-4 overflow-x-auto">
          <table className="w-full min-w-160 text-sm">
            <caption className="sr-only">Room use: periods used out of periods available, and by which departments</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th scope="col" className={TH}>Room</th>
                <th scope="col" className={TH}>Used by</th>
                <th scope="col" className={TH}>Use</th>
                <th scope="col" className={TH}>By department</th>
              </tr>
            </thead>
            <tbody>
              {filteredRooms.map((r) => {
                const info = room(r.roomId);
                const pct = r.available ? Math.round((r.used / r.available) * 100) : 0;
                return (
                  <tr key={r.roomId} className="border-b border-line-soft last:border-0">
                    <th scope="row" className="px-4 py-2 text-left font-semibold">
                      {info?.name} <span className="font-normal text-ink-muted">({info?.type}, {info?.capacity} seats)</span>
                    </th>
                    <td className="px-4 py-2">{info?.departmentId ? dept(info.departmentId)?.code : <Stamp tone="info">Shared</Stamp>}</td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-24 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                          <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="tabular-nums">
                          {r.used}/{r.available} periods ({pct}%)
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2 text-ink-muted">
                      {r.byDepartment.length === 0 ? (
                        <span className="flex items-center gap-1 text-warning">
                          <Icon name="alert" className="h-3.5 w-3.5" />
                          Not used
                        </span>
                      ) : (
                        r.byDepartment.map((b) => `${dept(b.departmentId)?.code ?? "?"} ${b.periods}`).join(" · ")
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
