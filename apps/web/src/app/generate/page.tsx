"use client";

import { useMemo, useState } from "react";

import { ClassDialog } from "@/components/class-dialog";
import { Icon } from "@/components/icons";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Banner, Button, ButtonLink, cx, PageHeader, PageSkeleton, Panel, Segmented, StatTile, Stamp } from "@/components/ui";
import { SubjectLegend, WeekGrid } from "@/components/week-grid";
import type { Perspective } from "@/components/class-card";
import { useDemoStore } from "@/lib/store";
import { buildAvailability } from "@/lib/timetable/availability";
import { DATASETS, DEMO_TEACHER_ID } from "@/lib/timetable/demo-data";
import { totalTeachingPeriods } from "@/lib/timetable/grid";
import { makeLookup } from "@/lib/timetable/lookup";
import { generateTimetable } from "@/lib/timetable/scheduler";
import type { GenerationResult, ScheduledEntry, ValidationReport } from "@/lib/timetable/types";
import { validateTimetable } from "@/lib/timetable/validator";

interface Run {
  datasetId: string;
  result: GenerationResult;
  report: ValidationReport;
  durationMs: number;
}

export default function GeneratePage() {
  const { ready, myUnavailable, saveTimetable } = useDemoStore();
  const toast = useToast();
  const [datasetId, setDatasetId] = useState(DATASETS[0].id);
  const [seed, setSeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [perspective, setPerspective] = useState<Perspective>("teacher");
  const [focusId, setFocusId] = useState<string>(DEMO_TEACHER_ID);
  const [selected, setSelected] = useState<ScheduledEntry | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [applied, setApplied] = useState(false);

  const dataset = DATASETS.find((d) => d.id === datasetId)!;
  const runDataset = DATASETS.find((d) => d.id === run?.datasetId) ?? dataset;
  const lookup = useMemo(() => makeLookup(runDataset), [runDataset]);
  const availability = useMemo(() => buildAvailability(datasetId, myUnavailable), [datasetId, myUnavailable]);
  const runAvailability = useMemo(
    () => buildAvailability(runDataset.id, myUnavailable),
    [runDataset.id, myUnavailable],
  );

  if (!ready) return <PageSkeleton />;

  const sessionsPerWeek = dataset.requirements.reduce((n, r) => n + r.sessionsPerWeek, 0);

  const generate = (nextSeed: number) => {
    setRunning(true);
    setFailure(null);
    setApplied(false);
    setSeed(nextSeed);
    // Let the "Generating" state paint before the (fast, synchronous) solve runs.
    window.setTimeout(() => {
      try {
        const started = performance.now();
        const result = generateTimetable(dataset, availability, { seed: nextSeed });
        const report = validateTimetable(dataset, result.entries, availability);
        setRun({ datasetId: dataset.id, result, report, durationMs: performance.now() - started });
        if (!dataset.teachers.some((t) => t.id === focusId)) setFocusId(DEMO_TEACHER_ID);
      } catch {
        setFailure("The generator stopped unexpectedly. Nothing was saved. Try again or reset the demo data from Profile.");
      } finally {
        setRunning(false);
      }
    }, 60);
  };

  const applyToMyTimetable = () => {
    setConfirmApply(false);
    if (!run) return;
    if (saveTimetable(run.result.entries, "generated", run.result.seed)) {
      setApplied(true);
      toast("Generated timetable saved as your timetable in this browser.");
    } else {
      setFailure("This browser blocked saving. Your current timetable was not changed.");
    }
  };

  const focusOptions =
    perspective === "teacher" ? runDataset.teachers : perspective === "section" ? runDataset.sections : runDataset.rooms;
  const effectiveFocus = focusOptions.some((o) => o.id === focusId) ? focusId : focusOptions[0]?.id;
  const shown =
    run?.result.entries.filter((e) =>
      perspective === "teacher" ? e.teacherId === effectiveFocus : perspective === "section" ? e.sectionId === effectiveFocus : e.roomId === effectiveFocus,
    ) ?? [];
  const flagged = new Set(run?.report.issues.flatMap((i) => i.entryIds) ?? []);
  const clashTotal = run ? run.report.counts.teacher + run.report.counts.room + run.report.counts.section : 0;
  const otherViolations = run ? run.report.issues.length - clashTotal : 0;
  const placed = run?.result.entries.length ?? 0;
  const unplaced = run?.result.unplaced ?? [];
  const canApply = !!run && run.report.valid && run.datasetId === "standard";
  const sameData = run?.datasetId === datasetId;

  return (
    <div>
      <PageHeader
        title="Generate Timetable"
        description="Demo of the scheduling engine: builds a whole-college timetable from sample data, then checks it with an independent clash validator."
        actions={
          <ButtonLink href="/timetable" icon="calendar">
            Back to my timetable
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="1. Choose sample data" className="lg:col-span-2">
          <fieldset>
            <legend className="sr-only">Sample data set</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {DATASETS.map((d) => (
                <label
                  key={d.id}
                  className={cx(
                    "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary",
                    datasetId === d.id ? "border-primary bg-blue-50/60" : "border-line hover:bg-surface",
                  )}
                >
                  <input
                    type="radio"
                    name="dataset"
                    value={d.id}
                    checked={datasetId === d.id}
                    onChange={() => {
                      setDatasetId(d.id);
                      setSeed(1);
                    }}
                    className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{d.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{d.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            {[
              ["Teachers", dataset.teachers.length],
              ["Sections", dataset.sections.length],
              ["Rooms", dataset.rooms.length],
              ["Sessions / week", sessionsPerWeek],
              ["Periods / week", totalTeachingPeriods(dataset.grid)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md bg-surface px-3 py-2">
                <dt className="text-xs text-ink-muted">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 flex items-start gap-2 text-xs text-ink-muted">
            <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Uses your saved availability ({myUnavailable.length} unavailable {myUnavailable.length === 1 ? "period" : "periods"}) plus seeded availability for the other sample teachers.
          </p>
        </Panel>

        <Panel title="2. Generate">
          <p className="text-sm text-ink-muted">
            Hard rules: no teacher, room or section double-booking; teacher availability; room type and capacity; labs as
            one 2-period block that never crosses lunch; daily teaching limit.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Button variant="primary" icon="generate" onClick={() => generate(sameData ? seed : 1)} disabled={running} className="w-full">
              {running ? "Generating…" : sameData ? "Generate again (same seed)" : "Generate timetable"}
            </Button>
            {sameData && (
              <Button icon="refresh" onClick={() => generate(seed + 1)} disabled={running} className="w-full">
                Regenerate (try seed {seed + 1})
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Deterministic: the same seed and inputs always give the same timetable. A new seed explores a different valid arrangement.
          </p>
          <details className="mt-3 text-xs text-ink-muted">
            <summary className="cursor-pointer font-medium text-ink">How the generator works</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>Expands each course requirement into weekly sessions.</li>
              <li>Places the hardest sessions first (labs, teachers with few free periods, few suitable rooms).</li>
              <li>Picks the slot with the lowest penalty: spreads a subject across the week, balances daily load, prefers afternoon labs.</li>
              <li>Retries with failed sessions first; keeps the best attempt.</li>
              <li>Runs a separate validator over the result. Only a result with zero violations is shown as valid.</li>
            </ol>
          </details>
        </Panel>
      </div>

      <div className="mt-6" aria-live="polite" aria-busy={running}>
        {failure && (
          <Banner tone="error" title="Generation failed" onDismiss={() => setFailure(null)}>
            {failure}
          </Banner>
        )}

        {running && (
          <div className="flex items-center gap-3 rounded-lg border border-line bg-white px-4 py-4 text-sm text-ink">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
            Generating and validating timetable for {sessionsPerWeek} sessions…
          </div>
        )}

        {!running && !run && !failure && (
          <div className="rounded-lg border border-dashed border-line bg-white px-6 py-10 text-center">
            <Icon name="generate" className="mx-auto h-8 w-8 text-ink-muted" />
            <p className="mt-3 font-semibold text-ink">No timetable generated yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
              Choose a sample data set and press Generate timetable. Results appear here with clash counts and any
              sessions that could not be placed.
            </p>
          </div>
        )}

        {!running && run && (
          <div className="space-y-4">
            {!run.report.valid ? (
              <Banner tone="error" title={`Validation failed: ${run.report.issues.length} problems found`}>
                This result is not clash-free and cannot be used. Problem classes are outlined in red below.
                <ul className="mt-2 list-disc pl-4">
                  {run.report.issues.slice(0, 5).map((i, n) => (
                    <li key={n}>{i.message}</li>
                  ))}
                </ul>
              </Banner>
            ) : unplaced.length === 0 ? (
              <Banner tone="success" title={`Clash-free timetable: all ${placed} sessions placed`}>
                The independent validator re-checked every class: 0 teacher, 0 room and 0 section clashes, and every
                availability, room and break rule holds. Seed {run.result.seed}, {Math.max(1, Math.round(run.durationMs))} ms.
              </Banner>
            ) : (
              <Banner tone="warning" title={`Clash-free, but ${unplaced.length} ${unplaced.length === 1 ? "session" : "sessions"} could not be placed`}>
                Everything that was placed passed validation with zero clashes. The sessions listed below need a data
                change (another room, more availability) or a manual decision. Seed {run.result.seed}.
              </Banner>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="Scheduled" value={placed} hint={`of ${run.result.totalSessions} sessions`} tone="success" />
              <StatTile label="Unplaced" value={unplaced.length} hint="reported below" tone={unplaced.length ? "danger" : undefined} />
              <StatTile label="Teacher clashes" value={run.report.counts.teacher} tone={run.report.counts.teacher ? "danger" : "success"} />
              <StatTile label="Room clashes" value={run.report.counts.room} tone={run.report.counts.room ? "danger" : "success"} />
              <StatTile label="Section clashes" value={run.report.counts.section} tone={run.report.counts.section ? "danger" : "success"} />
              <StatTile label="Other rule breaks" value={otherViolations} hint="availability, rooms, grid" tone={otherViolations ? "danger" : "success"} />
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white px-4 py-3">
              <span className="mr-auto flex items-center gap-2 text-sm">
                <Stamp tone={run.report.valid ? "success" : "danger"}>{run.report.valid ? "Validated" : "Invalid"}</Stamp>
                <span className="text-ink-muted">
                  {applied ? "Saved as your timetable." : canApply ? "Use this result as Dr. Amandeep Singh's timetable?" : run.datasetId !== "standard" ? "Stress-test results are for review only and cannot be applied." : "Only a validated result can be applied."}
                </span>
              </span>
              {applied ? (
                <ButtonLink href="/timetable" variant="primary" icon="calendar">
                  Open my timetable
                </ButtonLink>
              ) : (
                <Button variant="primary" icon="checkCircle" disabled={!canApply} onClick={() => setConfirmApply(true)}>
                  Use as my timetable
                </Button>
              )}
            </div>

            {unplaced.length > 0 && (
              <Panel title={`Unplaced sessions (${unplaced.length})`}>
                <ul className="divide-y divide-line-soft">
                  {unplaced.map((u) => (
                    <li key={`${u.requirementId}-${u.occurrence}`} className="py-3 first:pt-0 last:pb-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                        <Icon name="alert" className="h-4 w-4 text-danger" />
                        {lookup.subject(u.subjectId)?.code} {lookup.subject(u.subjectId)?.name}
                        <span className="font-normal text-ink-muted">
                          · {lookup.section(u.sectionId)?.name} · {lookup.teacher(u.teacherId)?.name} · session {u.occurrence}
                          {u.span > 1 ? ` · ${u.span}-period lab` : ""}
                        </span>
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-10 text-sm text-ink-muted">
                        {u.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            <section aria-labelledby="result-grid" className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 id="result-grid" className="text-base font-semibold text-ink">
                  Generated timetable
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Segmented<Perspective>
                    label="View timetable by"
                    value={perspective}
                    onChange={(p) => {
                      setPerspective(p);
                      setFocusId(
                        p === "teacher" ? DEMO_TEACHER_ID : p === "section" ? runDataset.sections[0].id : runDataset.rooms[0].id,
                      );
                    }}
                    options={[
                      { value: "teacher", label: "Teacher" },
                      { value: "section", label: "Section" },
                      { value: "room", label: "Room" },
                    ]}
                  />
                  <label className="sr-only" htmlFor="focus-select">
                    Choose {perspective}
                  </label>
                  <select
                    id="focus-select"
                    value={effectiveFocus}
                    onChange={(e) => setFocusId(e.target.value)}
                    className="h-10 rounded-md border border-line bg-white px-2 text-sm"
                  >
                    {focusOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-sm text-ink-muted">
                {shown.length} {shown.length === 1 ? "class" : "classes"} ·{" "}
                {shown.reduce((n, e) => n + e.span, 0)} periods for {focusOptions.find((o) => o.id === effectiveFocus)?.name}
              </p>
              <WeekGrid
                grid={runDataset.grid}
                entries={shown}
                lookup={lookup}
                perspective={perspective}
                onSelect={setSelected}
                flaggedIds={flagged}
                caption={`Generated timetable for ${focusOptions.find((o) => o.id === effectiveFocus)?.name}`}
              />
              <SubjectLegend entries={shown} lookup={lookup} />
            </section>
          </div>
        )}
      </div>

      <ClassDialog
        entry={selected}
        dataset={runDataset}
        lookup={lookup}
        entries={run?.result.entries ?? []}
        availability={runAvailability}
        onClose={() => setSelected(null)}
      />

      <ConfirmDialog
        open={confirmApply}
        title="Replace your current timetable?"
        confirmLabel="Use this timetable"
        onCancel={() => setConfirmApply(false)}
        onConfirm={applyToMyTimetable}
      >
        Your current timetable (including any classes you moved) will be replaced by this generated one, seed{" "}
        {run?.result.seed}. It is saved only in this browser. You can restore the original sample timetable from Profile,
        Reset demo data.
      </ConfirmDialog>
    </div>
  );
}
