"use client";

import { EntityEditor } from "@/components/entity-editor";
import { useWorkspace } from "@/lib/store";
import { newId } from "@/lib/timetable/college";
import type { Department } from "@/lib/timetable/types";

export default function DepartmentsPage() {
  const { dataset } = useWorkspace();
  return (
    <EntityEditor<Department>
      area="departments"
      title="Departments"
      singular="department"
      items={dataset.departments}
      blank={() => ({ id: newId("d"), code: "", name: "" })}
      label={(d) => d.name || d.code}
      datasetWith={(departments) => ({ ...dataset, departments })}
      emptyText="Add the departments that own sections, teachers and rooms, for example Computer Science and Engineering."
      columns={[
        { header: "Code", cell: (d) => <span className="font-semibold">{d.code}</span> },
        { header: "Name", cell: (d) => d.name },
        { header: "Teachers", cell: (d) => dataset.teachers.filter((t) => t.departmentId === d.id).length },
        { header: "Sections", cell: (d) => dataset.sections.filter((s) => s.departmentId === d.id).length },
        { header: "Own rooms", cell: (d) => dataset.rooms.filter((r) => r.departmentId === d.id).length },
      ]}
      fields={[
        { key: "name", label: "Department name", type: "text", hint: "For example: Computer Science and Engineering" },
        { key: "code", label: "Short code", type: "text", hint: "For example: CSE. Shown on timetables and reports." },
      ]}
    />
  );
}
