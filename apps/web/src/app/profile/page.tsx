"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/icons";
import { ConfirmDialog } from "@/components/modal";
import { SUBJECT_STYLE } from "@/components/subject-style";
import { useToast } from "@/components/toast";
import { Button, cx, PageHeader, PageSkeleton, Panel, Stamp } from "@/components/ui";
import { useDemoStore } from "@/lib/store";
import { weeklyLoad } from "@/lib/timetable/queries";

export default function ProfilePage() {
  const { ready, dataset, teacher, timetable, myUnavailable, availabilitySavedAt, resetDemo } = useDemoStore();
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);

  const mine = useMemo(() => timetable.entries.filter((e) => e.teacherId === teacher.id), [timetable, teacher.id]);
  const assignments = useMemo(() => dataset.requirements.filter((r) => r.teacherId === teacher.id), [dataset, teacher.id]);

  if (!ready) return <PageSkeleton />;
  const load = weeklyLoad(mine);
  const initials = teacher.name.replace(/^(Dr|Prof|Mr|Ms)\.\s*/, "").split(" ").map((p) => p[0]).join("");

  return (
    <div>
      <PageHeader title="Profile" description="Your sample teacher profile, teaching assignments and demo data controls." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-1">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-slate-800 text-xl font-semibold text-white" aria-hidden="true">
              {initials}
            </span>
            <div>
              <p className="text-lg font-semibold text-ink">{teacher.name}</p>
              <p className="text-sm text-ink-muted">{teacher.designation}</p>
              <div className="mt-1">
                <Stamp tone="warning">Sample profile</Stamp>
              </div>
            </div>
          </div>
          <dl className="mt-5 space-y-3 text-sm">
            {[
              ["Department", teacher.department],
              ["College", dataset.college.name],
              ["Employee ID", teacher.employeeId],
              ["Email", teacher.email],
              ["Daily teaching limit", `${teacher.maxPeriodsPerDay} periods`],
              ["Semester", dataset.college.semesterLabel],
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
            <div className="overflow-x-auto">
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
                        <td className="py-2 pr-3">{r.span > 1 ? `Lab, ${r.span} periods` : "Theory"}</td>
                        <td className="py-2 text-right tabular-nums">
                          {r.sessionsPerWeek} × {r.span}p
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-ink-muted">
              Currently scheduled: {load.classes} classes, {load.periods} periods a week across {load.sections} sections.
            </p>
          </Panel>

          <Panel title="Demo data and privacy">
            <ul className="space-y-2 text-sm text-ink-muted">
              <li className="flex gap-2">
                <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
                All people, rooms and the college are invented sample data.
              </li>
              <li className="flex gap-2">
                <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
                Your availability and timetable changes are stored only in this browser (localStorage). Nothing is sent to a
                server or shared with other users.
              </li>
              <li className="flex gap-2">
                <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
                Availability: {availabilitySavedAt ? `${myUnavailable.length} unavailable periods saved` : "sample defaults"}.
                Timetable: {timetable.source === "sample" ? "original sample" : timetable.source === "generated" ? `generated (seed ${timetable.seed})` : "edited by you"}.
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <Button variant="danger" icon="trash" onClick={() => setConfirmReset(true)}>
                Reset demo data
              </Button>
              <span className="text-xs text-ink-muted">Restores the sample availability and timetable.</span>
            </div>
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        danger
        title="Reset demo data?"
        confirmLabel="Reset demo data"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          resetDemo();
          setConfirmReset(false);
          toast("Demo data reset: sample availability and timetable restored.");
        }}
      >
        This deletes your saved availability and any generated or edited timetable from this browser, and restores the
        original sample data. This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}
