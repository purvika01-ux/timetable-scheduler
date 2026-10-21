import {
  DEMO_TEACHER_ID,
  OTHER_TEACHER_AVAILABILITY,
  OVER_CONSTRAINED_EXTRA_AVAILABILITY,
} from "./demo-data.ts";
import { slotKey } from "./grid.ts";
import type { AvailabilityMap, DayId, SlotKey } from "./types.ts";

/** Full availability map for a dataset: seeded teachers plus the demo teacher's saved choice. */
export function buildAvailability(datasetId: string, demoTeacherUnavailable: SlotKey[]): AvailabilityMap {
  return {
    ...OTHER_TEACHER_AVAILABILITY,
    ...(datasetId === "over-constrained" ? OVER_CONSTRAINED_EXTRA_AVAILABILITY : {}),
    [DEMO_TEACHER_ID]: demoTeacherUnavailable,
  };
}

export function isAvailable(
  availability: AvailabilityMap,
  teacherId: string,
  day: DayId,
  period: number,
): boolean {
  return !(availability[teacherId] ?? []).includes(slotKey(day, period));
}
