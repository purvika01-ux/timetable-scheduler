// The workspace of a signed-in college, built only from what the API returned. It never borrows
// from the browser demo or from another college. Kept in memory, never in browser storage.

import { STANDARD_DATASET } from "./timetable/demo-data.ts";
import type { Dataset, ScheduledEntry } from "./timetable/types.ts";
import type { SavedTimetable, TimetableSource, Workspace } from "./workspace.ts";

export interface ServerTimetable {
  source: string;
  seed: number | null;
  entries: ScheduledEntry[];
  updatedAt: string;
}

/** A signed-in college before its data has loaded: its name, the standard week and nothing else. */
export function emptyCollegeWorkspace(collegeId: string, collegeName: string): Workspace {
  return {
    version: 1,
    timetable: null,
    dataset: {
      ...STANDARD_DATASET,
      id: collegeId,
      label: collegeName,
      description: "",
      college: { name: collegeName, shortName: collegeName, semesterLabel: "" },
      departments: [],
      teachers: [],
      subjects: [],
      sections: [],
      rooms: [],
      requirements: [],
      availability: {},
    },
  };
}

export function collegeWorkspaceFromApi(
  collegeId: string,
  collegeName: string,
  data: Partial<Dataset>,
  serverTimetable: ServerTimetable | null,
): Workspace {
  const empty = emptyCollegeWorkspace(collegeId, collegeName).dataset;
  const dataset: Dataset = {
    ...empty,
    college: {
      name: data.college?.name || empty.college.name,
      shortName: data.college?.shortName || empty.college.shortName,
      semesterLabel: data.college?.semesterLabel || empty.college.semesterLabel,
    },
    grid: data.grid ?? empty.grid,
    departments: data.departments ?? [],
    teachers: data.teachers ?? [],
    subjects: data.subjects ?? [],
    sections: data.sections ?? [],
    rooms: data.rooms ?? [],
    requirements: data.requirements ?? [],
    availability: data.availability ?? {},
  };
  const timetable: SavedTimetable | null = serverTimetable?.entries
    ? {
        source: (serverTimetable.source as TimetableSource) || "generated",
        seed: serverTimetable.seed,
        entries: serverTimetable.entries,
        updatedAt: serverTimetable.updatedAt,
      }
    : null;
  return { version: 1, dataset, timetable };
}
