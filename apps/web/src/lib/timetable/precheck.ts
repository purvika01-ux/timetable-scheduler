// Checks run before generating, in plain language. Blocking items mean some sessions cannot be
// placed whatever the generator does; warnings are worth a look but do not stop generation.

import { teachingCapacity } from "./capacity.ts";
import { checkDataset, type SetupArea } from "./college.ts";
import { totalTeachingPeriods } from "./grid.ts";
import { eligibleRooms } from "./rooms.ts";
import type { Dataset } from "./types.ts";

export interface PrecheckItem {
  severity: "blocking" | "warning";
  area: SetupArea;
  id?: string;
  message: string;
}

export function precheck(d: Dataset): PrecheckItem[] {
  const items: PrecheckItem[] = checkDataset(d).map((p) => ({ severity: "blocking", area: p.area, id: p.id, message: p.message }));
  // Capacity checks assume the data itself is well formed.
  if (items.length > 0) return items;

  if (d.requirements.length === 0) {
    items.push({ severity: "blocking", area: "courses", message: "Add at least one course: which teacher teaches which subject to which section." });
  }

  for (const req of d.requirements) {
    if (eligibleRooms(d, req).length > 0) continue;
    const section = d.sections.find((s) => s.id === req.sectionId)!;
    const subject = d.subjects.find((s) => s.id === req.subjectId)!;
    const ofType = d.rooms.filter((r) => r.type === req.roomType);
    const big = ofType.filter((r) => r.capacity >= section.strength);
    const why =
      ofType.length === 0
        ? `the college has no ${req.roomType} room`
        : big.length === 0
          ? `no ${req.roomType} room seats ${section.strength} students (the largest holds ${Math.max(...ofType.map((r) => r.capacity))})`
          : `every ${req.roomType} room large enough belongs to another department`;
    items.push({ severity: "blocking", area: "rooms", id: req.id, message: `${subject.code} for ${section.name}: ${why}.` });
  }

  for (const t of d.teachers) {
    for (const problem of teachingCapacity(d.grid, t, d.requirements, d.availability[t.id] ?? []).problems) {
      items.push({ severity: "blocking", area: "teachers", id: t.id, message: problem });
    }
  }

  const weekly = totalTeachingPeriods(d.grid);
  for (const s of d.sections) {
    const needed = d.requirements.filter((r) => r.sectionId === s.id).reduce((n, r) => n + r.sessionsPerWeek * r.span, 0);
    if (needed > weekly) {
      items.push({
        severity: "blocking",
        area: "sections",
        id: s.id,
        message: `${s.name} needs ${needed} periods a week, but the week has only ${weekly}.`,
      });
    } else if (needed === 0) {
      items.push({ severity: "warning", area: "sections", id: s.id, message: `${s.name} has no courses yet.` });
    }
  }

  for (const t of d.teachers) {
    if (!d.requirements.some((r) => r.teacherId === t.id)) {
      items.push({ severity: "warning", area: "teachers", id: t.id, message: `${t.name} has no courses yet.` });
    }
  }

  for (const type of ["lecture", "lab", "workshop"] as const) {
    const demand = d.requirements.filter((r) => r.roomType === type).reduce((n, r) => n + r.sessionsPerWeek * r.span, 0);
    const supply = d.rooms.filter((r) => r.type === type).length * weekly;
    if (supply > 0 && demand > supply * 0.85) {
      items.push({
        severity: demand > supply ? "blocking" : "warning",
        area: "rooms",
        message:
          demand > supply
            ? `Courses need ${demand} ${type}-room periods a week, but the ${type} rooms offer only ${supply}.`
            : `${type[0].toUpperCase()}${type.slice(1)} rooms are ${Math.round((demand / supply) * 100)}% booked; generation may struggle to fit everything.`,
      });
    }
  }
  return items;
}
