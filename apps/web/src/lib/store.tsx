"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "./auth-context";
import { collegeWorkspaceFromApi, emptyCollegeWorkspace, type ServerTimetable } from "./college-workspace";
import { LEGACY_KEYS, readStorage, removeStorage, STORAGE_KEYS, writeStorage } from "./storage";
import { pruneAvailability, type SetupArea } from "./timetable/college";
import { STANDARD_DATASET } from "./timetable/demo-data";
import type { Dataset, Department, Room, ScheduledEntry, Section, SessionRequirement, SlotKey, Subject, Teacher } from "./timetable/types";
import { parseWorkspace, reconcileTimetable, sampleWorkspace, type SavedTimetable, type TimetableSource, type Workspace } from "./workspace";

/** Role-based access model: portal gateway, coordinator, principal, HOD, teacher, and student. */
export type Role =
  | { kind: "portal" }
  | { kind: "coordinator" }
  | { kind: "principal" }
  | { kind: "hod"; departmentId: string }
  | { kind: "teacher"; teacherId: string }
  | { kind: "student"; sectionId: string };

interface WorkspaceStore {
  /** False until browser storage has been read (avoids hydration mismatches). */
  ready: boolean;
  isSyncing: boolean;
  canManageAcademic: boolean;
  canManageAvailability: boolean;
  dataset: Dataset;
  timetable: SavedTimetable | null;
  role: Role;
  /** The teacher being viewed in the teacher role, if any. */
  viewTeacher: Teacher | null;
  /** The department being viewed in the HOD role, if any. */
  viewDepartment: Department | null;
  /** The section being viewed in the student role, if any. */
  viewSection: Section | null;
  setRole: (role: Role) => void;
  /** Saves edited college data and keeps the timetable in step; `removed` counts classes taken out. */
  updateDataset: (next: Dataset) => { ok: boolean; removed: number };
  saveEntity: (area: SetupArea, item: unknown, isNew: boolean) => Promise<{ ok: boolean; error?: string; removed?: number }>;
  deleteEntity: (area: SetupArea, id: string) => Promise<{ ok: boolean; error?: string; removed?: number }>;
  /** Signed in: the server saves first and its refusal is returned; nothing changes locally then. */
  setTeacherUnavailable: (teacherId: string, slots: SlotKey[]) => Promise<SaveResult>;
  saveTimetable: (entries: ScheduledEntry[], source: TimetableSource, seed: number | null) => Promise<SaveResult>;
  clearTimetable: () => Promise<SaveResult>;
  /** Replace everything (sample college, blank college, imported file). */
  replaceWorkspace: (workspace: Workspace) => boolean;
  /** Problems found while loading stored data, shown once as a banner. */
  notices: string[];
  dismissNotices: () => void;
}

/** `savedToServer` is true only when the API confirmed the save (signed in); the demo saves in this browser. */
export type SaveResult = { ok: true; savedToServer: boolean } | { ok: false; error: string };

const BROWSER_BLOCKED = "This browser blocked saving (storage may be full or disabled). Nothing was changed.";

function serverRefusal(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

const WorkspaceContext = createContext<WorkspaceStore | null>(null);

function parseRole(raw: string | null): Role {
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (v && typeof v === "object" && "kind" in v) {
      if (v.kind === "portal") return { kind: "portal" };
      if (v.kind === "coordinator") return { kind: "coordinator" };
      if (v.kind === "principal") return { kind: "principal" };
      if (v.kind === "hod" && "departmentId" in v && typeof v.departmentId === "string") return { kind: "hod", departmentId: v.departmentId };
      if (v.kind === "teacher" && "teacherId" in v && typeof v.teacherId === "string") return { kind: "teacher", teacherId: v.teacherId };
      if (v.kind === "student" && "sectionId" in v && typeof v.sectionId === "string") return { kind: "student", sectionId: v.sectionId };
    }
  } catch {
    // Fall through to the default.
  }
  return { kind: "portal" };
}

function areaToEndpoint(area: SetupArea): string | null {
  switch (area) {
    case "departments": return "departments";
    case "teachers": return "teachers";
    case "subjects": return "subjects";
    case "sections": return "sections";
    case "rooms": return "rooms";
    case "courses": return "requirements";
    default: return null;
  }
}

