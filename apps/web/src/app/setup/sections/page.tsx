"use client";

import { EntityEditor } from "@/components/entity-editor";
import { useWorkspace } from "@/lib/store";
import { newId } from "@/lib/timetable/college";
import { totalTeachingPeriods } from "@/lib/timetable/grid";
import type { Section } from "@/lib/timetable/types";

export default function SectionsPage() {
  const { dataset } = useWorkspace();
  const weekly = totalTeachingPeriods(dataset.grid);
  const load = (id: string) => dataset.requirements.filter((r) => r.sectionId === id).reduce((n, r) => n + r.sessionsPerWeek * r.span, 0);
  return (
    <EntityEditor<Section>
      area="sections"
      title="Sections"
      singular="section"
      items={dataset.sections}
      blank={() => ({ id: newId("s"), name: "", programme: "", semester: 1, strength: 60, departmentId: dataset.departments[0]?.id ?? "" })}
      label={(s) => s.name}
      datasetWith={(sections) => ({ ...dataset, sections })}
      emptyText="Add each group of students that attends classes together, for example CSE 3A, with how many students it has."
      columns={[
        { header: "Section", cell: (s) => <span className="font-semibold">{s.name}</span> },
        { header: "Programme", cell: (s) => `${s.programme || "—"}, semester ${s.semester}` },
        { header: "Department", cell: (s) => dataset.departments.find((d) => d.id === s.departmentId)?.code ?? "—" },
        { header: "Students", cell: (s) => <span className="tabular-nums">{s.strength}</span> },
        { header: "Periods / week", cell: (s) => <span className="tabular-nums">{load(s.id)} of {weekly}</span> },
      ]}
      fields={[
        { key: "name", label: "Section name", type: "text", hint: "For example: CSE 3A, B.Com 1B" },
        { key: "programme", label: "Programme", type: "text", optional: true, hint: "For example: B.Tech CSE, B.Sc. Non-Medical" },
        { key: "semester", label: "Semester", type: "number", min: 1, max: 12 },
        { key: "strength", label: "Number of students", type: "number", min: 1, max: 1000, hint: "Used to choose rooms with enough seats." },
        { key: "departmentId", label: "Department", type: "select", options: dataset.departments.map((d) => ({ value: d.id, label: d.name })), hint: "Decides which department-owned rooms the section may use." },
      ]}
    />
  );
}
