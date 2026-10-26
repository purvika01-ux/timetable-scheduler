"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { RoleNotice } from "@/components/app-shell";
import { Icon } from "@/components/icons";
import { ConfirmDialog } from "@/components/modal";
import { TimetableExplorer } from "@/components/timetable-explorer";
import { useToast } from "@/components/toast";
import { Banner, Button, ButtonLink, PageHeader, PageSkeleton, Panel, StatTile, Stamp } from "@/components/ui";
import { runGeneration, type GenerationRun } from "@/lib/run-generation";
import { useWorkspace } from "@/lib/store";
import { checkDataset } from "@/lib/timetable/college";
import { totalTeachingPeriods } from "@/lib/timetable/grid";
import { makeLookup } from "@/lib/timetable/lookup";
import { precheck } from "@/lib/timetable/precheck";
import type { Dataset } from "@/lib/timetable/types";

const AREA_HREF: Record<string, string> = {
  college: "/setup/college",
  grid: "/setup/college",
  departments: "/setup/departments",
  rooms: "/setup/rooms",
  teachers: "/setup/teachers",
  subjects: "/setup/subjects",
  sections: "/setup/sections",
  courses: "/setup/courses",
};

interface Run extends GenerationRun {
  /** The data the run used, so later edits do not change what is shown. */
  dataset: Dataset;
}

