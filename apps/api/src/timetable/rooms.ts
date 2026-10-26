import type { Dataset, Room, SessionRequirement } from "./types.ts";

/** A room owned by a department is only for that department; a room with no owner is shared by all. */
export function roomUsableBy(room: Room, departmentId: string | undefined): boolean {
  return !room.departmentId || room.departmentId === departmentId;
}

/** Rooms of the right type, large enough, and open to the section's department, smallest first. */
export function eligibleRooms(dataset: Dataset, req: SessionRequirement): Room[] {
  const section = dataset.sections.find((s) => s.id === req.sectionId);
  return dataset.rooms
    .filter(
      (r) =>
        r.type === req.roomType &&
        r.capacity >= (section?.strength ?? Infinity) &&
        roomUsableBy(r, section?.departmentId),
    )
    .sort((a, b) => a.capacity - b.capacity);
}
