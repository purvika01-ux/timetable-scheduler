"use client";

import { EntityEditor } from "@/components/entity-editor";
import { Stamp } from "@/components/ui";
import { useWorkspace } from "@/lib/store";
import { newId, ROOM_TYPES } from "@/lib/timetable/college";
import type { Room } from "@/lib/timetable/types";

export default function RoomsPage() {
  const { dataset } = useWorkspace();
  const deptName = (id?: string) => dataset.departments.find((d) => d.id === id)?.code;
  return (
    <EntityEditor<Room>
      area="rooms"
      title="Rooms and labs"
      singular="room"
      items={dataset.rooms}
      blank={() => ({ id: newId("r"), name: "", type: "lecture", capacity: 60, building: "" })}
      label={(r) => r.name}
      datasetWith={(rooms) => ({ ...dataset, rooms })}
      emptyText="Add every room classes can use: lecture rooms, labs, seminar halls and workshops, with their seats."
      intro={
        <p className="text-sm text-ink-muted">
          A room owned by a department is used only by that department&apos;s sections. A shared room (for example a seminar hall or a
          common computer lab) can be used by every department; the generator shares it fairly and reports show who uses it.
        </p>
      }
      columns={[
        { header: "Room", cell: (r) => <span className="font-semibold">{r.name}</span> },
        { header: "Type", cell: (r) => ROOM_TYPES.find((t) => t.value === r.type)?.label },
        { header: "Seats", cell: (r) => <span className="tabular-nums">{r.capacity}</span> },
        { header: "Building", cell: (r) => r.building || "—" },
        { header: "Used by", cell: (r) => (r.departmentId ? deptName(r.departmentId) ?? "Unknown department" : <Stamp tone="info">Shared</Stamp>) },
      ]}
      fields={[
        { key: "name", label: "Room name or number", type: "text", hint: "For example: Room 101, Physics Lab, Seminar Hall" },
        { key: "type", label: "Type", type: "select", options: ROOM_TYPES },
        { key: "capacity", label: "Seats", type: "number", min: 1, max: 1000 },
        { key: "building", label: "Building or block", type: "text", optional: true },
        {
          key: "departmentId",
          label: "Who can use it",
          type: "select",
          emptyOption: "Shared by all departments",
          options: dataset.departments.map((d) => ({ value: d.id, label: `Only ${d.name}` })),
        },
      ]}
    />
  );
}
