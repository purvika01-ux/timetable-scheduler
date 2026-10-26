"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { useWorkspace } from "@/lib/store";
import { teachingCapacity } from "@/lib/timetable/capacity";
import { formatTime, slotKey } from "@/lib/timetable/grid";
import type { DayId, SlotKey, Teacher } from "@/lib/timetable/types";

import { Icon } from "./icons";
import { useToast } from "./toast";
import { Banner, Button, ButtonLink, cx } from "./ui";

/** Tap grid of one teacher's available and unavailable periods. Re-mount it (key) after saving. */
export function AvailabilityEditor({ teacher, own }: { teacher: Teacher; own: boolean }) {
  const { dataset, timetable, setTeacherUnavailable, role } = useWorkspace();
  const toast = useToast();
  const grid = dataset.grid;
  const saved = useMemo(() => dataset.availability[teacher.id] ?? [], [dataset.availability, teacher.id]);
  const [draft, setDraft] = useState<Set<SlotKey>>(() => new Set(saved));
  const [error, setError] = useState<string | null>(null);

  const mine = useMemo(() => (timetable?.entries ?? []).filter((e) => e.teacherId === teacher.id), [timetable, teacher.id]);
  const capacity = useMemo(() => teachingCapacity(grid, teacher, dataset.requirements, [...draft]), [grid, teacher, dataset.requirements, draft]);
  const classAt = useMemo(() => {
    const map = new Map<SlotKey, string>();
    for (const e of mine) {
      for (let p = e.startPeriod; p < e.startPeriod + e.span; p++) {
        map.set(slotKey(e.day, p), dataset.subjects.find((s) => s.id === e.subjectId)?.code ?? "");
      }
    }
    return map;
  }, [mine, dataset.subjects]);

  const totalPeriods = grid.days.reduce((n, d) => n + d.periodCount, 0);
  const availableCount = totalPeriods - draft.size;
  const dirty = draft.size !== saved.length || saved.some((k) => !draft.has(k));
  const conflicts = [...draft].filter((k) => classAt.has(k));
  const tooFew = capacity.problems.length > 0;
  const who = own ? "you" : teacher.name;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const toggle = (key: SlotKey) => {
    setError(null);
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleDay = (day: DayId, periodCount: number) => {
    setError(null);
    const keys = Array.from({ length: periodCount }, (_, i) => slotKey(day, i + 1));
    setDraft((prev) => {
      const next = new Set(prev);
      const allOff = keys.every((k) => next.has(k));
      for (const k of keys) {
        if (allOff) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const save = () => {
    if (tooFew) {
      setError(`${capacity.problems.join(" ")} Mark more periods available, or spread them over more days.`);
      return;
    }
    const ordered = grid.days.flatMap((d) => Array.from({ length: d.periodCount }, (_, i) => slotKey(d.id, i + 1)).filter((k) => draft.has(k)));
    if (!setTeacherUnavailable(teacher.id, ordered)) {
      setError("This browser blocked saving (storage may be full or disabled). The changes were not saved.");
      return;
    }
    toast(`Availability saved for ${teacher.name}: ${availableCount} of ${totalPeriods} periods available.`);
  };

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Summary label="Available periods" value={`${availableCount} / ${totalPeriods}`} tone={tooFew ? "danger" : undefined} />
        <Summary label={own ? "You teach" : "Teaches"} value={`${capacity.needed} periods a week`} hint={`${mine.length} classes now scheduled`} />
        <Summary label="Status" value={dirty ? "Unsaved changes" : "Saved"} hint={dirty ? "Save to keep them" : "Stored in this browser"} tone={dirty ? "warning" : undefined} />
      </div>

      <div className="space-y-3">
        {error && (
          <Banner tone="error" title="Availability not saved" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}
        {!error && tooFew && (
          <Banner tone="error" title={`The classes of ${who} cannot fit this availability`}>
            <ul className="list-disc space-y-0.5 pl-4">
              {capacity.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="mt-1">Mark more periods available, or spread them over more days, before saving.</p>
          </Banner>
        )}
        {conflicts.length > 0 && !tooFew && (
          <Banner
            tone="warning"
            title={`${conflicts.length} ${conflicts.length === 1 ? "period clashes" : "periods clash"} with the current timetable`}
            action={
              !dirty &&
              role.kind === "coordinator" && (
                <ButtonLink href="/generate" variant="primary" icon="generate">
                  Generate again
                </ButtonLink>
              )
            }
          >
            Periods marked unavailable where {who} {own ? "have" : "has"} a class are shown with a warning icon. The current timetable keeps them
            until the coordinator generates a new one.
          </Banner>
        )}
      </div>

      <div className="relative mt-4 overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
          <caption className="sr-only">Weekly availability for {teacher.name}</caption>
          <colgroup>
            <col className="w-[84px]" />
            {grid.days.map((d) => (
              <col key={d.id} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-line bg-surface">
              <th scope="col" className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Period
              </th>
              {grid.days.map((d) => {
                const keys = Array.from({ length: d.periodCount }, (_, i) => slotKey(d.id, i + 1));
                const off = keys.filter((k) => draft.has(k)).length;
                return (
                  <th key={d.id} scope="col" className="px-1.5 py-2 text-left font-semibold text-ink">
                    <span className="block">{d.short}</span>
                    <button type="button" onClick={() => toggleDay(d.id, d.periodCount)} className="mt-0.5 rounded text-xs font-medium text-primary hover:underline">
                      {off === keys.length ? "Make all available" : "Mark day off"}
                      <span className="sr-only"> for {d.label}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {grid.periods.map((period) => {
              const brk = grid.breaks.find((b) => b.afterPeriod === period.number);
              return (
                <Fragment key={period.number}>
                  <tr className="border-b border-line-soft">
                    <th scope="row" className="bg-surface px-2 py-1.5 text-left align-middle font-normal">
                      <span className="block font-semibold text-ink">P{period.number}</span>
                      <span className="block text-[11px] text-ink-muted">{formatTime(period.start)}</span>
                    </th>
                    {grid.days.map((d) => {
                      if (period.number > d.periodCount) {
                        return (
                          <td key={d.id} className="hatch bg-slate-50">
                            <span className="sr-only">No teaching period</span>
                          </td>
                        );
                      }
                      const key = slotKey(d.id, period.number);
                      const off = draft.has(key);
                      const code = classAt.get(key);
                      return (
                        <td key={d.id} className="p-1">
                          <button
                            type="button"
                            aria-pressed={!off}
                            onClick={() => toggle(key)}
                            aria-label={`${d.label}, period ${period.number}, ${formatTime(period.start)}: ${off ? "unavailable" : "available"}${code ? `, class ${code} scheduled` : ""}. Press to mark ${off ? "available" : "unavailable"}.`}
                            className={cx(
                              "flex h-12 w-full items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition-colors",
                              off ? "hatch border-red-300 bg-red-50 text-red-800 hover:bg-red-100" : "border-green-200 bg-green-50 text-green-800 hover:bg-green-100",
                            )}
                          >
                            <Icon name={off ? "x" : "check"} className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">{off ? "Unavailable" : "Available"}</span>
                            {code && off && <Icon name="alert" className="h-3.5 w-3.5 text-warning" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                  {brk && (
                    <tr className="border-b border-line-soft">
                      <th scope="row" className="bg-surface px-2 py-1 text-left text-[11px] font-normal text-ink-muted">
                        {formatTime(brk.start)}
                      </th>
                      <td colSpan={grid.days.length} className="hatch px-3 py-1 text-xs text-ink-muted">
                        {brk.label}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="grid h-4 w-4 place-items-center rounded border border-green-200 bg-green-50 text-green-800">
            <Icon name="check" className="h-3 w-3" />
          </span>
          Available
        </li>
        <li className="flex items-center gap-1.5">
          <span className="hatch grid h-4 w-4 place-items-center rounded border border-red-300 bg-red-50 text-red-800">
            <Icon name="x" className="h-3 w-3" />
          </span>
          Unavailable
        </li>
        <li className="flex items-center gap-1.5">
          <Icon name="alert" className="h-3.5 w-3.5 text-warning" />
          Unavailable, but a class is scheduled there now
        </li>
      </ul>

      <div className="sticky bottom-16 z-10 mt-5 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-line bg-white/95 px-4 py-3 backdrop-blur md:bottom-4">
        <p className="mr-auto text-sm text-ink-muted" aria-live="polite">
          {dirty ? "You have unsaved changes." : "All changes saved in this browser."}
        </p>
        <Button
          variant="ghost"
          onClick={() => {
            setDraft(new Set());
            setError(null);
          }}
        >
          Mark everything available
        </Button>
        <Button
          onClick={() => {
            setDraft(new Set(saved));
            setError(null);
          }}
          disabled={!dirty}
        >
          Discard changes
        </Button>
        <Button variant="primary" icon="checkCircle" onClick={save} disabled={!dirty}>
          Save availability
        </Button>
      </div>
    </div>
  );
}

function Summary({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" | "warning" }) {
  return (
    <div className="rounded-lg border border-line bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={cx("mt-0.5 text-lg font-semibold", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-ink")}>{value}</p>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
