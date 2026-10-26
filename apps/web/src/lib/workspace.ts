// The college being worked on in this browser: its data plus its current timetable. Pure functions
// for parsing what is stored or imported (both untrusted) and for the export file format.

import { ROOM_TYPES, SUBJECT_COLORS, SUBJECT_KINDS } from "./timetable/college.ts";
import { DAY_ORDER, parseSlotKey } from "./timetable/grid.ts";
import { generateTimetable } from "./timetable/scheduler.ts";
import type {
  Dataset,
  DayId,
  Department,
  IssueKind,
  Room,
  ScheduledEntry,
  Section,
  SessionRequirement,
  SlotKey,
  Subject,
  Teacher,
  TimeGrid,
} from "./timetable/types.ts";
import { validateTimetable } from "./timetable/validator.ts";

export type TimetableSource = "sample" | "generated" | "edited";

export interface SavedTimetable {
  source: TimetableSource;
  seed: number | null;
  updatedAt: string;
  entries: ScheduledEntry[];
}

export interface Workspace {
  version: 1;
  dataset: Dataset;
  timetable: SavedTimetable | null;
}

export interface ParseResult<T> {
  value: T | null;
  /** Set when data existed but could not be used. */
  problem?: string;
}

export const COLLEGE_FILE_FORMAT = "college-timetable-optimizer";
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 2000;

/** A sample college with its generated timetable. */
export function sampleWorkspace(dataset: Dataset, now = new Date()): Workspace {
  const copy = structuredClone(dataset);
  const result = generateTimetable(copy, copy.availability, { seed: 1 });
  return {
    version: 1,
    dataset: copy,
    timetable: { source: "sample", seed: 1, updatedAt: now.toISOString(), entries: result.entries },
  };
}

// ---------------------------------------------------------------------------------------------
// Structural checks. Each returns a clean copy (only known fields) or throws ShapeError.

class ShapeError extends Error {}

function fail(where: string): never {
  throw new ShapeError(where);
}

function record(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(where);
  return v as Record<string, unknown>;
}

function text(v: unknown, where: string, max = 200): string {
  if (typeof v !== "string" || v.length > max) fail(where);
  return v;
}

function optionalText(v: unknown, where: string, max = 200): string | undefined {
  return v === undefined || v === null || v === "" ? undefined : text(v, where, max);
}

/** `{ key: value }` when the value is present, otherwise nothing (keeps absent fields absent). */
function withOptional<K extends string>(key: K, value: string | undefined): { [P in K]?: string } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: string };
}

function int(v: unknown, where: string): number {
  if (!Number.isInteger(v)) fail(where);
  return v as number;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], where: string): T {
  if (typeof v !== "string" || !allowed.includes(v as T)) fail(where);
  return v as T;
}

function list<T>(v: unknown, where: string, item: (x: unknown, w: string) => T): T[] {
  if (!Array.isArray(v) || v.length > MAX_ITEMS) fail(where);
  const items = v.map((x, i) => item(x, `${where}[${i}]`));
  const ids = items.map((x) => (x as { id?: string }).id).filter((id): id is string => typeof id === "string");
  if (new Set(ids).size !== ids.length) fail(`${where}: duplicate ids`);
  return items;
}

function parseGrid(v: unknown): TimeGrid {
  const g = record(v, "grid");
  return {
    days: list(g.days, "grid.days", (x, w) => {
      const d = record(x, w);
      const id = oneOf(d.id, DAY_ORDER, `${w}.id`) as DayId;
      return { id, label: text(d.label, `${w}.label`), short: text(d.short, `${w}.short`), periodCount: int(d.periodCount, `${w}.periodCount`) };
    }),
    periods: list(g.periods, "grid.periods", (x, w) => {
      const p = record(x, w);
      return { number: int(p.number, `${w}.number`), start: text(p.start, `${w}.start`, 5), end: text(p.end, `${w}.end`, 5) };
    }),
    breaks: list(g.breaks, "grid.breaks", (x, w) => {
      const b = record(x, w);
      return {
        afterPeriod: int(b.afterPeriod, `${w}.afterPeriod`),
        start: text(b.start, `${w}.start`, 5),
        end: text(b.end, `${w}.end`, 5),
        label: text(b.label, `${w}.label`),
      };
    }),
  };
}

