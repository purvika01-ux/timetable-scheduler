// Editing a college's data: plain-language checks for every setup screen, references between
// records, and a blank starting point. Pure functions, no browser APIs.

import { DAY_ORDER, minutesOf, validStarts } from "./grid.ts";
import type { Dataset, DayId, RoomType, SubjectColor, SubjectKind, TimeGrid } from "./types.ts";

export const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: "lecture", label: "Lecture room" },
  { value: "lab", label: "Lab" },
  { value: "workshop", label: "Workshop" },
];

export const SUBJECT_KINDS: { value: SubjectKind; label: string }[] = [
  { value: "theory", label: "Theory" },
  { value: "lab", label: "Lab / practical" },
];

export const SUBJECT_COLORS: SubjectColor[] = [
  "blue", "emerald", "amber", "rose", "violet", "cyan", "lime", "orange", "fuchsia", "teal", "indigo", "stone",
];

export type SetupArea = "college" | "grid" | "departments" | "rooms" | "teachers" | "subjects" | "sections" | "courses";

export interface DataProblem {
  area: SetupArea;
  /** Record the problem belongs to (absent for college and grid problems). */
  id?: string;
  /** Form field to show the message next to. */
  field?: string;
  message: string;
}

export const DAY_LABELS: Record<DayId, { label: string; short: string }> = {
  mon: { label: "Monday", short: "Mon" },
  tue: { label: "Tuesday", short: "Tue" },
  wed: { label: "Wednesday", short: "Wed" },
  thu: { label: "Thursday", short: "Thu" },
  fri: { label: "Friday", short: "Fri" },
  sat: { label: "Saturday", short: "Sat" },
};

export const MAX_SPAN = 4;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Every problem in the college's data, in setup order. An empty list means the data can be scheduled. */
export function checkDataset(d: Dataset): DataProblem[] {
  return [
    ...checkCollege(d),
    ...checkGrid(d.grid),
    ...checkDepartments(d),
    ...checkRooms(d),
    ...checkTeachers(d),
    ...checkSubjects(d),
    ...checkSections(d),
    ...checkCourses(d),
  ];
}

/** Problems for one record, keyed by field, for showing next to form inputs. */
export function fieldErrors(problems: DataProblem[], id: string): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const p of problems) {
    if (p.id === id && p.field && !errors[p.field]) errors[p.field] = p.message;
  }
  return errors;
}

function checkCollege(d: Dataset): DataProblem[] {
  const problems: DataProblem[] = [];
  if (!d.college.name.trim()) problems.push({ area: "college", field: "name", message: "Enter the college's name." });
  if (!d.college.semesterLabel.trim()) {
    problems.push({ area: "college", field: "semesterLabel", message: "Enter the semester, for example \"Odd semester 2026–27\"." });
  }
  return problems;
}

export function checkGrid(grid: TimeGrid): DataProblem[] {
  const problems: DataProblem[] = [];
  const add = (message: string, field?: string) => problems.push({ area: "grid", field, message });
  if (grid.periods.length === 0) add("Add at least one period.", "periods");
  grid.periods.forEach((p, i) => {
    if (p.number !== i + 1) add(`Periods must be numbered 1, 2, 3 and so on; found ${p.number} in position ${i + 1}.`, "periods");
    if (!TIME.test(p.start) || !TIME.test(p.end)) {
      add(`Period ${i + 1}: enter start and end times as hours and minutes, for example 09:00.`, "periods");
      return;
    }
    if (minutesOf(p.end) <= minutesOf(p.start)) add(`Period ${i + 1} must end after it starts.`, "periods");
    const prev = grid.periods[i - 1];
    if (prev && TIME.test(prev.end) && minutesOf(p.start) < minutesOf(prev.end)) {
      add(`Period ${i + 1} starts before period ${i} ends.`, "periods");
    }
  });
  if (grid.days.length === 0) add("Choose at least one teaching day.", "days");
  const seenDays = new Set<DayId>();
  for (const day of grid.days) {
    if (seenDays.has(day.id)) add(`${DAY_LABELS[day.id].label} is listed twice.`, "days");
    seenDays.add(day.id);
    if (!Number.isInteger(day.periodCount) || day.periodCount < 1 || day.periodCount > grid.periods.length) {
      add(`${DAY_LABELS[day.id].label} must have between 1 and ${grid.periods.length} periods.`, "days");
    }
  }
  const seenBreaks = new Set<number>();
  for (const b of grid.breaks) {
    if (!Number.isInteger(b.afterPeriod) || b.afterPeriod < 1 || b.afterPeriod >= grid.periods.length) {
      add(`A break must come after one of periods 1 to ${Math.max(1, grid.periods.length - 1)}.`, "breaks");
    } else if (seenBreaks.has(b.afterPeriod)) {
      add(`Two breaks come after period ${b.afterPeriod}.`, "breaks");
    }
    seenBreaks.add(b.afterPeriod);
    if (!b.label.trim()) add("Give each break a name, for example \"Lunch break\".", "breaks");
  }
  return problems;
}

