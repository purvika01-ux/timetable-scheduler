"use client";

import { EntityEditor } from "@/components/entity-editor";
import { useWorkspace } from "@/lib/store";
import { MAX_SPAN, newId, ROOM_TYPES } from "@/lib/timetable/college";
import type { SessionRequirement } from "@/lib/timetable/types";

export default function CoursesPage() {
  const { dataset } = useWorkspace();
  const subject = (id: string) => dataset.subjects.find((s) => s.id === id);
  const section = (id: string) => dataset.sections.find((s) => s.id === id);
  const teacher = (id: string) => dataset.teachers.find((t) => t.id === id);
  const ready = dataset.subjects.length > 0 && dataset.sections.length > 0 && dataset.teachers.length > 0;
  return (
    <EntityEditor<SessionRequirement>
      area="courses"
      title="Courses"
      singular="course"
      items={dataset.requirements}
      blank={() => {
        const first = dataset.subjects[0];
        const lab = first?.kind === "lab";
        return {
          id: newId("q"),
          subjectId: first?.id ?? "",
          sectionId: dataset.sections[0]?.id ?? "",
          teacherId: dataset.teachers[0]?.id ?? "",
          sessionsPerWeek: lab ? 1 : 3,
          span: lab ? 2 : 1,
          roomType: lab ? "lab" : "lecture",
        };
      }}
      label={(r) => `${subject(r.subjectId)?.code ?? "Course"} for ${section(r.sectionId)?.name ?? "?"}`}
      datasetWith={(requirements) => ({ ...dataset, requirements })}
      emptyText={
        ready
          ? "Add one course for each subject a section studies: who teaches it, how many sessions a week, and how long each session is."
          : "Add subjects, sections and teachers first; a course links them together."
      }
      intro={
        <p className="text-sm text-ink-muted">
          A course says: this teacher teaches this subject to this section, so many times a week. A lab of two periods counts as one session
          that lasts two periods and never runs across a break.
        </p>
      }
      columns={[
        { header: "Subject", cell: (r) => <span className="font-semibold">{subject(r.subjectId)?.code} <span className="font-normal">{subject(r.subjectId)?.name}</span></span> },
        { header: "Section", cell: (r) => section(r.sectionId)?.name },
        { header: "Teacher", cell: (r) => teacher(r.teacherId)?.name },
        { header: "Per week", cell: (r) => <span className="tabular-nums">{r.sessionsPerWeek} × {r.span} {r.span === 1 ? "period" : "periods"}</span> },
        { header: "Room", cell: (r) => ROOM_TYPES.find((t) => t.value === r.roomType)?.label },
      ]}
      fields={[
        {
          key: "subjectId",
          label: "Subject",
          type: "select",
          options: dataset.subjects.map((s) => ({ value: s.id, label: `${s.code} ${s.name}` })),
          onChange: (draft, value) => {
            const lab = dataset.subjects.find((s) => s.id === value)?.kind === "lab";
            return { ...draft, roomType: lab ? "lab" : "lecture", span: lab ? Math.max(draft.span, 2) : draft.span };
          },
        },
        { key: "sectionId", label: "Section", type: "select", options: dataset.sections.map((s) => ({ value: s.id, label: s.name })) },
        { key: "teacherId", label: "Teacher", type: "select", options: dataset.teachers.map((t) => ({ value: t.id, label: t.name })) },
        { key: "sessionsPerWeek", label: "Sessions a week", type: "number", min: 1, max: 20 },
        {
          key: "span",
          label: "Periods per session",
          type: "number",
          min: 1,
          max: MAX_SPAN,
          hint: "1 for a lecture; 2 or more for a lab block taught in consecutive periods.",
        },
        { key: "roomType", label: "Room needed", type: "select", options: ROOM_TYPES },
      ]}
    />
  );
}
