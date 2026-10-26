"use client";

import { EntityEditor } from "@/components/entity-editor";
import { SUBJECT_STYLE } from "@/components/subject-style";
import { cx } from "@/components/ui";
import { useWorkspace } from "@/lib/store";
import { newId, SUBJECT_COLORS, SUBJECT_KINDS } from "@/lib/timetable/college";
import type { Subject } from "@/lib/timetable/types";

export default function SubjectsPage() {
  const { dataset } = useWorkspace();
  const nextColor = () => SUBJECT_COLORS[dataset.subjects.length % SUBJECT_COLORS.length];
  return (
    <EntityEditor<Subject>
      area="subjects"
      title="Subjects"
      singular="subject"
      items={dataset.subjects}
      blank={() => ({ id: newId("sub"), code: "", name: "", kind: "theory", color: nextColor() })}
      label={(s) => (s.code ? `${s.code} ${s.name}` : s.name)}
      datasetWith={(subjects) => ({ ...dataset, subjects })}
      emptyText="Add the subjects taught this semester, with their codes. Labs and practicals are subjects too."
      columns={[
        {
          header: "Code",
          cell: (s) => (
            <span className="flex items-center gap-2 font-semibold">
              <span className={cx("h-2.5 w-2.5 rounded-sm", SUBJECT_STYLE[s.color].dot)} aria-hidden="true" />
              {s.code}
            </span>
          ),
        },
        { header: "Name", cell: (s) => s.name },
        { header: "Kind", cell: (s) => SUBJECT_KINDS.find((k) => k.value === s.kind)?.label },
        { header: "Courses", cell: (s) => dataset.requirements.filter((r) => r.subjectId === s.id).length },
      ]}
      fields={[
        { key: "code", label: "Subject code", type: "text", hint: "For example: CS301" },
        { key: "name", label: "Subject name", type: "text" },
        { key: "kind", label: "Kind", type: "select", options: SUBJECT_KINDS, hint: "Lab subjects default to lab rooms and two-period sessions in Courses." },
        {
          key: "color",
          label: "Colour on timetables",
          type: "select",
          options: SUBJECT_COLORS.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) })),
          hint: "The subject code is always shown too, so colour is never the only clue.",
        },
      ]}
    />
  );
}
