// Browser-only persistence for the prototype. Everything lives in this browser's localStorage;
// nothing is sent to a server or shared between users. Parsers are pure so they can be tested.

import { parseSlotKey } from "./timetable/grid.ts";
import type { Dataset, ScheduledEntry, SlotKey } from "./timetable/types.ts";

export const STORAGE_KEYS = {
  availability: "cto.availability.v1",
  timetable: "cto.timetable.v1",
} as const;

export interface StoredAvailability {
  version: 1;
  teacherId: string;
  unavailable: SlotKey[];
  savedAt: string;
}

export type TimetableSource = "sample" | "generated" | "edited";

export interface StoredTimetable {
  version: 1;
  datasetId: string;
  source: TimetableSource;
  seed: number | null;
  updatedAt: string;
  entries: ScheduledEntry[];
}

export interface ParseResult<T> {
  value: T | null;
  /** Set when stored data existed but could not be used. */
  problem?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function parseStoredAvailability(
  raw: string | null,
  dataset: Dataset,
  teacherId: string,
): ParseResult<StoredAvailability> {
  if (raw === null) return { value: null };
  const data = safeJson(raw);
  const problem = "Your saved availability could not be read, so the sample availability is shown.";
  if (!isRecord(data) || data.version !== 1 || data.teacherId !== teacherId || !Array.isArray(data.unavailable)) {
    return { value: null, problem };
  }
  const unavailable: SlotKey[] = [];
  for (const key of data.unavailable) {
    const parsed = typeof key === "string" ? parseSlotKey(key) : null;
    const day = parsed && dataset.grid.days.find((d) => d.id === parsed.day);
    if (!parsed || !day || parsed.period < 1 || parsed.period > day.periodCount) {
      return { value: null, problem };
    }
    if (!unavailable.includes(key as SlotKey)) unavailable.push(key as SlotKey);
  }
  return {
    value: {
      version: 1,
      teacherId,
      unavailable,
      savedAt: typeof data.savedAt === "string" ? data.savedAt : new Date(0).toISOString(),
    },
  };
}

const ENTRY_STRING_FIELDS = ["id", "requirementId", "subjectId", "teacherId", "sectionId", "roomId", "day"] as const;

function isEntryFor(dataset: Dataset, value: unknown): value is ScheduledEntry {
  if (!isRecord(value)) return false;
  if (!ENTRY_STRING_FIELDS.every((f) => typeof value[f] === "string")) return false;
  if (!Number.isInteger(value.startPeriod) || !Number.isInteger(value.span)) return false;
  return (
    dataset.requirements.some((r) => r.id === value.requirementId) &&
    dataset.subjects.some((s) => s.id === value.subjectId) &&
    dataset.teachers.some((t) => t.id === value.teacherId) &&
    dataset.sections.some((s) => s.id === value.sectionId) &&
    dataset.rooms.some((r) => r.id === value.roomId) &&
    dataset.grid.days.some((d) => d.id === value.day)
  );
}

export function parseStoredTimetable(raw: string | null, dataset: Dataset): ParseResult<StoredTimetable> {
  if (raw === null) return { value: null };
  const data = safeJson(raw);
  const problem = "Your saved timetable was from an older version of the demo, so the sample timetable is shown.";
  if (
    !isRecord(data) ||
    data.version !== 1 ||
    data.datasetId !== dataset.id ||
    !Array.isArray(data.entries) ||
    !data.entries.every((e) => isEntryFor(dataset, e))
  ) {
    return { value: null, problem };
  }
  const source: TimetableSource =
    data.source === "generated" || data.source === "edited" ? data.source : "sample";
  return {
    value: {
      version: 1,
      datasetId: dataset.id,
      source,
      seed: typeof data.seed === "number" ? data.seed : null,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date(0).toISOString(),
      entries: data.entries as ScheduledEntry[],
    },
  };
}

// localStorage can throw (private mode, blocked storage, quota); never let that break the page.
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
