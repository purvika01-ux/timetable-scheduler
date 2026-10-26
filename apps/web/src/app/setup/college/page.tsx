"use client";

import { useState } from "react";

import { Icon } from "@/components/icons";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Banner, Button, PageHeader, Panel } from "@/components/ui";
import { useWorkspace } from "@/lib/store";
import { checkDataset, DAY_LABELS, pruneAvailability, withBreakTimes } from "@/lib/timetable/college";
import { DAY_ORDER, formatTime } from "@/lib/timetable/grid";
import type { College, DayId, TimeGrid } from "@/lib/timetable/types";

const INPUT = "h-10 w-full rounded-md border border-line bg-white px-3 text-sm";

export default function CollegeAndWeekPage() {
  const { dataset, timetable, updateDataset, replaceWorkspace } = useWorkspace();
  const toast = useToast();
  const [college, setCollege] = useState<College>(dataset.college);
  const [grid, setGrid] = useState<TimeGrid>(dataset.grid);
  const [confirmClear, setConfirmClear] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const draft = { ...dataset, college, grid: withBreakTimes(grid) };
  const problems = checkDataset(draft).filter((p) => p.area === "college" || p.area === "grid");
  const gridChanged = JSON.stringify(withBreakTimes(grid)) !== JSON.stringify(dataset.grid);
  const dirty = gridChanged || JSON.stringify(college) !== JSON.stringify(dataset.college);
  const collegeError = (field: string) => problems.find((p) => p.area === "college" && p.field === field)?.message;

  const commit = () => {
    setConfirmClear(false);
    // One write, so the old timetable can never be saved again alongside the new week.
    const ok =
      gridChanged && timetable
        ? replaceWorkspace({ version: 1, dataset: { ...draft, availability: pruneAvailability(draft) }, timetable: null })
        : updateDataset(draft).ok;
    if (!ok) {
      setSaveError("This browser blocked saving. Nothing was changed.");
      return;
    }
    setSaveError(null);
    toast(gridChanged && timetable ? "Saved. The old timetable was cleared because the week changed; generate a new one." : "College and week saved.");
  };

  const save = () => {
    if (problems.length > 0) return;
    if (gridChanged && timetable) setConfirmClear(true);
    else commit();
  };

  const setDay = (id: DayId, on: boolean) =>
    setGrid((g) => ({
      ...g,
      days: on
        ? [...g.days, { id, ...DAY_LABELS[id], periodCount: g.periods.length }].sort((a, b) => DAY_ORDER.indexOf(a.id) - DAY_ORDER.indexOf(b.id))
        : g.days.filter((d) => d.id !== id),
    }));

  const addPeriod = () =>
    setGrid((g) => {
      const last = g.periods[g.periods.length - 1];
      const start = last?.end ?? "09:00";
      const [h, m] = start.split(":").map(Number);
      const endMin = h * 60 + m + 50;
      const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
      return { ...g, periods: [...g.periods, { number: g.periods.length + 1, start, end }] };
    });

  const removePeriod = () =>
    setGrid((g) => {
      const n = g.periods.length - 1;
      return {
        ...g,
        periods: g.periods.slice(0, n),
        days: g.days.map((d) => ({ ...d, periodCount: Math.min(d.periodCount, Math.max(1, n)) })),
        breaks: g.breaks.filter((b) => b.afterPeriod < n),
      };
    });

  return (
    <div className="space-y-4">
      <PageHeader title="College and week" description="Your college's name and the shape of its teaching week: days, period times and breaks." />

      {problems.length > 0 && (
        <Banner tone="error" title="Fix these before saving">
          <ul className="list-disc space-y-0.5 pl-4">
            {problems.map((p, i) => (
              <li key={i}>{p.message}</li>
            ))}
          </ul>
        </Banner>
      )}
      {saveError && <Banner tone="error" title="Not saved">{saveError}</Banner>}

      <Panel title="College">
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["name", "College name", "For example: Government College, Ludhiana"],
              ["shortName", "Short name (optional)", "For example: GCL"],
              ["semesterLabel", "Semester", "For example: Odd semester 2026–27"],
            ] as const
          ).map(([key, label, hint]) => (
            <div key={key}>
              <label htmlFor={`college-${key}`} className="mb-1 block text-sm font-medium text-ink">
                {label}
              </label>
              <input
                id={`college-${key}`}
                className={INPUT}
                value={college[key]}
                onChange={(e) => setCollege((c) => ({ ...c, [key]: e.target.value }))}
                aria-invalid={collegeError(key) ? "true" : "false"}
                aria-describedby={`college-${key}-hint`}
              />
              <p id={`college-${key}-hint`} className={`mt-1 text-xs ${collegeError(key) ? "font-medium text-danger" : "text-ink-muted"}`}>
                {collegeError(key) ?? hint}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title={`Periods (${grid.periods.length})`}
          action={
            <span className="flex gap-1">
              <Button icon="plus" onClick={addPeriod} disabled={grid.periods.length >= 12}>
                Add period
              </Button>
              <Button onClick={removePeriod} disabled={grid.periods.length <= 1} aria-label="Remove the last period">
                Remove last
              </Button>
            </span>
          }
        >
          <table className="w-full text-sm">
            <caption className="sr-only">Period times</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th scope="col" className="py-2 pr-2 font-semibold">Period</th>
                <th scope="col" className="py-2 pr-2 font-semibold">Starts</th>
                <th scope="col" className="py-2 font-semibold">Ends</th>
              </tr>
            </thead>
            <tbody>
              {grid.periods.map((p, i) => (
                <tr key={p.number} className="border-b border-line-soft last:border-0">
                  <th scope="row" className="py-1.5 pr-2 text-left font-semibold">
                    P{p.number}
                  </th>
                  {(["start", "end"] as const).map((k) => (
                    <td key={k} className="py-1.5 pr-2">
                      <input
                        type="time"
                        className={INPUT}
                        value={p[k]}
                        aria-label={`Period ${p.number} ${k === "start" ? "start" : "end"} time`}
                        onChange={(e) =>
                          setGrid((g) => ({ ...g, periods: g.periods.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) }))
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div className="space-y-4">
          <Panel title="Teaching days">
            <p className="mb-3 text-sm text-ink-muted">Tick the days classes run, and how many periods each day has (for example a half-day Saturday).</p>
            <ul className="space-y-2">
              {DAY_ORDER.map((id) => {
                const day = grid.days.find((d) => d.id === id);
                return (
                  <li key={id} className="flex items-center gap-3">
                    <label className="flex min-w-32 items-center gap-2 text-sm font-medium text-ink">
                      <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={!!day} onChange={(e) => setDay(id, e.target.checked)} />
                      {DAY_LABELS[id].label}
                    </label>
                    {day && (
                      <label className="flex items-center gap-2 text-sm text-ink-muted">
                        <select
                          className="h-9 rounded-md border border-line bg-white px-2 text-sm text-ink"
                          value={day.periodCount}
                          onChange={(e) =>
                            setGrid((g) => ({ ...g, days: g.days.map((d) => (d.id === id ? { ...d, periodCount: Number(e.target.value) } : d)) }))
                          }
                        >
                          {grid.periods.map((p) => (
                            <option key={p.number} value={p.number}>
                              {p.number}
                            </option>
                          ))}
                        </select>
                        periods
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel
            title="Breaks"
            action={
              <Button
                icon="plus"
                disabled={grid.periods.length < 2}
                onClick={() =>
                  setGrid((g) => ({
                    ...g,
                    breaks: [...g.breaks, { afterPeriod: Math.min(Math.max(1, Math.floor(g.periods.length / 2)), g.periods.length - 1), start: "", end: "", label: "Break" }],
                  }))
                }
              >
                Add break
              </Button>
            }
          >
            <p className="mb-3 text-sm text-ink-muted">No class, including a lab block, ever runs across a break.</p>
            {grid.breaks.length === 0 ? (
              <p className="text-sm text-ink-muted">No breaks.</p>
            ) : (
              <ul className="space-y-2">
                {withBreakTimes(grid).breaks.map((b, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <input
                      className={`${INPUT} max-w-40`}
                      value={b.label}
                      aria-label={`Break ${i + 1} name`}
                      onChange={(e) => setGrid((g) => ({ ...g, breaks: g.breaks.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))}
                    />
                    <label className="flex items-center gap-2 text-sm text-ink-muted">
                      after
                      <select
                        className="h-10 rounded-md border border-line bg-white px-2 text-sm text-ink"
                        value={b.afterPeriod}
                        onChange={(e) =>
                          setGrid((g) => ({ ...g, breaks: g.breaks.map((x, j) => (j === i ? { ...x, afterPeriod: Number(e.target.value) } : x)) }))
                        }
                      >
                        {grid.periods.slice(0, -1).map((p) => (
                          <option key={p.number} value={p.number}>
                            period {p.number}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="text-xs text-ink-muted">
                      {b.start && b.end ? `${formatTime(b.start)} – ${formatTime(b.end)}` : ""}
                    </span>
                    <button
                      type="button"
                      className="grid h-9 w-9 place-items-center rounded-md text-ink-muted hover:bg-red-50 hover:text-danger"
                      aria-label={`Remove ${b.label || "break"}`}
                      onClick={() => setGrid((g) => ({ ...g, breaks: g.breaks.filter((_, j) => j !== i) }))}
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="sticky bottom-16 z-10 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-line bg-white/95 px-4 py-3 backdrop-blur md:bottom-4">
        <p className="mr-auto text-sm text-ink-muted" aria-live="polite">
          {dirty ? "You have unsaved changes." : "All changes saved in this browser."}
        </p>
        <Button
          onClick={() => {
            setCollege(dataset.college);
            setGrid(dataset.grid);
            setSaveError(null);
          }}
          disabled={!dirty}
        >
          Discard changes
        </Button>
        <Button variant="primary" icon="checkCircle" onClick={save} disabled={!dirty || problems.length > 0}>
          Save
        </Button>
      </div>

      <ConfirmDialog
        open={confirmClear}
        danger
        title="Change the week and clear the timetable?"
        confirmLabel="Save and clear timetable"
        onCancel={() => setConfirmClear(false)}
        onConfirm={commit}
      >
        The current timetable was built for the old days, periods and breaks, so it will be cleared. Your rooms, teachers, sections and
        courses are kept; generate a new timetable afterwards.
      </ConfirmDialog>
    </div>
  );
}