function duplicates<T>(items: T[], key: (item: T) => string): Set<string> {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const item of items) {
    const k = key(item).trim().toLowerCase();
    if (!k) continue;
    if (seen.has(k)) dup.add(k);
    seen.add(k);
  }
  return dup;
}

function wholeNumber(value: number, min: number, max = Number.MAX_SAFE_INTEGER): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function checkDepartments(d: Dataset): DataProblem[] {
  const problems: DataProblem[] = [];
  const dupCode = duplicates(d.departments, (x) => x.code);
  for (const dep of d.departments) {
    const add = (field: string, message: string) => problems.push({ area: "departments", id: dep.id, field, message });
    if (!dep.name.trim()) add("name", "Enter the department's name.");
    if (!dep.code.trim()) add("code", "Enter a short code, for example CSE.");
    else if (dupCode.has(dep.code.trim().toLowerCase())) add("code", `Another department already uses the code ${dep.code}.`);
  }
  return problems;
}

function checkRooms(d: Dataset): DataProblem[] {
  const problems: DataProblem[] = [];
  const dupName = duplicates(d.rooms, (x) => x.name);
  for (const room of d.rooms) {
    const add = (field: string, message: string) => problems.push({ area: "rooms", id: room.id, field, message });
    if (!room.name.trim()) add("name", "Enter the room's name or number.");
    else if (dupName.has(room.name.trim().toLowerCase())) add("name", `Another room is also called ${room.name}.`);
    if (!wholeNumber(room.capacity, 1, 1000)) add("capacity", "Seats must be a whole number from 1 to 1000.");
    if (room.departmentId && !d.departments.some((x) => x.id === room.departmentId)) {
      add("departmentId", "Choose an existing department, or make the room shared.");
    }
  }
  return problems;
}

function checkTeachers(d: Dataset): DataProblem[] {
  const problems: DataProblem[] = [];
  const dupId = duplicates(d.teachers, (x) => x.employeeId);
  const longestDay = Math.max(0, ...d.grid.days.map((x) => x.periodCount));
  for (const t of d.teachers) {
    const add = (field: string, message: string) => problems.push({ area: "teachers", id: t.id, field, message });
    if (!t.name.trim()) add("name", "Enter the teacher's name.");
    if (t.employeeId.trim() && dupId.has(t.employeeId.trim().toLowerCase())) add("employeeId", `Another teacher has employee ID ${t.employeeId}.`);
    if (!d.departments.some((x) => x.id === t.departmentId)) add("departmentId", "Choose the teacher's department.");
    if (!wholeNumber(t.maxPeriodsPerDay, 1, Math.max(1, longestDay))) {
      add("maxPeriodsPerDay", `Daily limit must be a whole number from 1 to ${Math.max(1, longestDay)}.`);
    }
  }
  return problems;
}

function checkSubjects(d: Dataset): DataProblem[] {
  const problems: DataProblem[] = [];
  const dupCode = duplicates(d.subjects, (x) => x.code);
  for (const s of d.subjects) {
    const add = (field: string, message: string) => problems.push({ area: "subjects", id: s.id, field, message });
    if (!s.name.trim()) add("name", "Enter the subject's name.");
    if (!s.code.trim()) add("code", "Enter the subject code, for example CS301.");
    else if (dupCode.has(s.code.trim().toLowerCase())) add("code", `Another subject already uses the code ${s.code}.`);
  }
  return problems;
}

function checkSections(d: Dataset): DataProblem[] {
  const problems: DataProblem[] = [];
  const dupName = duplicates(d.sections, (x) => x.name);
  for (const s of d.sections) {
    const add = (field: string, message: string) => problems.push({ area: "sections", id: s.id, field, message });
    if (!s.name.trim()) add("name", "Enter the section's name, for example CSE 3A.");
    else if (dupName.has(s.name.trim().toLowerCase())) add("name", `Another section is also called ${s.name}.`);
    if (!wholeNumber(s.strength, 1, 1000)) add("strength", "Students must be a whole number from 1 to 1000.");
    if (!wholeNumber(s.semester, 1, 12)) add("semester", "Semester must be a whole number from 1 to 12.");
    if (!d.departments.some((x) => x.id === s.departmentId)) add("departmentId", "Choose the section's department.");
  }
  return problems;
}

