// Independent clash checker. It shares no placement logic with the scheduler: it takes any list of
// entries (generated or hand-edited) and re-derives every hard rule from the raw data.
// A timetable is only called clash-free when this returns `valid: true`, and only called complete
// when it returns `complete: true` (every requirement has all of its weekly sessions).

import type {
  AvailabilityMap,
  Dataset,
  IssueKind,
  MissingSessions,
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
  "roomAccess",
  "grid",
  "dailyLimit",
  "requirement",
  "duplicate",
  "reference",
];

function rangesOverlap(a: ScheduledEntry, b: ScheduledEntry): boolean {
  return a.day === b.day && a.startPeriod < b.startPeriod + b.span && b.startPeriod < a.startPeriod + a.span;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return groups;
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
  const department = new Map(dataset.departments.map((d) => [d.id, d]));
  const label = (e: ScheduledEntry) =>
    `${subject.get(e.subjectId)?.code ?? e.subjectId} (${section.get(e.sectionId)?.name ?? e.sectionId}, ${dayConfig.get(e.day)?.short ?? e.day} P${e.startPeriod})`;

  // Every entry needs its own id: moves and issues refer to entries by id.
  for (const [id, same] of groupBy(entries, (e) => e.id)) {
    if (same.length > 1) {
      issues.push({ kind: "duplicate", entryIds: [id], message: `${same.length} classes share the id "${id}".` });
    }
  }

  // Period numbers must be whole numbers; anything else cannot be placed on the grid or compared.
  const placeable: ScheduledEntry[] = [];
  for (const e of entries) {
    if (Number.isInteger(e.startPeriod) && Number.isInteger(e.span)) {
      placeable.push(e);
    } else {
      issues.push({ kind: "grid", entryIds: [e.id], message: `${label(e)} has an invalid period or length.` });
    }
  }

  // Pairwise double-booking checks.
  for (let i = 0; i < placeable.length; i++) {
    for (let j = i + 1; j < placeable.length; j++) {
      const a = placeable[i]!;
      const b = placeable[j]!;
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
  const known: ScheduledEntry[] = [];
  for (const e of placeable) {
    const t = teacher.get(e.teacherId);
    const r = room.get(e.roomId);
    const s = section.get(e.sectionId);
    const d = dayConfig.get(e.day);
    const req = requirement.get(e.requirementId);
    if (!t || !r || !s || !d || !req || !subject.has(e.subjectId)) {
      issues.push({ kind: "reference", entryIds: [e.id], message: `${label(e)} refers to unknown data.` });
      continue;
    }
    known.push(e);
    const mismatched = [
      e.subjectId !== req.subjectId && "subject",
      e.teacherId !== req.teacherId && "teacher",
      e.sectionId !== req.sectionId && "section",
    ].filter(Boolean);
    if (mismatched.length > 0) {
      issues.push({
        kind: "requirement",
        entryIds: [e.id],
        message: `${label(e)} does not match its course: wrong ${mismatched.join(" and ")}.`,
      });
    }
    if (e.span !== req.span) {
      issues.push({
        kind: "requirement",
        entryIds: [e.id],
        message: `${label(e)} lasts ${e.span} ${e.span === 1 ? "period" : "periods"}, but each session needs ${req.span}.`,
      });
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
    if (r.departmentId && r.departmentId !== s.departmentId) {
      issues.push({
        kind: "roomAccess",
        entryIds: [e.id],
        message: `${r.name} belongs to ${department.get(r.departmentId)?.name ?? "another department"}, so ${s.name} cannot use it.`,
      });
    }
    if (req.roomType !== r.type) {
      issues.push({
        kind: "roomType",
        entryIds: [e.id],
        message: `${label(e)} needs a ${req.roomType} room, but ${r.name} is a ${r.type} room.`,
      });
    }
  }

  // Each teacher's daily teaching limit.
  for (const [, same] of groupBy(known, (e) => `${e.teacherId}|${e.day}`)) {
    const t = teacher.get(same[0]!.teacherId)!;
    const load = same.reduce((n, e) => n + e.span, 0);
    if (load > t.maxPeriodsPerDay) {
      issues.push({
        kind: "dailyLimit",
        entryIds: same.map((e) => e.id),
        message: `${t.name} would teach ${load} periods on ${dayConfig.get(same[0]!.day)!.label}; the daily limit is ${t.maxPeriodsPerDay}.`,
      });
    }
  }

  // Weekly session counts: too many is a rule break; too few makes the timetable incomplete.
  const byRequirement = groupBy(known, (e) => e.requirementId);
  const missing: MissingSessions[] = [];
  for (const req of dataset.requirements) {
    const scheduled = byRequirement.get(req.id) ?? [];
    if (scheduled.length > req.sessionsPerWeek) {
      issues.push({
        kind: "requirement",
        entryIds: scheduled.map((e) => e.id),
        message: `${subject.get(req.subjectId)?.code ?? req.subjectId} for ${section.get(req.sectionId)?.name ?? req.sectionId} has ${scheduled.length} sessions a week, but needs ${req.sessionsPerWeek}.`,
      });
    } else if (scheduled.length < req.sessionsPerWeek) {
      missing.push({ requirementId: req.id, missing: req.sessionsPerWeek - scheduled.length });
    }
  }

  const counts = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<IssueKind, number>;
  for (const issue of issues) counts[issue.kind]++;
  return { valid: issues.length === 0, complete: missing.length === 0, counts, issues, missing };
}