/** Structural check of a whole college. Rules about the data's meaning are in `checkDataset`. */
export function parseDataset(v: unknown): Dataset {
  const d = record(v, "college data");
  const college = record(d.college, "college");
  const dataset: Dataset = {
    id: text(d.id, "id"),
    label: text(d.label, "label"),
    description: text(d.description, "description", 500),
    college: {
      name: text(college.name, "college.name"),
      shortName: text(college.shortName, "college.shortName"),
      semesterLabel: text(college.semesterLabel, "college.semesterLabel"),
    },
    grid: parseGrid(d.grid),
    departments: list(d.departments, "departments", (x, w): Department => {
      const r = record(x, w);
      return { id: text(r.id, `${w}.id`), code: text(r.code, `${w}.code`), name: text(r.name, `${w}.name`) };
    }),
    teachers: list(d.teachers, "teachers", (x, w): Teacher => {
      const r = record(x, w);
      return {
        id: text(r.id, `${w}.id`),
        name: text(r.name, `${w}.name`),
        designation: text(r.designation, `${w}.designation`),
        departmentId: text(r.departmentId, `${w}.departmentId`),
        employeeId: text(r.employeeId, `${w}.employeeId`),
        ...withOptional("email", optionalText(r.email, `${w}.email`)),
        maxPeriodsPerDay: int(r.maxPeriodsPerDay, `${w}.maxPeriodsPerDay`),
      };
    }),
    rooms: list(d.rooms, "rooms", (x, w): Room => {
      const r = record(x, w);
      return {
        id: text(r.id, `${w}.id`),
        name: text(r.name, `${w}.name`),
        type: oneOf(r.type, ROOM_TYPES.map((t) => t.value), `${w}.type`),
        capacity: int(r.capacity, `${w}.capacity`),
        building: text(r.building, `${w}.building`),
        ...withOptional("departmentId", optionalText(r.departmentId, `${w}.departmentId`)),
      };
    }),
    subjects: list(d.subjects, "subjects", (x, w): Subject => {
      const r = record(x, w);
      return {
        id: text(r.id, `${w}.id`),
        code: text(r.code, `${w}.code`),
        name: text(r.name, `${w}.name`),
        kind: oneOf(r.kind, SUBJECT_KINDS.map((k) => k.value), `${w}.kind`),
        color: oneOf(r.color, SUBJECT_COLORS, `${w}.color`),
      };
    }),
    sections: list(d.sections, "sections", (x, w): Section => {
      const r = record(x, w);
      return {
        id: text(r.id, `${w}.id`),
        name: text(r.name, `${w}.name`),
        programme: text(r.programme, `${w}.programme`),
        semester: int(r.semester, `${w}.semester`),
        strength: int(r.strength, `${w}.strength`),
        departmentId: text(r.departmentId, `${w}.departmentId`),
      };
    }),
    requirements: list(d.requirements, "courses", (x, w): SessionRequirement => {
      const r = record(x, w);
      return {
        id: text(r.id, `${w}.id`),
        subjectId: text(r.subjectId, `${w}.subjectId`),
        teacherId: text(r.teacherId, `${w}.teacherId`),
        sectionId: text(r.sectionId, `${w}.sectionId`),
        sessionsPerWeek: int(r.sessionsPerWeek, `${w}.sessionsPerWeek`),
        span: int(r.span, `${w}.span`),
        roomType: oneOf(r.roomType, ROOM_TYPES.map((t) => t.value), `${w}.roomType`),
      };
    }),
    availability: {},
  };
  const availability = record(d.availability, "availability");
  for (const [teacherId, slots] of Object.entries(availability)) {
    if (!dataset.teachers.some((t) => t.id === teacherId)) fail(`availability: unknown teacher ${teacherId}`);
    const clean = list(slots, `availability.${teacherId}`, (s, w) => {
      if (typeof s !== "string" || !parseSlotKey(s)) fail(w);
      return s as SlotKey;
    });
    dataset.availability[teacherId] = [...new Set(clean)];
  }
  return dataset;
}

const ENTRY_TEXT = ["id", "requirementId", "subjectId", "teacherId", "sectionId", "roomId"] as const;

/**
 * Issue kinds that editing the college's data can never cause once the timetable is reconciled
 * (`reconcileTimetable`). Finding one in stored or imported data means it was altered or damaged.
 */
const CORRUPTION: IssueKind[] = ["teacher", "room", "section", "duplicate", "reference", "requirement"];

/**
 * Entries must point at this college's data and contain no clash. Other rule breaks (a lowered
 * daily limit, a smaller room, new unavailability) can follow from legitimate data edits; they are
 * kept and shown as problems to fix.
 */