function toApiPayload(area: SetupArea, item: Record<string, unknown>): Record<string, unknown> {
  switch (area) {
    case "departments":
      return {
        code: String(item.code || "").trim().toUpperCase(),
        name: String(item.name || "").trim(),
      };
    case "teachers":
      return {
        name: String(item.name || "").trim(),
        designation: String(item.designation || "").trim(),
        departmentId: String(item.departmentId || "").trim(),
        employeeId: String(item.employeeId || "").trim().toUpperCase(),
        email: item.email ? String(item.email).trim() : undefined,
        maxPeriodsPerDay: item.maxPeriodsPerDay ? Number(item.maxPeriodsPerDay) : 4,
      };
    case "subjects":
      return {
        code: String(item.code || "").trim().toUpperCase(),
        name: String(item.name || "").trim(),
        kind: item.kind === "lab" ? "lab" : "theory",
        color: String(item.color || "blue").trim(),
        departmentId: item.departmentId ? String(item.departmentId).trim() : undefined,
      };
    case "sections":
      return {
        name: String(item.name || "").trim(),
        programme: String(item.programme || "").trim(),
        semester: Number(item.semester || 1),
        strength: Number(item.strength || 30),
        departmentId: String(item.departmentId || "").trim(),
      };
    case "rooms":
      return {
        name: String(item.name || "").trim(),
        type: item.type === "lab" ? "lab" : item.type === "workshop" ? "workshop" : "lecture",
        capacity: Number(item.capacity || 40),
        building: String(item.building || "").trim(),
        departmentId: item.departmentId ? String(item.departmentId).trim() : undefined,
      };
    case "courses":
      return {
        subjectId: String(item.subjectId || "").trim(),
        teacherId: String(item.teacherId || "").trim(),
        sectionId: String(item.sectionId || "").trim(),
        sessionsPerWeek: Number(item.sessionsPerWeek || 1),
        span: Number(item.span || 1),
        roomType: item.roomType === "lab" ? "lab" : item.roomType === "workshop" ? "workshop" : "lecture",
      };
    default:
      return item;
  }
}

function datasetWithItem<T extends { id: string }>(dataset: Dataset, area: SetupArea, item: T, isNew: boolean): Dataset {
  switch (area) {
    case "departments": {
      const items = isNew ? [...dataset.departments, item as unknown as Department] : dataset.departments.map((x) => (x.id === item.id ? (item as unknown as Department) : x));
      return { ...dataset, departments: items };
    }
    case "teachers": {
      const items = isNew ? [...dataset.teachers, item as unknown as Teacher] : dataset.teachers.map((x) => (x.id === item.id ? (item as unknown as Teacher) : x));
      return { ...dataset, teachers: items };
    }
    case "subjects": {
      const items = isNew ? [...dataset.subjects, item as unknown as Subject] : dataset.subjects.map((x) => (x.id === item.id ? (item as unknown as Subject) : x));
      return { ...dataset, subjects: items };
    }
    case "sections": {
      const items = isNew ? [...dataset.sections, item as unknown as Section] : dataset.sections.map((x) => (x.id === item.id ? (item as unknown as Section) : x));
      return { ...dataset, sections: items };
    }
    case "rooms": {
      const items = isNew ? [...dataset.rooms, item as unknown as Room] : dataset.rooms.map((x) => (x.id === item.id ? (item as unknown as Room) : x));
      return { ...dataset, rooms: items };
    }
    case "courses": {
      const items = isNew ? [...dataset.requirements, item as unknown as SessionRequirement] : dataset.requirements.map((x) => (x.id === item.id ? (item as unknown as SessionRequirement) : x));
      return { ...dataset, requirements: items };
    }
    default:
      return dataset;
  }
}

