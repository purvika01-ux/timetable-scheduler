// Independent clash checker. It shares no placement logic with the scheduler: it takes any list of
// entries (generated or hand-edited) and re-derives every hard rule from the raw data.
// A timetable is only called clash-free when this returns `valid: true`.

import type {
  AvailabilityMap,
  Dataset,
  IssueKind,
  ScheduledEntry,
  ValidationIssue,
  ValidationReport,
} from "./types.ts";

const KINDS: IssueKind[] = [
  "teacher",
  "room",
  "section",
  "availability",
  "capacity",
  "roomType",
  "grid",
  "reference",
];

function rangesOverlap(a: ScheduledEntry, b: ScheduledEntry): boolean {
  return a.day === b.day && a.startPeriod < b.startPeriod + b.span && b.startPeriod < a.startPeriod + a.span;
}

export function validateTimetable(
  dataset: Dataset,
  entries: ScheduledEntry[],
  availability: AvailabilityMap,
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const teacher = new Map(dataset.teachers.map((t) => [t.id, t]));
  const room = new Map(dataset.rooms.map((r) => [r.id, r]));
  const section = new Map(dataset.sections.map((s) => [s.id, s]));
  const subject = new Map(dataset.subjects.map((s) => [s.id, s]));
  const requirement = new Map(dataset.requirements.map((r) => [r.id, r]));
  const dayConfig = new Map(dataset.grid.days.map((d) => [d.id, d]));
  const label = (e: ScheduledEntry) =>
    `${subject.get(e.subjectId)?.code ?? e.subjectId} (${section.get(e.sectionId)?.name ?? e.sectionId}, ${dayConfig.get(e.day)?.short ?? e.day} P${e.startPeriod})`;

  // Pairwise double-booking checks.
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (!rangesOverlap(a, b)) continue;
      const ids = [a.id, b.id];
      if (a.teacherId === b.teacherId) {
        issues.push({
          kind: "teacher",
          entryIds: ids,
          message: `${teacher.get(a.teacherId)?.name ?? "A teacher"} is booked twice: ${label(a)} and ${label(b)}.`,
        });
      }
      if (a.roomId === b.roomId) {
        issues.push({
          kind: "room",
          entryIds: ids,
          message: `${room.get(a.roomId)?.name ?? "A room"} is booked twice: ${label(a)} and ${label(b)}.`,
        });
      }
      if (a.sectionId === b.sectionId) {
        issues.push({
          kind: "section",
          entryIds: ids,
          message: `${section.get(a.sectionId)?.name ?? "A section"} has two classes at once: ${label(a)} and ${label(b)}.`,
        });
      }
    }
  }

  // Per-entry rule checks.
  for (const e of entries) {
    const t = teacher.get(e.teacherId);
    const r = room.get(e.roomId);
    const s = section.get(e.sectionId);
    const d = dayConfig.get(e.day);
    if (!t || !r || !s || !d || !subject.has(e.subjectId)) {
      issues.push({ kind: "reference", entryIds: [e.id], message: `${label(e)} refers to unknown data.` });
      continue;
    }
    const last = e.startPeriod + e.span - 1;
    if (e.startPeriod < 1 || e.span < 1 || last > d.periodCount) {
      issues.push({
        kind: "grid",
        entryIds: [e.id],
        message: `${label(e)} runs outside ${d.label}'s ${d.periodCount} periods.`,
      });
    }
    const crossed = dataset.grid.breaks.find((b) => e.startPeriod <= b.afterPeriod && last > b.afterPeriod);
    if (crossed) {
      issues.push({
        kind: "grid",
        entryIds: [e.id],
        message: `${label(e)} runs across the ${crossed.label.toLowerCase()}.`,
      });
    }
    const unavailable = new Set(availability[e.teacherId] ?? []);
    const blocked = Array.from({ length: e.span }, (_, k) => e.startPeriod + k).filter((p) =>
      unavailable.has(`${e.day}-${p}`),
    );
    if (blocked.length > 0) {
      issues.push({
        kind: "availability",
        entryIds: [e.id],
        message: `${t.name} marked ${d.label} period ${blocked.join(", ")} as unavailable, but ${label(e)} is scheduled then.`,
      });
    }
    if (r.capacity < s.strength) {
      issues.push({
        kind: "capacity",
        entryIds: [e.id],
        message: `${r.name} seats ${r.capacity}, but ${s.name} has ${s.strength} students.`,
      });
    }
    const req = requirement.get(e.requirementId);
    if (req && req.roomType !== r.type) {
      issues.push({
        kind: "roomType",
        entryIds: [e.id],
        message: `${label(e)} needs a ${req.roomType} room, but ${r.name} is a ${r.type} room.`,
      });
    }
  }

  const counts = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<IssueKind, number>;
  for (const issue of issues) counts[issue.kind]++;
  return { valid: issues.length === 0, counts, issues };
}

/** Issues that involve one particular entry (used to accept or reject a manual move). */
export function issuesForEntry(report: ValidationReport, entryId: string): ValidationIssue[] {
  return report.issues.filter((i) => i.entryIds.includes(entryId));
}
