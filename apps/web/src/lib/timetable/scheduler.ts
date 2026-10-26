// Deterministic greedy scheduler for the demo dataset.
//
// 1. Expand each requirement into individual weekly sessions.
// 2. Place the most constrained sessions first (fewest valid slot x room options; labs first).
// 3. For each session pick the lowest-penalty slot that keeps teacher, room, and section free,
//    respects availability, room type and capacity, the daily load limit, and never crosses a break.
// 4. Retry with unplaced sessions moved to the front; keep the best attempt.
// Sessions that still do not fit are returned with reasons, never dropped silently.
// The result must still pass the independent validator (validator.ts) before it is shown as valid.

import { teachingCapacity } from "./capacity.ts";
import { coveredPeriods, DAY_ORDER, validStarts } from "./grid.ts";
import type {
  AvailabilityMap,
  Dataset,
  DayId,
  GenerationResult,
  Room,
  ScheduledEntry,
  SessionRequirement,
  UnplacedSession,
} from "./types.ts";

export interface GenerateOptions {
  seed?: number;
  maxAttempts?: number;
}

interface SessionTask {
  req: SessionRequirement;
  occurrence: number;
  /** (day, start) pairs that fit the grid and the teacher's availability. */
  slots: { day: DayId; start: number }[];
  rooms: Room[];
  difficulty: number;
}

