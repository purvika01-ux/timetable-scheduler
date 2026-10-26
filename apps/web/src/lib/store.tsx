"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { LEGACY_KEYS, readStorage, removeStorage, STORAGE_KEYS, writeStorage } from "./storage.ts";
import { pruneAvailability } from "./timetable/college.ts";
import { STANDARD_DATASET } from "./timetable/demo-data.ts";
import type { Dataset, ScheduledEntry, SlotKey, Teacher } from "./timetable/types.ts";
import { parseWorkspace, reconcileTimetable, sampleWorkspace, type SavedTimetable, type TimetableSource, type Workspace } from "./workspace.ts";

/** Demo role switcher: there is no sign-in in the prototype (M4). */
export type Role = { kind: "coordinator" } | { kind: "teacher"; teacherId: string };

interface WorkspaceStore {
  /** False until browser storage has been read (avoids hydration mismatches). */
  ready: boolean;
  dataset: Dataset;
  timetable: SavedTimetable | null;
  role: Role;
  /** The teacher being viewed in the teacher role, if any. */
  viewTeacher: Teacher | null;
  setRole: (role: Role) => void;
  /** Saves edited college data and keeps the timetable in step; `removed` counts classes taken out. */
  updateDataset: (next: Dataset) => { ok: boolean; removed: number };
  setTeacherUnavailable: (teacherId: string, slots: SlotKey[]) => boolean;
  saveTimetable: (entries: ScheduledEntry[], source: TimetableSource, seed: number | null) => boolean;
  clearTimetable: () => boolean;
  /** Replace everything (sample college, blank college, imported file). */
  replaceWorkspace: (workspace: Workspace) => boolean;
  /** Problems found while loading stored data, shown once as a banner. */
  notices: string[];
  dismissNotices: () => void;
}

const WorkspaceContext = createContext<WorkspaceStore | null>(null);

function parseRole(raw: string | null): Role {
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (v && typeof v === "object" && "kind" in v) {
      if (v.kind === "teacher" && "teacherId" in v && typeof v.teacherId === "string") return { kind: "teacher", teacherId: v.teacherId };
    }
  } catch {
    // Fall through to the default.
  }
  return { kind: "coordinator" };
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>(() => sampleWorkspace(STANDARD_DATASET));
  const [role, setRoleState] = useState<Role>({ kind: "coordinator" });
  const [notices, setNotices] = useState<string[]>([]);

  useEffect(() => {
    const found: string[] = [];
    const parsed = parseWorkspace(readStorage(STORAGE_KEYS.workspace));
    if (parsed.problem) {
      found.push(parsed.problem);
      removeStorage(STORAGE_KEYS.workspace);
    }
    if (parsed.timetableProblem) found.push(parsed.timetableProblem);
    if (LEGACY_KEYS.some((k) => readStorage(k) !== null)) {
      LEGACY_KEYS.forEach(removeStorage);
      if (!parsed.value) found.push("This browser had data from an earlier version of the demo. The sample college was loaded instead.");
    }
    // Reading browser storage must happen after mount; this one-time sync is intended.
    if (parsed.value) setWorkspace(parsed.value);
    setRoleState(parseRole(readStorage(STORAGE_KEYS.role)));
    setNotices(found);
    setReady(true);
  }, []);

  const persist = useCallback((next: Workspace) => {
    if (!writeStorage(STORAGE_KEYS.workspace, next)) return false;
    setWorkspace(next);
    return true;
  }, []);

  const updateDataset = useCallback(
    (next: Dataset) => {
      const dataset = { ...next, availability: pruneAvailability(next) };
      let removed = 0;
      let timetable = workspace.timetable;
      if (timetable) {
        const result = reconcileTimetable(dataset, timetable.entries);
        removed = result.removed;
        if (removed > 0) timetable = { ...timetable, entries: result.entries, source: "edited", updatedAt: new Date().toISOString() };
      }
      return { ok: persist({ version: 1, dataset, timetable }), removed };
    },
    [persist, workspace.timetable],
  );

  const setTeacherUnavailable = useCallback(
    (teacherId: string, slots: SlotKey[]) => {
      const availability = { ...workspace.dataset.availability };
      if (slots.length > 0) availability[teacherId] = [...slots];
      else delete availability[teacherId];
      return persist({ ...workspace, dataset: { ...workspace.dataset, availability } });
    },
    [persist, workspace],
  );

  const saveTimetable = useCallback(
    (entries: ScheduledEntry[], source: TimetableSource, seed: number | null) =>
      persist({ ...workspace, timetable: { source, seed, updatedAt: new Date().toISOString(), entries } }),
    [persist, workspace],
  );

  const clearTimetable = useCallback(() => persist({ ...workspace, timetable: null }), [persist, workspace]);

  const replaceWorkspace = useCallback(
    (next: Workspace) => {
      const ok = persist(next);
      if (ok) setNotices([]);
      return ok;
    },
    [persist],
  );

  const setRole = useCallback((next: Role) => {
    writeStorage(STORAGE_KEYS.role, next);
    setRoleState(next);
  }, []);

  const { dataset, timetable } = workspace;
  // A teacher role pointing at a teacher who no longer exists falls back to the first teacher, or to the coordinator.
  const effectiveRole: Role = useMemo(() => {
    if (role.kind === "coordinator") return role;
    if (dataset.teachers.some((t) => t.id === role.teacherId)) return role;
    return dataset.teachers[0] ? { kind: "teacher", teacherId: dataset.teachers[0].id } : { kind: "coordinator" };
  }, [role, dataset.teachers]);
  const viewTeacher = effectiveRole.kind === "teacher" ? (dataset.teachers.find((t) => t.id === effectiveRole.teacherId) ?? null) : null;

  const value: WorkspaceStore = {
    ready,
    dataset,
    timetable,
    role: effectiveRole,
    viewTeacher,
    setRole,
    updateDataset,
    setTeacherUnavailable,
    saveTimetable,
    clearTimetable,
    replaceWorkspace,
    notices,
    dismissNotices: () => setNotices([]),
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceStore {
  const store = useContext(WorkspaceContext);
  if (!store) throw new Error("useWorkspace must be used inside WorkspaceProvider");
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