function datasetWithoutItem(dataset: Dataset, area: SetupArea, id: string): Dataset {
  switch (area) {
    case "departments":
      return { ...dataset, departments: dataset.departments.filter((x) => x.id !== id) };
    case "teachers":
      return { ...dataset, teachers: dataset.teachers.filter((x) => x.id !== id) };
    case "subjects":
      return { ...dataset, subjects: dataset.subjects.filter((x) => x.id !== id) };
    case "sections":
      return { ...dataset, sections: dataset.sections.filter((x) => x.id !== id) };
    case "rooms":
      return { ...dataset, rooms: dataset.rooms.filter((x) => x.id !== id) };
    case "courses":
      return { ...dataset, requirements: dataset.requirements.filter((x) => x.id !== id) };
    default:
      return dataset;
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { activeCollege, api } = useAuth();
  const [ready, setReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  // The browser demo lives in localStorage. A signed-in college's data stays in memory only (no
  // personal data in browser storage, CLAUDE.md rule 8) and is never mixed with the demo.
  const [demoWorkspace, setDemoWorkspace] = useState<Workspace>(() => sampleWorkspace(STANDARD_DATASET));
  const [college, setCollege] = useState<{ collegeId: string; workspace: Workspace } | null>(null);
  const [role, setRoleState] = useState<Role>({ kind: "portal" });
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
    if (parsed.value) setDemoWorkspace(parsed.value);
    setRoleState(parseRole(readStorage(STORAGE_KEYS.role)));
    setNotices(found);
    setReady(true);
  }, []);

  // Load the signed-in college from the API. Until it arrives the college shows as empty, never
  // as the demo or as the previously selected college.
  useEffect(() => {
    if (!activeCollege) {
      setCollege(null);
      return;
    }
    const collegeId = activeCollege.collegeId;
    let cancelled = false;
    setIsSyncing(true);
    setCollege({ collegeId, workspace: emptyCollegeWorkspace(collegeId, activeCollege.collegeName) });

    api.request<Dataset>(`/colleges/${collegeId}/academic`)
      .then(async (res) => {
        if (cancelled) return;
        // If college has 0 departments, seed initial demo dataset
        if (res.departments.length === 0) {
          try {
            const seeded = await api.request<Dataset>(`/colleges/${collegeId}/academic/seed`, { method: "POST" });
            if (cancelled) return;
            res = seeded;
          } catch {
            // Keep empty if seed fails or permissions restrict
          }
        }

        const serverTimetable = await api.request<ServerTimetable | null>(
          `/colleges/${collegeId}/academic/timetable`,
        );
        if (cancelled) return;

        setCollege({ collegeId, workspace: collegeWorkspaceFromApi(collegeId, activeCollege.collegeName, res, serverTimetable) });
      })
      .catch((err) => {
        if (cancelled) return;
        const reason = err instanceof Error ? err.message : "the server did not answer";
        setNotices((n) => [...n, `${activeCollege.collegeName} could not be loaded from the server (${reason}). Nothing shown here is that college's data; reload to try again.`]);
      })
      .finally(() => {
        if (!cancelled) setIsSyncing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCollege, api]);

  const workspace = activeCollege && college?.collegeId === activeCollege.collegeId ? college.workspace : demoWorkspace;

  const persist = useCallback(
    (next: Workspace) => {
      if (activeCollege) {
        const collegeId = activeCollege.collegeId;
        setCollege((current) => (current?.collegeId === collegeId ? { collegeId, workspace: next } : current));
        return true;
      }
      if (!writeStorage(STORAGE_KEYS.workspace, next)) return false;
      setDemoWorkspace(next);
      return true;
    },
    [activeCollege],
  );

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

  const saveEntity = useCallback(
    async (area: SetupArea, item: unknown, isNew: boolean): Promise<{ ok: boolean; error?: string; removed?: number }> => {
      let savedItem = item as { id: string };
      const endpoint = areaToEndpoint(area);
      if (activeCollege && endpoint) {
        try {
          const payload = toApiPayload(area, item as Record<string, unknown>);
          if (isNew) {
            const res = await api.request<{ id: string }>(`/colleges/${activeCollege.collegeId}/academic/${endpoint}`, {
              method: "POST",
              body: payload,
            });
            savedItem = { ...savedItem, id: res.id };
          } else {
            await api.request(`/colleges/${activeCollege.collegeId}/academic/${endpoint}/${savedItem.id}`, {
              method: "PATCH",
              body: payload,
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to save record to server.";
          return { ok: false, error: msg };
        }
      }
      const nextDataset = datasetWithItem(workspace.dataset, area, savedItem, isNew);
      const updateRes = updateDataset(nextDataset);
      return { ok: updateRes.ok, removed: updateRes.removed };
    },
    [activeCollege, api, updateDataset, workspace.dataset],
  );

  const deleteEntity = useCallback(
    async (area: SetupArea, id: string): Promise<{ ok: boolean; error?: string; removed?: number }> => {
      const endpoint = areaToEndpoint(area);
      if (activeCollege && endpoint) {
        try {
          await api.request(`/colleges/${activeCollege.collegeId}/academic/${endpoint}/${id}`, {
            method: "DELETE",
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to delete record from server.";
          return { ok: false, error: msg };
        }
      }
      const nextDataset = datasetWithoutItem(workspace.dataset, area, id);
      const updateRes = updateDataset(nextDataset);
      return { ok: updateRes.ok, removed: updateRes.removed };
    },
    [activeCollege, api, updateDataset, workspace.dataset],
  );

  const setTeacherUnavailable = useCallback(
    async (teacherId: string, slots: SlotKey[]): Promise<SaveResult> => {
      if (activeCollege) {
        try {
          await api.request(`/colleges/${activeCollege.collegeId}/academic/availability/${teacherId}`, {
            method: "POST",
            body: { slots },
          });
        } catch (err) {
          return { ok: false, error: serverRefusal(err, "The server did not save this availability. Nothing was changed.") };
        }
      }
      const availability = { ...workspace.dataset.availability };
      if (slots.length > 0) availability[teacherId] = [...slots];
      else delete availability[teacherId];
      if (!persist({ ...workspace, dataset: { ...workspace.dataset, availability } })) return { ok: false, error: BROWSER_BLOCKED };
      return { ok: true, savedToServer: !!activeCollege };
    },
    [activeCollege, api, persist, workspace],
  );

  const saveTimetable = useCallback(
    async (entries: ScheduledEntry[], source: TimetableSource, seed: number | null): Promise<SaveResult> => {
      let updatedAt = new Date().toISOString();
      if (activeCollege) {
        // The server revalidates the whole timetable and refuses any clash (422); only then is it shown here.
        try {
          const saved = await api.request<{ updatedAt: string }>(`/colleges/${activeCollege.collegeId}/academic/timetable`, {
            method: "POST",
            body: { entries, source, seed },
          });
          updatedAt = saved.updatedAt ?? updatedAt;
        } catch (err) {
          return { ok: false, error: serverRefusal(err, "The server did not save this timetable. The current timetable was not changed.") };
        }
      }
      if (!persist({ ...workspace, timetable: { source, seed, updatedAt, entries } })) return { ok: false, error: BROWSER_BLOCKED };
      return { ok: true, savedToServer: !!activeCollege };
    },
    [activeCollege, api, persist, workspace],
  );

  const clearTimetable = useCallback(async (): Promise<SaveResult> => {
    if (activeCollege) {
      try {
        await api.request(`/colleges/${activeCollege.collegeId}/academic/timetable`, { method: "DELETE" });
      } catch (err) {
        return { ok: false, error: serverRefusal(err, "The server did not clear the timetable. Nothing was changed.") };
      }
    }
    if (!persist({ ...workspace, timetable: null })) return { ok: false, error: BROWSER_BLOCKED };
    return { ok: true, savedToServer: !!activeCollege };
  }, [activeCollege, api, persist, workspace]);

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

  // Mirrors the API's role capabilities (apps/api/src/auth/permissions.ts); the server still decides.
  const canManageAcademic = useMemo(() => {
    if (!activeCollege) return true;
    return activeCollege.roles.some((r) => ["TC", "CA"].includes(r));
  }, [activeCollege]);

  const canManageAvailability = canManageAcademic;

  const { dataset, timetable } = workspace;
  const effectiveRole: Role = useMemo(() => {
    if (role.kind === "portal" || role.kind === "coordinator" || role.kind === "principal") return role;
    if (role.kind === "hod") {
      if (dataset.departments.some((d) => d.id === role.departmentId)) return role;
      return dataset.departments[0] ? { kind: "hod", departmentId: dataset.departments[0].id } : { kind: "coordinator" };
    }
    if (role.kind === "teacher") {
      if (dataset.teachers.some((t) => t.id === role.teacherId)) return role;
      return dataset.teachers[0] ? { kind: "teacher", teacherId: dataset.teachers[0].id } : { kind: "coordinator" };
    }
    if (role.kind === "student") {
      if (dataset.sections.some((s) => s.id === role.sectionId)) return role;
      return dataset.sections[0] ? { kind: "student", sectionId: dataset.sections[0].id } : { kind: "coordinator" };
    }
    return { kind: "portal" };
  }, [role, dataset.departments, dataset.teachers, dataset.sections]);

  const viewTeacher = effectiveRole.kind === "teacher" ? (dataset.teachers.find((t) => t.id === effectiveRole.teacherId) ?? null) : null;
  const viewDepartment = effectiveRole.kind === "hod" ? (dataset.departments.find((d) => d.id === effectiveRole.departmentId) ?? null) : null;
  const viewSection = effectiveRole.kind === "student" ? (dataset.sections.find((s) => s.id === effectiveRole.sectionId) ?? null) : null;

  const value: WorkspaceStore = {
    ready,
    isSyncing,
    canManageAcademic,
    canManageAvailability,
    dataset,
    timetable,
    role: effectiveRole,
    viewTeacher,
    viewDepartment,
    viewSection,
    setRole,
    updateDataset,
    saveEntity,
    deleteEntity,
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