function checkCourses(d: Dataset): DataProblem[] {
  const problems: DataProblem[] = [];
  for (const r of d.requirements) {
    const add = (field: string, message: string) => problems.push({ area: "courses", id: r.id, field, message });
    if (!d.subjects.some((x) => x.id === r.subjectId)) add("subjectId", "Choose a subject.");
    if (!d.sections.some((x) => x.id === r.sectionId)) add("sectionId", "Choose a section.");
    if (!d.teachers.some((x) => x.id === r.teacherId)) add("teacherId", "Choose a teacher.");
    if (!wholeNumber(r.sessionsPerWeek, 1, 20)) add("sessionsPerWeek", "Sessions a week must be a whole number from 1 to 20.");
    if (!wholeNumber(r.span, 1, MAX_SPAN)) {
      add("span", `Each session lasts 1 to ${MAX_SPAN} periods.`);
    } else if (!d.grid.days.some((day) => validStarts(d.grid, day.id, r.span).length > 0)) {
      add("span", `No day has ${r.span} periods in a row without a break.`);
    }
  }
  const dup = duplicates(d.requirements, (r) => `${r.subjectId}|${r.sectionId}|${r.teacherId}|${r.span}`);
  for (const r of d.requirements) {
    if (dup.has(`${r.subjectId}|${r.sectionId}|${r.teacherId}|${r.span}`.toLowerCase())) {
      problems.push({
        area: "courses",
        id: r.id,
        field: "subjectId",
        message: "This subject, section and teacher already have a course; change its sessions a week instead of adding another.",
      });
    }
  }
  return problems;
}

/** Records that use a given record, so it cannot be deleted while they exist. */
export function usedBy(d: Dataset, area: SetupArea, id: string): string[] {
  const subject = (sid: string) => d.subjects.find((s) => s.id === sid);
  const section = (sid: string) => d.sections.find((s) => s.id === sid);
  const course = (r: Dataset["requirements"][number]) => `${subject(r.subjectId)?.code ?? "?"} for ${section(r.sectionId)?.name ?? "?"}`;
  switch (area) {
    case "departments":
      return [
        ...d.teachers.filter((t) => t.departmentId === id).map((t) => `teacher ${t.name}`),
        ...d.sections.filter((s) => s.departmentId === id).map((s) => `section ${s.name}`),
        ...d.rooms.filter((r) => r.departmentId === id).map((r) => `room ${r.name}`),
      ];
    case "teachers":
      return d.requirements.filter((r) => r.teacherId === id).map((r) => `course ${course(r)}`);
    case "subjects":
      return d.requirements.filter((r) => r.subjectId === id).map((r) => `course ${course(r)}`);
    case "sections":
      return d.requirements.filter((r) => r.sectionId === id).map((r) => `course ${course(r)}`);
    default:
      return [];
  }
}

/** Standard weekday grid used for a new college: Monday to Saturday, 8 periods, half-day Saturday, lunch after period 4. */
export function defaultGrid(): TimeGrid {
  const times = ["09:00", "09:50", "10:40", "11:30", "13:00", "13:50", "14:40", "15:30"];
  const ends = ["09:50", "10:40", "11:30", "12:20", "13:50", "14:40", "15:30", "16:20"];
  return {
    days: DAY_ORDER.map((id) => ({ id, ...DAY_LABELS[id], periodCount: id === "sat" ? 4 : 8 })),
    periods: times.map((start, i) => ({ number: i + 1, start, end: ends[i] })),
    breaks: [{ afterPeriod: 4, start: "12:20", end: "13:00", label: "Lunch break" }],
  };
}

export function blankDataset(): Dataset {
  return {
    id: "custom",
    label: "Your college",
    description: "A college set up in this browser.",
    college: { name: "", shortName: "", semesterLabel: "" },
    grid: defaultGrid(),
    departments: [],
    teachers: [],
    rooms: [],
    subjects: [],
    sections: [],
    requirements: [],
    availability: {},
  };
}

/** Break times follow from the periods around them. */
export function withBreakTimes(grid: TimeGrid): TimeGrid {
  return {
    ...grid,
    breaks: grid.breaks.map((b) => ({
      ...b,
      start: grid.periods.find((p) => p.number === b.afterPeriod)?.end ?? b.start,
      end: grid.periods.find((p) => p.number === b.afterPeriod + 1)?.start ?? b.end,
    })),
  };
}

/** Drop availability entries for teachers or periods that no longer exist. */
export function pruneAvailability(d: Dataset): Dataset["availability"] {
  const result: Dataset["availability"] = {};
  for (const t of d.teachers) {
    const slots = (d.availability[t.id] ?? []).filter((key) => {
      const [day, period] = key.split("-");
      const cfg = d.grid.days.find((x) => x.id === day);
      return cfg !== undefined && Number(period) >= 1 && Number(period) <= cfg.periodCount;
    });
    if (slots.length > 0) result[t.id] = slots;
  }
  return result;
}

/** A new id for a record, unique within this browser's data. */
export function newId(prefix: string, random: () => string = defaultRandom): string {
  return `${prefix}-${random()}`;
}

function defaultRandom(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
}
