"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { RoleNotice } from "@/components/app-shell";
import { Icon } from "@/components/icons";
import { ConfirmDialog } from "@/components/modal";
import { TimetableExplorer } from "@/components/timetable-explorer";
import { useToast } from "@/components/toast";
import { Banner, Button, ButtonLink, PageHeader, PageSkeleton, Panel, StatTile, Stamp } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { runGeneration, type GenerationRun } from "@/lib/run-generation";
import { useWorkspace } from "@/lib/store";
import { checkDataset } from "@/lib/timetable/college";
import { totalTeachingPeriods } from "@/lib/timetable/grid";
import { makeLookup } from "@/lib/timetable/lookup";
import { precheck } from "@/lib/timetable/precheck";
import type { Dataset, ValidationReport } from "@/lib/timetable/types";

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
  serverReport?: (ValidationReport & { serverValidated: boolean; validatedAt?: string }) | null;
}

export default function GeneratePage() {
  const { ready, role, dataset, saveTimetable } = useWorkspace();
  const { activeCollege, api } = useAuth();
  const toast = useToast();

  const [seed, setSeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [applied, setApplied] = useState(false);
  const [appliedOnServer, setAppliedOnServer] = useState(false);

  // Selection states
  const [selectedSectionId, setSelectedSectionId] = useState<string>("all");
  const [excludedReqIds, setExcludedReqIds] = useState<Set<string>>(new Set());
  const [showReqTable, setShowReqTable] = useState(false);

  // Compute scoped dataset according to selection
  const scopedDataset: Dataset = useMemo(() => {
    let reqs = dataset.requirements;
    if (selectedSectionId !== "all") {
      reqs = reqs.filter((r) => r.sectionId === selectedSectionId);
    }
    if (excludedReqIds.size > 0) {
      reqs = reqs.filter((r) => !excludedReqIds.has(r.id));
    }
    const secIds = new Set(reqs.map((r) => r.sectionId));
    const teachIds = new Set(reqs.map((r) => r.teacherId));
    const subIds = new Set(reqs.map((r) => r.subjectId));

    return {
      ...dataset,
      requirements: reqs,
      sections: dataset.sections.filter((s) => secIds.has(s.id)),
      teachers: dataset.teachers.filter((t) => teachIds.has(t.id)),
      subjects: dataset.subjects.filter((s) => subIds.has(s.id)),
    };
  }, [dataset, selectedSectionId, excludedReqIds]);

  const dataProblems = useMemo(() => checkDataset(scopedDataset), [scopedDataset]);
  const checks = useMemo(() => precheck(scopedDataset), [scopedDataset]);
  const lookup = useMemo(() => makeLookup(run?.dataset ?? scopedDataset), [run, scopedDataset]);

  if (!ready) return <PageSkeleton />;
  if (role.kind !== "coordinator") return <RoleNotice needs="coordinator" />;

  const blocking = checks.filter((c) => c.severity === "blocking");
  const warnings = checks.filter((c) => c.severity === "warning");
  const cannotRun = dataProblems.length > 0 || scopedDataset.requirements.length === 0;
  const sessions = scopedDataset.requirements.reduce((n, r) => n + r.sessionsPerWeek, 0);
  const stale = run !== null && JSON.stringify(run.dataset) !== JSON.stringify(scopedDataset);

  const toggleReq = (reqId: string) => {
    setExcludedReqIds((prev) => {
      const next = new Set(prev);
      if (next.has(reqId)) next.delete(reqId);
      else next.add(reqId);
      return next;
    });
  };

  const generate = async (nextSeed: number) => {
    setRunning(true);
    setFailure(null);
    setApplied(false);
    setSeed(nextSeed);
    const snapshot = structuredClone(scopedDataset);

    try {
      const result = await runGeneration(snapshot, nextSeed);

      // Perform independent server-side validation when active college exists
      let serverReport: (ValidationReport & { serverValidated: boolean; validatedAt?: string }) | null = null;
      if (activeCollege) {
        try {
          const valRes = await api.request<ValidationReport & { serverValidated: boolean; validatedAt?: string }>(
            `/colleges/${activeCollege.collegeId}/academic/timetable/validate`,
            {
              method: "POST",
              body: { entries: result.result.entries },
            },
          );
          serverReport = valRes;
        } catch {
          // Shown as "not checked on the server"; the server checks the save again anyway.
        }
      }

      setRun({ ...result, dataset: snapshot, serverReport });
    } catch {
      setFailure("The generator stopped unexpectedly. Nothing was saved. Try again, or check the academic setup.");
    } finally {
      setRunning(false);
    }
  };

  const apply = async () => {
    setConfirmApply(false);
    if (!run) return;
    const saved = await saveTimetable(run.result.entries, "generated", run.result.seed);
    if (saved.ok) {
      setApplied(true);
      setAppliedOnServer(saved.savedToServer);
      toast(saved.savedToServer ? "Timetable saved on the server. All college views updated." : "Timetable saved in this browser. All views updated.");
    } else {
      setFailure(saved.error);
    }
  };

  const report = run?.report;
  const serverReport = run?.serverReport;
  const unplaced = run?.result.unplaced ?? [];
  const placed = run?.result.entries.length ?? 0;
  const clashTotal = report ? report.counts.teacher + report.counts.room + report.counts.section : 0;
  const otherViolations = report ? report.issues.length - clashTotal : 0;

  // Signed in, a run counts as clash-free only when the server's validator checked it and agreed.
  const serverChecked = !!serverReport;
  const isServerValid = activeCollege ? serverChecked && serverReport.valid : true;
  const isOverallValid = !!report?.valid && isServerValid;
  // Completeness comes from the validator, and covers only the courses selected for this run.
  const isComplete = !!report?.complete;
  const scopeNote = scopedDataset.requirements.length < dataset.requirements.length ? " in the selected scope" : "";
  const canApply = !!run && isOverallValid && !stale;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Generate timetable"
        description="Select sections, review academic resources, generate clash-free schedules, and verify with independent server-side validation."
        actions={
          <ButtonLink href="/timetable" icon="calendar">
            Current timetable
          </ButtonLink>
        }
      />

      {/* 1. Academic Scope & Selection Card */}
      <Panel
        title="1. Scope & Academic Resource Selection"
        action={
          <Button variant="ghost" onClick={() => setShowReqTable((v) => !v)}>
            {showReqTable ? "Hide Course Details" : "Show Course Details"}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="section-select" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Target Section
              </label>
              <select
                id="section-select"
                value={selectedSectionId}
                onChange={(e) => {
                  setSelectedSectionId(e.target.value);
                  setExcludedReqIds(new Set());
                }}
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All Sections ({dataset.sections.length} total)</option>
                {dataset.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.programme}, Sem {s.semester})
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-md bg-surface px-3 py-2">
              <dt className="text-xs text-ink-muted">Included Subjects</dt>
              <dd className="text-lg font-semibold tabular-nums text-ink">{scopedDataset.subjects.length}</dd>
            </div>

            <div className="rounded-md bg-surface px-3 py-2">
              <dt className="text-xs text-ink-muted">Teachers Assigned</dt>
              <dd className="text-lg font-semibold tabular-nums text-ink">{scopedDataset.teachers.length}</dd>
            </div>

            <div className="rounded-md bg-surface px-3 py-2">
              <dt className="text-xs text-ink-muted">Eligible Rooms</dt>
              <dd className="text-lg font-semibold tabular-nums text-ink">
                {scopedDataset.rooms.length} ({scopedDataset.rooms.filter((r) => r.type === "lab").length} labs)
              </dd>
            </div>
          </div>

          {showReqTable && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-surface text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="px-3 py-2">Include</th>
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2">Section</th>
                    <th className="px-3 py-2">Teacher</th>
                    <th className="px-3 py-2">Room Type</th>
                    <th className="px-3 py-2">Duration</th>
                    <th className="px-3 py-2">Sessions/Week</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft bg-white">
                  {dataset.requirements
                    .filter((r) => selectedSectionId === "all" || r.sectionId === selectedSectionId)
                    .map((req) => {
                      const isChecked = !excludedReqIds.has(req.id);
                      const sub = lookup.subject(req.subjectId);
                      const sec = lookup.section(req.sectionId);
                      const tea = lookup.teacher(req.teacherId);
                      return (
                        <tr key={req.id} className={isChecked ? "" : "bg-surface-subtle opacity-60"}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleReq(req.id)}
                              className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
                            />
                          </td>
                          <td className="px-3 py-2 font-medium text-ink">
                            {sub?.code} - {sub?.name}
                          </td>
                          <td className="px-3 py-2 text-ink-muted">{sec?.name}</td>
                          <td className="px-3 py-2 text-ink-muted">{tea?.name}</td>
                          <td className="px-3 py-2 text-ink-muted">
                            <Stamp tone={req.roomType === "lab" ? "warning" : "neutral"}>{req.roomType}</Stamp>
                          </td>
                          <td className="px-3 py-2 text-ink-muted">
                            {req.span} {req.span === 1 ? "period" : "periods (block)"}
                          </td>
                          <td className="px-3 py-2 font-semibold text-ink">{req.sessionsPerWeek}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Panel>

      {/* 2. Pre-Check & Generation Controls */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="2. Pre-Check Validation" className="lg:col-span-2">
          <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ["Selected Sections", scopedDataset.sections.length],
              ["Total Teachers", scopedDataset.teachers.length],
              ["Weekly Sessions", sessions],
              ["Teaching Periods/Wk", totalTeachingPeriods(scopedDataset.grid)],
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
              Pre-check passed: Every requirement has candidate rooms and teacher loads are within capacity.
            </p>
          ) : (
            <ul className="space-y-2">
              {[...blocking, ...warnings].map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Icon name="alert" className={`mt-0.5 h-4 w-4 shrink-0 ${c.severity === "blocking" ? "text-danger" : "text-warning"}`} />
                  <span className="flex-1">
                    <span className="sr-only">{c.severity === "blocking" ? "Problem: " : "Warning: "}</span>
                    {c.message}{" "}
                    <Link href={AREA_HREF[c.area] || "/setup"} className="font-medium text-primary underline underline-offset-2">
                      Fix
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="3. Execute Scheduler">
          {cannotRun ? (
            <p className="text-sm text-ink-muted">
              {scopedDataset.requirements.length === 0 ? "Select or add courses in the scope above first." : "Fix the data problems in the pre-check first."}
            </p>
          ) : (
            <p className="text-sm text-ink-muted">
              Enforces hard zero-clash constraints (teacher, room, section), availability restrictions, lab block continuity, and daily teaching limits.
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2">
            <Button
              variant="primary"
              icon="generate"
              onClick={() => generate(run && !stale ? seed : 1)}
              disabled={running || cannotRun}
              className="w-full"
            >
              {running ? "Generating & Validating…" : blocking.length > 0 ? "Generate what fits" : run && !stale ? "Generate again (same seed)" : "Generate timetable"}
            </Button>
            {run && !stale && (
              <Button icon="refresh" onClick={() => generate(seed + 1)} disabled={running || cannotRun} className="w-full">
                Try next arrangement (seed {seed + 1})
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Deterministic scheduling: The same seed produces identical routines. Results are validated independently on the server.
          </p>
        </Panel>
      </div>

      {/* 3. Results & Verification */}
      <div aria-live="polite" aria-busy={running}>
        {failure && (
          <Banner tone="error" title="Generation failed" onDismiss={() => setFailure(null)}>
            {failure}
          </Banner>
        )}

        {running && (
          <div className="flex items-center gap-3 rounded-lg border border-line bg-white px-4 py-4 text-sm text-ink shadow-sm">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
            Generating timetable and running independent server-side validation for {sessions} weekly sessions…
          </div>
        )}

        {!running && run && report && (
          <div className="space-y-4">
            {stale && (
              <Banner tone="warning" title="Academic setup changed after this run was generated">
                Click Generate again to produce a schedule with the latest data.
              </Banner>
            )}

            {activeCollege && !serverChecked && report.valid ? (
              <Banner tone="error" title="Not checked on the server">
                The server could not check this result, so it cannot be applied. Check your connection and generate again.
              </Banner>
            ) : !isOverallValid ? (
              <Banner tone="error" title={`Validation failed: ${report.issues.length} clashes or rule violations found`}>
                This schedule has conflicts and cannot be applied. Problem classes are outlined below:
                <ul className="mt-2 list-disc pl-4">
                  {report.issues.slice(0, 5).map((i, n) => (
                    <li key={n}>{i.message}</li>
                  ))}
                  {serverReport && !serverReport.valid && (
                    <li className="font-semibold text-danger">Server-side independent clash verification rejected this result.</li>
                  )}
                </ul>
              </Banner>
            ) : isComplete ? (
              <Banner tone="success" title={`Clash-free and complete${scopeNote}: all ${placed} sessions placed`}>
                {serverChecked ? "This browser and the server each checked it" : "Checked in this browser"}: no teacher, room or section clashes,
                and every course{scopeNote} has all its weekly sessions. Seed {run.result.seed}.
              </Banner>
            ) : (
              <Banner tone="warning" title={`Clash-free, but ${unplaced.length} ${unplaced.length === 1 ? "session" : "sessions"} could not be placed`}>
                No placed class breaks a rule{serverChecked ? " (checked in this browser and on the server)" : ""}. The missing sessions are
                listed below, each with its reasons. Seed {run.result.seed}.
              </Banner>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="Scheduled" value={placed} hint={`of ${run.result.totalSessions} sessions`} tone="success" />
              <StatTile label="Unplaced" value={unplaced.length} hint="see breakdown below" tone={unplaced.length ? "danger" : undefined} />
              <StatTile label="Teacher clashes" value={report.counts.teacher} tone={report.counts.teacher ? "danger" : "success"} />
              <StatTile label="Room clashes" value={report.counts.room} tone={report.counts.room ? "danger" : "success"} />
              <StatTile label="Section clashes" value={report.counts.section} tone={report.counts.section ? "danger" : "success"} />
              <StatTile label="Other rule breaks" value={otherViolations} hint="availability, capacity, limits" tone={otherViolations ? "danger" : "success"} />
            </div>

            {/* Validation & Save Action Bar */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 shadow-sm">
              <div className="mr-auto flex flex-wrap items-center gap-2 text-sm">
                <Stamp tone={report.valid ? "success" : "danger"}>
                  {report.valid ? "Checked in this browser" : "Fails the check in this browser"}
                </Stamp>
                {serverReport && (
                  <Stamp tone={serverReport.valid ? "success" : "danger"}>
                    {serverReport.valid ? "Checked on the server" : "Refused by the server"}
                  </Stamp>
                )}
                {activeCollege && !serverChecked && <Stamp tone="danger">Not checked on the server</Stamp>}
                {isOverallValid && !isComplete && <Stamp tone="warning">Incomplete ({unplaced.length} missing)</Stamp>}
                <span className="text-xs text-ink-muted sm:text-sm">
                  {applied
                    ? appliedOnServer
                      ? "Saved on the server and active for the college."
                      : "Saved in this browser."
                    : stale
                      ? "Generate again to use latest data."
                      : !isOverallValid
                        ? "Only validated clash-free timetables can be applied."
                        : !isComplete
                          ? `Use this schedule anyway? (${unplaced.length} sessions will remain unassigned).`
                          : "Ready to set as the active college timetable."}
                </span>
              </div>

              {applied ? (
                <ButtonLink href="/timetable" variant="primary" icon="calendar">
                  Open in Timetable View
                </ButtonLink>
              ) : (
                <Button variant="primary" icon="checkCircle" disabled={!canApply} onClick={() => setConfirmApply(true)}>
                  Use this timetable
                </Button>
              )}
            </div>

            {/* Unplaced sessions breakdown */}
            {unplaced.length > 0 && (
              <Panel title={`Unplaced Sessions (${unplaced.length})`}>
                <ul className="divide-y divide-line-soft">
                  {unplaced.map((u) => (
                    <li key={`${u.requirementId}-${u.occurrence}`} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                        <Icon name="alert" className="h-4 w-4 text-danger" />
                        <span>
                          {lookup.subject(u.subjectId)?.code} - {lookup.subject(u.subjectId)?.name}
                        </span>
                        <span className="font-normal text-ink-muted">
                          · {lookup.section(u.sectionId)?.name} · {lookup.teacher(u.teacherId)?.name} · session {u.occurrence}
                          {u.span > 1 ? ` · ${u.span}-period block` : ""}
                        </span>
                      </div>
                      <ul className="mt-1.5 list-disc space-y-1 pl-8 text-xs text-ink-muted">
                        {u.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {/* Generated Timetable Explorer Grid */}
            <TimetableExplorer
              dataset={run.dataset}
              entries={run.result.entries}
              availability={run.dataset.availability}
              flaggedIds={new Set(report.issues.flatMap((i) => i.entryIds))}
              heading="Generated Schedule Preview"
            />
          </div>
        )}

        {!running && !run && !failure && (
          <div className="rounded-lg border border-dashed border-line bg-white px-6 py-12 text-center">
            <Icon name="generate" className="mx-auto h-8 w-8 text-ink-muted" />
            <p className="mt-3 font-semibold text-ink">No timetable generated in this session yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
              Select your academic section or keep all sections, then click &quot;Generate timetable&quot;. The engine will compute the routine and independently verify it on the server.
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmApply}
        title={!report?.complete ? "Use an incomplete timetable?" : "Use this generated timetable?"}
        confirmLabel={!report?.complete ? "Use incomplete timetable" : "Use this timetable"}
        onCancel={() => setConfirmApply(false)}
        onConfirm={apply}
      >
        {unplaced.length > 0 && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
            <p className="font-semibold">
              {unplaced.length} {unplaced.length === 1 ? "session is" : "sessions are"} not placed and will be missing:
            </p>
            <ul className="mt-1 list-disc pl-4 text-xs">
              {unplaced.map((u) => (
                <li key={`${u.requirementId}-${u.occurrence}`}>
                  {lookup.subject(u.subjectId)?.code} {lookup.subject(u.subjectId)?.name}, {lookup.section(u.sectionId)?.name}, {lookup.teacher(u.teacherId)?.name}
                </li>
              ))}
            </ul>
          </div>
        )}
        {activeCollege
          ? `This replaces the college's saved timetable on the server (seed ${run?.result.seed}). The server checks it again first and refuses any clash. Everyone in the college sees the new timetable when they next load it.`
          : `This replaces the timetable saved in this browser (seed ${run?.result.seed}).`}
      </ConfirmDialog>
    </div>
  );
}