function parseEntries(v: unknown, dataset: Dataset): ScheduledEntry[] {
  const entries = list(v, "timetable.entries", (x, w): ScheduledEntry => {
    const e = record(x, w);
    const clean = Object.fromEntries(ENTRY_TEXT.map((k) => [k, text(e[k], `${w}.${k}`)])) as Record<(typeof ENTRY_TEXT)[number], string>;
    return { ...clean, day: oneOf(e.day, DAY_ORDER, `${w}.day`), startPeriod: int(e.startPeriod, `${w}.startPeriod`), span: int(e.span, `${w}.span`) };
  });
  const report = validateTimetable(dataset, entries, {});
  if (CORRUPTION.some((k) => report.counts[k] > 0)) fail("timetable breaks a scheduling rule");
  return entries;
}

/**
 * Keep a timetable in step with edited data: classes whose course, room, teacher, subject or section
 * no longer match are removed (they show up as missing sessions), and extra sessions beyond a
 * course's weekly count are dropped. Returns the kept entries and how many were removed.
 */
export function reconcileTimetable(dataset: Dataset, entries: ScheduledEntry[]): { entries: ScheduledEntry[]; removed: number } {
  const perRequirement = new Map<string, number>();
  const kept = entries.filter((e) => {
    const req = dataset.requirements.find((r) => r.id === e.requirementId);
    const fits =
      req !== undefined &&
      req.teacherId === e.teacherId &&
      req.subjectId === e.subjectId &&
      req.sectionId === e.sectionId &&
      req.span === e.span &&
      dataset.rooms.some((r) => r.id === e.roomId) &&
      dataset.grid.days.some((d) => d.id === e.day);
    if (!fits) return false;
    const count = (perRequirement.get(req.id) ?? 0) + 1;
    perRequirement.set(req.id, count);
    return count <= req.sessionsPerWeek;
  });
  return { entries: kept, removed: entries.length - kept.length };
}

function parseTimetable(v: unknown, dataset: Dataset): SavedTimetable | null {
  if (v === null || v === undefined) return null;
  const t = record(v, "timetable");
  return {
    source: oneOf(t.source, ["sample", "generated", "edited"] as const, "timetable.source"),
    seed: t.seed === null || t.seed === undefined ? null : int(t.seed, "timetable.seed"),
    updatedAt: typeof t.updatedAt === "string" ? t.updatedAt : new Date(0).toISOString(),
    entries: parseEntries(t.entries, dataset),
  };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Parse what this browser stored. Bad data is never used. */
export function parseWorkspace(raw: string | null): ParseResult<Workspace> & { timetableProblem?: string } {
  if (raw === null) return { value: null };
  const problem = "Your saved college could not be read (it may be from an older version), so the sample college is shown.";
  const data = safeJson(raw);
  try {
    const w = record(data, "workspace");
    if (w.version !== 1) return { value: null, problem };
    const dataset = parseDataset(w.dataset);
    try {
      return { value: { version: 1, dataset, timetable: parseTimetable(w.timetable, dataset) } };
    } catch (e) {
      if (!(e instanceof ShapeError)) throw e;
      return {
        value: { version: 1, dataset, timetable: null },
        timetableProblem: "Your saved timetable contained a clash or damaged entries, so it was removed. Your college data was kept; generate a new timetable.",
      };
    }
  } catch (e) {
    if (!(e instanceof ShapeError)) throw e;
    return { value: null, problem };
  }
}

/** The file a coordinator downloads to back up or move a college to another browser. */
export function toCollegeFile(workspace: Workspace, now = new Date()): string {
  return JSON.stringify(
    { format: COLLEGE_FILE_FORMAT, version: 1, exportedAt: now.toISOString(), dataset: workspace.dataset, timetable: workspace.timetable },
    null,
    2,
  );
}

export function parseCollegeFile(raw: string): { value: Workspace | null; problem?: string } {
  if (raw.length > MAX_FILE_BYTES) return { value: null, problem: "This file is larger than 5 MB, so it is not a college file from this app." };
  const data = safeJson(raw);
  if (data === undefined) return { value: null, problem: "This file is not a college file: it is not valid JSON." };
  try {
    const f = record(data, "file");
    if (f.format !== COLLEGE_FILE_FORMAT) return { value: null, problem: "This file was not exported from College Timetable Optimizer." };
    if (f.version !== 1) return { value: null, problem: "This file is from a newer version of the app and cannot be opened here." };
    const dataset = parseDataset(f.dataset);
    let timetable: SavedTimetable | null = null;
    try {
      timetable = parseTimetable(f.timetable, dataset);
    } catch (e) {
      if (!(e instanceof ShapeError)) throw e;
      return { value: null, problem: "The timetable in this file contains a clash or damaged entries, so the file was not opened." };
    }
    return { value: { version: 1, dataset, timetable } };
  } catch (e) {
    if (!(e instanceof ShapeError)) throw e;
    return { value: null, problem: `This file is damaged or incomplete (problem near "${e.message}"), so nothing was changed.` };
  }
}
