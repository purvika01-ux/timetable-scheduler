"use client";

import { useMemo } from "react";

import { RoleNotice } from "@/components/app-shell";
import { Icon } from "@/components/icons";
import { SUBJECT_STYLE } from "@/components/subject-style";
import { cx, PageHeader, PageSkeleton, Panel, Stamp } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/store";
import { weeklyLoad } from "@/lib/timetable/queries";

export default function ProfilePage() {
  const { ready, dataset, viewTeacher: teacher, timetable } = useWorkspace();
  const { activeCollege } = useAuth();
  const mine = useMemo(() => (timetable?.entries ?? []).filter((e) => e.teacherId === teacher?.id), [timetable, teacher]);
  const assignments = useMemo(() => dataset.requirements.filter((r) => r.teacherId === teacher?.id), [dataset, teacher]);

  if (!ready) return <PageSkeleton />;
  if (!teacher) return <RoleNotice needs="teacher" />;
  const load = weeklyLoad(mine);
  const initials = teacher.name.replace(/^(Dr|Prof|Mr|Ms|Mrs)\.\s*/, "").split(" ").map((p) => p[0]).join("").slice(0, 2);
  const department = dataset.departments.find((d) => d.id === teacher.departmentId)?.name ?? "—";
  const unavailable = (dataset.availability[teacher.id] ?? []).length;

  return (
    <div>
      <PageHeader title="Profile" description="Your teacher profile and teaching assignments, as entered by the timetable coordinator." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-1">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-slate-800 text-xl font-semibold text-white" aria-hidden="true">
              {initials}
            </span>
            <div>
              <p className="text-lg font-semibold text-ink">{teacher.name}</p>
              {teacher.designation && <p className="text-sm text-ink-muted">{teacher.designation}</p>}
              {dataset.id !== "custom" && (
                <div className="mt-1">
                  <Stamp tone="warning">Sample profile</Stamp>
                </div>
              )}
            </div>
          </div>
          <dl className="mt-5 space-y-3 text-sm">
            {[
              ["Department", department],
              ["College", dataset.college.name || "—"],
              ["Employee ID", teacher.employeeId || "—"],
              ["Email", teacher.email || "—"],
              ["Daily teaching limit", `${teacher.maxPeriodsPerDay} periods`],
              ["Unavailable periods", `${unavailable}`],
              ["Semester", dataset.college.semesterLabel || "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-ink-muted">{k}</dt>
                <dd className="font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <div className="space-y-4 lg:col-span-2">
          <Panel title="Teaching assignments">
            {assignments.length === 0 ? (
              <p className="text-sm text-ink-muted">No courses are assigned to you yet.</p>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th scope="col" className="py-2 pr-3 font-semibold">Subject</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Section</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Type</th>
                      <th scope="col" className="py-2 text-right font-semibold">Per week</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((r) => {
                      const s = dataset.subjects.find((x) => x.id === r.subjectId);
                      const section = dataset.sections.find((x) => x.id === r.sectionId);
                      return (
                        <tr key={r.id} className="border-b border-line-soft last:border-0">
                          <td className="py-2 pr-3">
                            <span className="flex items-center gap-2">
                              <span className={cx("h-2.5 w-2.5 rounded-sm", SUBJECT_STYLE[s?.color ?? "stone"].dot)} aria-hidden="true" />
                              <span className="font-semibold">{s?.code}</span> {s?.name}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            {section?.name} <span className="text-ink-muted">({section?.strength})</span>
                          </td>
                          <td className="py-2 pr-3">{r.span > 1 ? `Block of ${r.span} periods` : "Single period"}</td>
                          <td className="py-2 text-right tabular-nums">
                            {r.sessionsPerWeek} × {r.span}p
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-sm text-ink-muted">
              Currently scheduled: {load.classes} classes, {load.periods} periods a week across {load.sections} sections.
            </p>
          </Panel>

          <Panel title="About this prototype">
            <ul className="space-y-2 text-sm text-ink-muted">
              {activeCollege ? (
                <li className="flex gap-2">
                  <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
                  You are signed in to {activeCollege.collegeName}: changes are saved on the server, and nothing about the college is kept in this browser.
                </li>
              ) : (
                <>
                  <li className="flex gap-2">
                    <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
                    This is the demo: the Demo view switch at the top shows the app as any teacher or as the coordinator.
                  </li>
                  <li className="flex gap-2">
                    <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
                    The demo is stored only in this browser (localStorage). Nothing is sent to a server or shared with other users.
                  </li>
                </>
              )}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
