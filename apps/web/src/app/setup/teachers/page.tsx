"use client";

import Link from "next/link";

import { EntityEditor } from "@/components/entity-editor";
import { Icon } from "@/components/icons";
import { useWorkspace } from "@/lib/store";
import { newId } from "@/lib/timetable/college";
import type { Teacher } from "@/lib/timetable/types";

export default function TeachersPage() {
  const { dataset } = useWorkspace();
  const load = (id: string) => dataset.requirements.filter((r) => r.teacherId === id).reduce((n, r) => n + r.sessionsPerWeek * r.span, 0);
  return (
    <EntityEditor<Teacher>
      area="teachers"
      title="Teachers"
      singular="teacher"
      items={dataset.teachers}
      blank={() => ({
        id: newId("t"),
        name: "",
        designation: "",
        departmentId: dataset.departments[0]?.id ?? "",
        employeeId: "",
        maxPeriodsPerDay: 5,
      })}
      label={(t) => t.name}
      datasetWith={(teachers) => ({ ...dataset, teachers })}
      emptyText="Add teachers with their department and the most periods they may teach in a day. Add departments first."
      columns={[
        { header: "Name", cell: (t) => <span className="font-semibold">{t.name}</span> },
        { header: "Department", cell: (t) => dataset.departments.find((d) => d.id === t.departmentId)?.code ?? "—" },
        { header: "Daily limit", cell: (t) => <span className="tabular-nums">{t.maxPeriodsPerDay}</span> },
        { header: "Teaches / week", cell: (t) => <span className="tabular-nums">{load(t.id)} periods</span> },
        {
          header: "Unavailable",
          cell: (t) => <span className="tabular-nums">{(dataset.availability[t.id] ?? []).length} periods</span>,
        },
      ]}
      rowActions={(t) => (
        <Link
          href={`/setup/availability?teacher=${encodeURIComponent(t.id)}`}
          className="grid h-9 w-9 place-items-center rounded-md text-ink-muted hover:bg-surface hover:text-ink"
          aria-label={`Availability of ${t.name}`}
          title="Availability"
        >
          <Icon name="availability" className="h-4 w-4" />
        </Link>
      )}
      fields={[
        { key: "name", label: "Name", type: "text", hint: "As it should appear on timetables, for example Dr. Amandeep Singh" },
        { key: "designation", label: "Designation", type: "text", optional: true, hint: "For example: Assistant Professor, Visiting Faculty" },
        { key: "departmentId", label: "Department", type: "select", options: dataset.departments.map((d) => ({ value: d.id, label: d.name })) },
        { key: "employeeId", label: "Employee ID", type: "text", optional: true },
        { key: "email", label: "Email", type: "email", optional: true, emptyOption: "" },
        {
          key: "maxPeriodsPerDay",
          label: "Most periods in a day",
          type: "number",
          min: 1,
          max: 12,
          hint: "The generator and manual moves never go above this.",
        },
      ]}
    />
  );
}
