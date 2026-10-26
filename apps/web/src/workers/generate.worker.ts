// Runs the generator and the independent validator off the main thread, so the page stays
// responsive while a larger college is scheduled.

import { generateTimetable } from "../lib/timetable/scheduler.ts";
import type { Dataset } from "../lib/timetable/types.ts";
import { validateTimetable } from "../lib/timetable/validator.ts";

self.onmessage = (event: MessageEvent<{ dataset: Dataset; seed: number }>) => {
  try {
    const { dataset, seed } = event.data;
    const result = generateTimetable(dataset, dataset.availability, { seed });
    const report = validateTimetable(dataset, result.entries, dataset.availability);
    self.postMessage({ ok: true, result, report });
  } catch {
    self.postMessage({ ok: false });
  }
};
