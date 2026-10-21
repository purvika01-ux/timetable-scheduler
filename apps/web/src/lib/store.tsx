"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  parseStoredAvailability,
  parseStoredTimetable,
  readStorage,
  removeStorage,
  STORAGE_KEYS,
  type StoredAvailability,
  type StoredTimetable,
  type TimetableSource,
  writeStorage,
} from "./storage.ts";
import { buildAvailability } from "./timetable/availability.ts";
import { DEFAULT_DEMO_TEACHER_UNAVAILABLE, DEMO_TEACHER_ID, STANDARD_DATASET } from "./timetable/demo-data.ts";
import { generateTimetable } from "./timetable/scheduler.ts";
import type { AvailabilityMap, Dataset, ScheduledEntry, SlotKey, Teacher } from "./timetable/types.ts";

interface DemoStore {
  /** False until browser storage has been read (avoids hydration mismatches). */
  ready: boolean;
  dataset: Dataset;
  teacher: Teacher;
  myUnavailable: SlotKey[];
  availabilitySavedAt: string | null;
  /** Availability of every teacher in the standard dataset, including the demo teacher's. */
  availability: AvailabilityMap;
  saveMyUnavailable: (slots: SlotKey[]) => boolean;
  timetable: StoredTimetable;
  saveTimetable: (entries: ScheduledEntry[], source: TimetableSource, seed: number | null) => boolean;
  resetDemo: () => void;
  /** Problems found while loading stored data, shown once as a banner. */
  notices: string[];
  dismissNotices: () => void;
}

const DemoStoreContext = createContext<DemoStore | null>(null);

function sampleTimetable(): StoredTimetable {
  const availability = buildAvailability(STANDARD_DATASET.id, DEFAULT_DEMO_TEACHER_UNAVAILABLE);
  const result = generateTimetable(STANDARD_DATASET, availability, { seed: 1 });
  return {
    version: 1,
    datasetId: STANDARD_DATASET.id,
    source: "sample",
    seed: 1,
    updatedAt: new Date().toISOString(),
    entries: result.entries,
  };
}

export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  const dataset = STANDARD_DATASET;
  const teacher = dataset.teachers.find((t) => t.id === DEMO_TEACHER_ID)!;
  const [ready, setReady] = useState(false);
  const [savedAvailability, setSavedAvailability] = useState<StoredAvailability | null>(null);
  const [timetable, setTimetable] = useState<StoredTimetable>(sampleTimetable);
  const [notices, setNotices] = useState<string[]>([]);

  useEffect(() => {
    const found: string[] = [];
    const avail = parseStoredAvailability(readStorage(STORAGE_KEYS.availability), dataset, DEMO_TEACHER_ID);
    if (avail.problem) {
      found.push(avail.problem);
      removeStorage(STORAGE_KEYS.availability);
    }
    const tt = parseStoredTimetable(readStorage(STORAGE_KEYS.timetable), dataset);
    if (tt.problem) {
      found.push(tt.problem);
      removeStorage(STORAGE_KEYS.timetable);
    }
    // Reading browser storage must happen after mount; this one-time sync is intended.
    setSavedAvailability(avail.value);
    if (tt.value) setTimetable(tt.value);
    setNotices(found);
    setReady(true);
  }, [dataset]);

  const myUnavailable = savedAvailability?.unavailable ?? DEFAULT_DEMO_TEACHER_UNAVAILABLE;
  const availability = useMemo(() => buildAvailability(dataset.id, myUnavailable), [dataset.id, myUnavailable]);

  const saveMyUnavailable = useCallback((slots: SlotKey[]) => {
    const value: StoredAvailability = {
      version: 1,
      teacherId: DEMO_TEACHER_ID,
      unavailable: [...slots],
      savedAt: new Date().toISOString(),
    };
    if (!writeStorage(STORAGE_KEYS.availability, value)) return false;
    setSavedAvailability(value);
    return true;
  }, []);

  const saveTimetable = useCallback(
    (entries: ScheduledEntry[], source: TimetableSource, seed: number | null) => {
      const value: StoredTimetable = {
        version: 1,
        datasetId: dataset.id,
        source,
        seed,
        updatedAt: new Date().toISOString(),
        entries,
      };
      if (!writeStorage(STORAGE_KEYS.timetable, value)) return false;
      setTimetable(value);
      return true;
    },
    [dataset.id],
  );

  const resetDemo = useCallback(() => {
    removeStorage(STORAGE_KEYS.availability);
    removeStorage(STORAGE_KEYS.timetable);
    setSavedAvailability(null);
    setTimetable(sampleTimetable());
    setNotices([]);
  }, []);

  const value: DemoStore = {
    ready,
    dataset,
    teacher,
    myUnavailable,
    availabilitySavedAt: savedAvailability?.savedAt ?? null,
    availability,
    saveMyUnavailable,
    timetable,
    saveTimetable,
    resetDemo,
    notices,
    dismissNotices: () => setNotices([]),
  };

  return <DemoStoreContext.Provider value={value}>{children}</DemoStoreContext.Provider>;
}

export function useDemoStore(): DemoStore {
  const store = useContext(DemoStoreContext);
  if (!store) throw new Error("useDemoStore must be used inside DemoStoreProvider");
  return store;
}

/** Current time, refreshed every 30 seconds. Null until mounted so server and client markup match. */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