/** Small seeded PRNG (mulberry32) so the same seed always gives the same timetable. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Occupancy {
  teacher = new Set<string>();
  section = new Set<string>();
  room = new Set<string>();
  teacherDayLoad = new Map<string, number>();
  sectionDayLoad = new Map<string, number>();
  sectionSubjectDay = new Set<string>();

  teacherFree(id: string, day: DayId, periods: number[]) {
    return periods.every((p) => !this.teacher.has(`${id}|${day}|${p}`));
  }
  sectionFree(id: string, day: DayId, periods: number[]) {
    return periods.every((p) => !this.section.has(`${id}|${day}|${p}`));
  }
  roomFree(id: string, day: DayId, periods: number[]) {
    return periods.every((p) => !this.room.has(`${id}|${day}|${p}`));
  }
  load(map: Map<string, number>, id: string, day: DayId) {
    return map.get(`${id}|${day}`) ?? 0;
  }
  place(entry: ScheduledEntry) {
    for (const p of coveredPeriods(entry.startPeriod, entry.span)) {
      this.teacher.add(`${entry.teacherId}|${entry.day}|${p}`);
      this.section.add(`${entry.sectionId}|${entry.day}|${p}`);
      this.room.add(`${entry.roomId}|${entry.day}|${p}`);
    }
    const t = `${entry.teacherId}|${entry.day}`;
    const s = `${entry.sectionId}|${entry.day}`;
    this.teacherDayLoad.set(t, (this.teacherDayLoad.get(t) ?? 0) + entry.span);
    this.sectionDayLoad.set(s, (this.sectionDayLoad.get(s) ?? 0) + entry.span);
    this.sectionSubjectDay.add(`${entry.sectionId}|${entry.subjectId}|${entry.day}`);
  }
}

function buildTasks(dataset: Dataset, availability: AvailabilityMap): SessionTask[] {
  const tasks: SessionTask[] = [];
  for (const req of dataset.requirements) {
    const section = dataset.sections.find((s) => s.id === req.sectionId);
    const unavailable = new Set(availability[req.teacherId] ?? []);
    const slots = DAY_ORDER.flatMap((day) =>
      validStarts(dataset.grid, day, req.span)
        .filter((start) => coveredPeriods(start, req.span).every((p) => !unavailable.has(`${day}-${p}`)))
        .map((start) => ({ day, start })),
    );
    const rooms = dataset.rooms
      .filter((r) => r.type === req.roomType && r.capacity >= (section?.strength ?? Infinity))
      .sort((a, b) => a.capacity - b.capacity);
    for (let occurrence = 1; occurrence <= req.sessionsPerWeek; occurrence++) {
      tasks.push({ req, occurrence, slots, rooms, difficulty: slots.length * rooms.length });
    }
  }
  return tasks;
}

function runAttempt(
  dataset: Dataset,
  order: SessionTask[],
  rng: () => number,
): { entries: ScheduledEntry[]; failed: SessionTask[]; occupancy: Occupancy; penalty: number } {
  const occ = new Occupancy();
  const entries: ScheduledEntry[] = [];
  const failed: SessionTask[] = [];
  let penalty = 0;

  for (const task of order) {
    const { req } = task;
    const teacher = dataset.teachers.find((t) => t.id === req.teacherId);
    const maxPerDay = teacher?.maxPeriodsPerDay ?? Infinity;
    let best: { entry: ScheduledEntry; score: number } | null = null;

    for (const { day, start } of task.slots) {
      const periods = coveredPeriods(start, req.span);
      if (!occ.teacherFree(req.teacherId, day, periods)) continue;
      if (!occ.sectionFree(req.sectionId, day, periods)) continue;
      if (occ.load(occ.teacherDayLoad, req.teacherId, day) + req.span > maxPerDay) continue;
      // Rooms are sorted smallest-first, so the first free one is the tightest fit.
      const room = task.rooms.find((r) => occ.roomFree(r.id, day, periods));
      if (!room) continue;

      const dayPeriods = dataset.grid.days.find((d) => d.id === day)?.periodCount ?? 0;
      let score = 0;
      if (occ.sectionSubjectDay.has(`${req.sectionId}|${req.subjectId}|${day}`)) score += 20; // spread across the week
      score += occ.load(occ.sectionDayLoad, req.sectionId, day) * 0.6; // balance section days
      score += occ.load(occ.teacherDayLoad, req.teacherId, day) * 0.6; // balance teacher load
      if (req.span > 1 && start <= 4) score += 1; // labs preferably in the afternoon
      if (start === 1 || start + req.span - 1 === dayPeriods) score += 0.5; // avoid first and last periods
      score += rng() * 0.3; // seeded tie-break

      if (!best || score < best.score) {
        best = {
          score,
          entry: {
            id: `${req.id}#${task.occurrence}`,
            requirementId: req.id,
            subjectId: req.subjectId,
            teacherId: req.teacherId,
            sectionId: req.sectionId,
            roomId: room.id,
            day,
            startPeriod: start,
            span: req.span,
          },
        };
      }
    }

    if (best) {
      occ.place(best.entry);
      entries.push(best.entry);
      penalty += best.score;
    } else {
      failed.push(task);
    }
  }
  return { entries, failed, occupancy: occ, penalty };
}

function explain(
  dataset: Dataset,
  availability: AvailabilityMap,
  task: SessionTask,
  occ: Occupancy,
): string[] {
  const { req } = task;
  const teacher = dataset.teachers.find((t) => t.id === req.teacherId);
  const section = dataset.sections.find((s) => s.id === req.sectionId);
  const teacherName = teacher?.name ?? "The teacher";
  const reasons: string[] = [];

  if (task.rooms.length === 0) {
    const ofType = dataset.rooms.filter((r) => r.type === req.roomType);
    if (ofType.length === 0) {
      reasons.push(`The college has no ${req.roomType} room.`);
    } else {
      const largest = Math.max(...ofType.map((r) => r.capacity));
      reasons.push(
        `No ${req.roomType} room seats ${section?.strength} students (the largest holds ${largest}).`,
      );
    }
  }
  if (task.slots.length === 0) {
    reasons.push(
      req.span > 1
        ? `${teacherName} has no available block of ${req.span} consecutive periods.`
        : `${teacherName} has no available period.`,
    );
  }

  if (teacher) {
    reasons.push(
      ...teachingCapacity(dataset.grid, teacher, dataset.requirements, availability[req.teacherId] ?? []).problems,
    );
  }

  if (task.rooms.length > 0 && task.slots.length > 0) {
    let teacherBusy = 0;
    let sectionBusy = 0;
    let roomsFull = 0;
    let dailyLimit = 0;
    for (const { day, start } of task.slots) {
      const periods = coveredPeriods(start, req.span);
      if (!occ.teacherFree(req.teacherId, day, periods)) teacherBusy++;
      else if (!occ.sectionFree(req.sectionId, day, periods)) sectionBusy++;
      else if (occ.load(occ.teacherDayLoad, req.teacherId, day) + req.span > (teacher?.maxPeriodsPerDay ?? Infinity)) dailyLimit++;
      else if (!task.rooms.some((r) => occ.roomFree(r.id, day, periods))) roomsFull++;
    }
    const parts = [
      teacherBusy && `${teacherName} already teaching (${teacherBusy})`,
      sectionBusy && `${section?.name ?? "section"} already in class (${sectionBusy})`,
      dailyLimit && `daily limit of ${teacher?.maxPeriodsPerDay} periods reached (${dailyLimit})`,
      roomsFull && `every suitable room taken (${roomsFull})`,
    ].filter(Boolean);
    reasons.push(
      `All ${task.slots.length} slots where ${teacherName} is available are blocked: ${parts.join(", ")}.`,
    );
  }
  return reasons;
}

export function generateTimetable(
  dataset: Dataset,
  availability: AvailabilityMap,
  options: GenerateOptions = {},
): GenerationResult {
  const seed = options.seed ?? 1;
  const maxAttempts = options.maxAttempts ?? 8;
  const tasks = buildTasks(dataset, availability);

  let best: ReturnType<typeof runAttempt> | null = null;
  let priority = new Set<SessionTask>();
  let attempts = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attempts++;
    const rng = seededRandom(seed * 7919 + attempt);
    const jitter = new Map(tasks.map((t) => [t, rng()]));
    const order = [...tasks].sort(
      (a, b) =>
        Number(priority.has(b)) - Number(priority.has(a)) ||
        a.difficulty - b.difficulty ||
        b.req.span - a.req.span ||
        jitter.get(a)! - jitter.get(b)!,
    );
    const result = runAttempt(dataset, order, rng);
    if (
      !best ||
      result.failed.length < best.failed.length ||
      (result.failed.length === best.failed.length && result.penalty < best.penalty)
    ) {
      best = result;
    }
    if (result.failed.length === 0) break;
    // Sessions that can never be placed (no room / no slot) do not need priority.
    priority = new Set([...priority, ...result.failed.filter((t) => t.difficulty > 0)]);
  }

  const final = best!;
  const unplaced: UnplacedSession[] = final.failed
    .map((task) => ({
      requirementId: task.req.id,
      occurrence: task.occurrence,
      subjectId: task.req.subjectId,
      teacherId: task.req.teacherId,
      sectionId: task.req.sectionId,
      span: task.req.span,
      reasons: explain(dataset, availability, task, final.occupancy),
    }))
    .sort((a, b) => a.requirementId.localeCompare(b.requirementId) || a.occurrence - b.occurrence);

  const entries = [...final.entries].sort(
    (a, b) =>
      DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) ||
      a.startPeriod - b.startPeriod ||
      a.sectionId.localeCompare(b.sectionId),
  );

  return { entries, unplaced, seed, totalSessions: tasks.length, attempts };
}
