// Browser helper: generate in a Web Worker, or on the main thread if workers are unavailable.

import { generateTimetable } from "./timetable/scheduler.ts";
import type { Dataset, GenerationResult, ValidationReport } from "./timetable/types.ts";
import { validateTimetable } from "./timetable/validator.ts";

export interface GenerationRun {
  result: GenerationResult;
  report: ValidationReport;
  durationMs: number;
  inWorker: boolean;
}

function onMainThread(dataset: Dataset, seed: number, started: number): Promise<GenerationRun> {
  return new Promise((resolve, reject) => {
    // Let the "Generating" state paint first.
    window.setTimeout(() => {
      try {
        const result = generateTimetable(dataset, dataset.availability, { seed });
        const report = validateTimetable(dataset, result.entries, dataset.availability);
        resolve({ result, report, durationMs: performance.now() - started, inWorker: false });
      } catch (e) {
        reject(e);
      }
    }, 60);
  });
}

export function runGeneration(dataset: Dataset, seed: number): Promise<GenerationRun> {
  const started = performance.now();
  let worker: Worker;
  try {
    worker = new Worker(new URL("../workers/generate.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return onMainThread(dataset, seed, started);
  }
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ ok: boolean; result?: GenerationResult; report?: ValidationReport }>) => {
      worker.terminate();
      if (event.data.ok && event.data.result && event.data.report) {
        resolve({ result: event.data.result, report: event.data.report, durationMs: performance.now() - started, inWorker: true });
      } else {
        reject(new Error("generation failed"));
      }
    };
    worker.onerror = () => {
      worker.terminate();
      // A worker that cannot start (for example blocked by the browser) falls back to the main thread.
      onMainThread(dataset, seed, started).then(resolve, reject);
    };
    worker.postMessage({ dataset, seed });
  });
}