export default function GeneratePage() {
  const { ready, role, dataset, saveTimetable } = useWorkspace();
  const toast = useToast();
  const [seed, setSeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [applied, setApplied] = useState(false);

  const dataProblems = useMemo(() => checkDataset(dataset), [dataset]);
  const checks = useMemo(() => precheck(dataset), [dataset]);
  const lookup = useMemo(() => makeLookup(run?.dataset ?? dataset), [run, dataset]);

  if (!ready) return <PageSkeleton />;
  if (role.kind !== "coordinator") return <RoleNotice needs="coordinator" />;

  const blocking = checks.filter((c) => c.severity === "blocking");
  const warnings = checks.filter((c) => c.severity === "warning");
  const cannotRun = dataProblems.length > 0 || dataset.requirements.length === 0;
  const sessions = dataset.requirements.reduce((n, r) => n + r.sessionsPerWeek, 0);
  const stale = run !== null && JSON.stringify(run.dataset) !== JSON.stringify(dataset);

  const generate = async (nextSeed: number) => {
    setRunning(true);
    setFailure(null);
    setApplied(false);
    setSeed(nextSeed);
    const snapshot = structuredClone(dataset);
    try {
      const result = await runGeneration(snapshot, nextSeed);
      setRun({ ...result, dataset: snapshot });
    } catch {
      setFailure("The generator stopped unexpectedly. Nothing was saved. Try again, or check the data in Set up college.");
    } finally {
      setRunning(false);
    }
  };

  const apply = () => {
    setConfirmApply(false);
    if (!run) return;
    if (saveTimetable(run.result.entries, "generated", run.result.seed)) {
      setApplied(true);
      toast("Timetable saved in this browser. Teachers see it in their view.");
    } else {
      setFailure("This browser blocked saving. The current timetable was not changed.");
    }
  };

  const report = run?.report;
  const unplaced = run?.result.unplaced ?? [];
  const placed = run?.result.entries.length ?? 0;
  const clashTotal = report ? report.counts.teacher + report.counts.room + report.counts.section : 0;
  const otherViolations = report ? report.issues.length - clashTotal : 0;
  const canApply = !!run && !!report?.valid && !stale;

  return (
    <div>
      <PageHeader
        title="Generate timetable"
        description="Checks your college's data, builds a whole-college timetable, then re-checks it with an independent validator."
        actions={
          <ButtonLink href="/timetable" icon="calendar">
            Current timetable
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="1. Pre-check" className="lg:col-span-2">
          <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            {[
              ["Teachers", dataset.teachers.length],
              ["Sections", dataset.sections.length],
              ["Rooms", dataset.rooms.length],
              ["Sessions / week", sessions],
              ["Periods / week", totalTeachingPeriods(dataset.grid)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md bg-surface px-3 py-2">
                <dt className="text-xs text-ink-muted">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          {checks.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <Icon name="checkCircle" className="h-4 w-4" />
              Everything needed is in place: every course has a suitable room and every teacher&apos;s load fits their availability.
            </p>
          ) : (
            <ul className="space-y-2">
              {[...blocking, ...warnings].map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Icon name="alert" className={`mt-0.5 h-4 w-4 shrink-0 ${c.severity === "blocking" ? "text-danger" : "text-warning"}`} />
                  <span className="flex-1">
                    <span className="sr-only">{c.severity === "blocking" ? "Problem: " : "Warning: "}</span>
                    {c.message}{" "}
                    <Link href={AREA_HREF[c.area]} className="font-medium text-primary underline underline-offset-2">
                      Fix
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="2. Generate">
          {cannotRun ? (
            <p className="text-sm text-ink-muted">
              {dataset.requirements.length === 0 ? "Add courses in Set up college first." : "Fix the data problems in the pre-check first."}
            </p>
          ) : blocking.length > 0 ? (
            <p className="text-sm text-ink-muted">
              {blocking.length} {blocking.length === 1 ? "problem means" : "problems mean"} some sessions cannot fit. You can still generate to see what
              does fit; every session left out is listed with its reason.
            </p>
          ) : (
            <p className="text-sm text-ink-muted">
              Hard rules: no teacher, room or section double-booking; availability; room type, size and department access; labs as one
              block that never crosses a break; daily teaching limits.
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2">
            <Button variant="primary" icon="generate" onClick={() => generate(run && !stale ? seed : 1)} disabled={running || cannotRun} className="w-full">
              {running ? "Generating…" : blocking.length > 0 ? "Generate what fits" : run && !stale ? "Generate again (same seed)" : "Generate timetable"}
            </Button>
            {run && !stale && (
              <Button icon="refresh" onClick={() => generate(seed + 1)} disabled={running || cannotRun} className="w-full">
                Try another arrangement (seed {seed + 1})
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs text-ink-muted">The same data and seed always give the same timetable. Generation runs in the background, so the page stays usable.</p>
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
            Generating and validating a timetable for {sessions} sessions…
          </div>
        )}

        {!running && run && report && (
          <div className="space-y-4">
            {stale && (
              <Banner tone="warning" title="The college's data changed after this result was generated">
                Generate again to use the latest data. This result can no longer be applied.
              </Banner>
            )}
            {!report.valid ? (
              <Banner tone="error" title={`Validation failed: ${report.issues.length} problems found`}>
                This result is not clash-free and cannot be used. Problem classes are outlined in red below.
                <ul className="mt-2 list-disc pl-4">
                  {report.issues.slice(0, 5).map((i, n) => (
                    <li key={n}>{i.message}</li>
                  ))}
                </ul>
              </Banner>
            ) : unplaced.length === 0 ? (
              <Banner tone="success" title={`Clash-free timetable: all ${placed} sessions placed`}>
                The independent validator re-checked every class: 0 teacher, 0 room and 0 section clashes; every availability, room, break and
                daily-limit rule holds; every course has all its weekly sessions. Seed {run.result.seed}, {Math.max(1, Math.round(run.durationMs))} ms.
              </Banner>
            ) : (
              <Banner tone="warning" title={`Clash-free, but ${unplaced.length} ${unplaced.length === 1 ? "session" : "sessions"} could not be placed`}>
                Everything placed passed validation with zero clashes. The sessions listed below need a data change (another room, more
                availability) or a manual decision. Seed {run.result.seed}.
              </Banner>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="Scheduled" value={placed} hint={`of ${run.result.totalSessions} sessions`} tone="success" />
              <StatTile label="Unplaced" value={unplaced.length} hint="reported below" tone={unplaced.length ? "danger" : undefined} />
              <StatTile label="Teacher clashes" value={report.counts.teacher} tone={report.counts.teacher ? "danger" : "success"} />
              <StatTile label="Room clashes" value={report.counts.room} tone={report.counts.room ? "danger" : "success"} />
              <StatTile label="Section clashes" value={report.counts.section} tone={report.counts.section ? "danger" : "success"} />
              <StatTile label="Other rule breaks" value={otherViolations} hint="availability, rooms, grid, limits" tone={otherViolations ? "danger" : "success"} />
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white px-4 py-3">
              <span className="mr-auto flex flex-wrap items-center gap-2 text-sm">
                <Stamp tone={report.valid ? "success" : "danger"}>{report.valid ? "Validated" : "Invalid"}</Stamp>
                {report.valid && unplaced.length > 0 && <Stamp tone="warning">Incomplete</Stamp>}
                <span className="text-ink-muted">
                  {applied
                    ? "Saved as the college timetable."
                    : stale
                      ? "Generate again with the latest data to use a result."
                      : !report.valid
                        ? "Only a validated result can be used."
                        : unplaced.length > 0
                          ? `Use this result anyway? ${unplaced.length} ${unplaced.length === 1 ? "session" : "sessions"} would be missing.`
                          : "Use this result as the college timetable?"}
                </span>
              </span>
              {applied ? (
                <ButtonLink href="/timetable" variant="primary" icon="calendar">
                  Open timetable
                </ButtonLink>
              ) : (
                <Button variant="primary" icon="checkCircle" disabled={!canApply} onClick={() => setConfirmApply(true)}>
                  Use this timetable
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
                          {u.span > 1 ? ` · ${u.span}-period block` : ""}
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

            <TimetableExplorer
              dataset={run.dataset}
              entries={run.result.entries}
              availability={run.dataset.availability}
              flaggedIds={new Set(report.issues.flatMap((i) => i.entryIds))}
              heading="Generated timetable"
            />
          </div>
        )}

        {!running && !run && !failure && (
          <div className="rounded-lg border border-dashed border-line bg-white px-6 py-10 text-center">
            <Icon name="generate" className="mx-auto h-8 w-8 text-ink-muted" />
            <p className="mt-3 font-semibold text-ink">No timetable generated yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
              Press Generate timetable. Results appear here with clash counts and any sessions that could not be placed.
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmApply}
        title={unplaced.length > 0 ? "Replace the timetable with an incomplete one?" : "Replace the current timetable?"}
        confirmLabel={unplaced.length > 0 ? "Use incomplete timetable" : "Use this timetable"}
        onCancel={() => setConfirmApply(false)}
        onConfirm={apply}
      >
        {unplaced.length > 0 && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
            <p className="font-semibold">
              {unplaced.length} {unplaced.length === 1 ? "session is" : "sessions are"} not placed and will be missing:
            </p>
            <ul className="mt-1 list-disc pl-4">
              {unplaced.map((u) => (
                <li key={`${u.requirementId}-${u.occurrence}`}>
                  {lookup.subject(u.subjectId)?.code} {lookup.subject(u.subjectId)?.name}, {lookup.section(u.sectionId)?.name}, {lookup.teacher(u.teacherId)?.name}
                </li>
              ))}
            </ul>
            <p className="mt-1">The home page and teachers&apos; dashboards keep warning about them until a complete timetable is used.</p>
          </div>
        )}
        The current timetable (including any classes moved by hand) will be replaced by this generated one, seed {run?.result.seed}. It is saved
        only in this browser; you can keep a copy with Save and open.
      </ConfirmDialog>
    </div>
  );
}
