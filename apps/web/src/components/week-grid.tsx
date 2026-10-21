import { Fragment } from "react";

import { formatTime } from "@/lib/timetable/grid";
import type { Lookup } from "@/lib/timetable/lookup";
import type { DayId, ScheduledEntry, TimeGrid } from "@/lib/timetable/types";

import { ClassCard, type Perspective } from "./class-card";
import { SUBJECT_STYLE } from "./subject-style";
import { cx } from "./ui";

/** Weekly grid: period rail on the left, days across (table semantics for screen readers). */
export function WeekGrid({
  grid,
  entries,
  lookup,
  perspective = "teacher",
  onSelect,
  flaggedIds,
  highlightDay,
  caption,
}: {
  grid: TimeGrid;
  entries: ScheduledEntry[];
  lookup: Lookup;
  perspective?: Perspective;
  onSelect?: (entry: ScheduledEntry) => void;
  flaggedIds?: Set<string>;
  highlightDay?: DayId | null;
  caption: string;
}) {
  const maxPeriods = Math.max(...grid.days.map((d) => d.periodCount));
  const periods = grid.periods.filter((p) => p.number <= maxPeriods);

  const startingAt = (day: DayId, period: number) =>
    entries.filter((e) => e.day === day && e.startPeriod === period);
  const coveredByEarlier = (day: DayId, period: number) =>
    entries.some((e) => e.day === day && e.startPeriod < period && e.startPeriod + e.span > period);

  return (
    <div className="relative overflow-x-auto rounded-lg border border-line bg-white">
      <table className="w-full min-w-[820px] table-fixed border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="w-[92px]" />
          {grid.days.map((d) => (
            <col key={d.id} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-line bg-surface">
            <th scope="col" className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Period
            </th>
            {grid.days.map((d) => (
              <th
                key={d.id}
                scope="col"
                className={cx(
                  "px-2 py-2.5 text-left text-sm font-semibold",
                  highlightDay === d.id ? "text-primary" : "text-ink",
                )}
              >
                <span className="hidden xl:inline">{d.label}</span>
                <span className="xl:hidden">{d.short}</span>
                {highlightDay === d.id && (
                  <span className="ml-1.5 rounded-sm bg-primary px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-white">
                    Today
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => {
            const brk = grid.breaks.find((b) => b.afterPeriod === period.number);
            return (
              <Fragment key={period.number}>
                <tr className="border-b border-line-soft">
                  <th scope="row" className="border-r border-line-soft bg-surface px-2 py-2 text-left align-top font-normal">
                    <span className="block text-sm font-semibold text-ink">P{period.number}</span>
                    <span className="block text-[11px] leading-tight text-ink-muted">
                      {formatTime(period.start)}
                      <br />
                      {formatTime(period.end)}
                    </span>
                  </th>
                  {grid.days.map((day) => {
                    if (period.number > day.periodCount) {
                      return (
                        <td key={day.id} className="hatch bg-slate-50 p-1.5 align-middle">
                          <span className="sr-only">No teaching period</span>
                        </td>
                      );
                    }
                    if (coveredByEarlier(day.id, period.number)) return null;
                    const here = startingAt(day.id, period.number);
                    const span = Math.max(1, ...here.map((e) => e.span));
                    return (
                      <td
                        key={day.id}
                        rowSpan={span}
                        className={cx("h-[84px] p-1.5 align-top", highlightDay === day.id && "bg-blue-50/40")}
                      >
                        {here.length === 0 ? (
                          <div className="flex h-full min-h-[72px] items-center justify-center rounded-md border border-dashed border-line-soft text-xs text-slate-400">
                            Free
                          </div>
                        ) : (
                          <div className="flex h-full flex-col gap-1">
                            {here.map((e) => (
                              <ClassCard
                                key={e.id}
                                entry={e}
                                lookup={lookup}
                                grid={grid}
                                perspective={perspective}
                                onSelect={onSelect}
                                flagged={flaggedIds?.has(e.id)}
                                compact={here.length > 1}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
                {brk && (
                  <tr className="border-b border-line-soft">
                    <th scope="row" className="border-r border-line-soft bg-surface px-2 py-1 text-left text-[11px] font-normal text-ink-muted">
                      {formatTime(brk.start)}
                    </th>
                    <td colSpan={grid.days.length} className="hatch px-3 py-1 text-xs font-medium text-ink-muted">
                      {brk.label} · {formatTime(brk.start)} – {formatTime(brk.end)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SubjectLegend({ entries, lookup }: { entries: ScheduledEntry[]; lookup: Lookup }) {
  const subjectIds = [...new Set(entries.map((e) => e.subjectId))];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-muted" aria-label="Subjects">
      {subjectIds.map((id) => {
        const s = lookup.subject(id);
        return (
          <li key={id} className="flex items-center gap-1.5">
            <span className={cx("h-2.5 w-2.5 rounded-sm", s ? SUBJECT_STYLE[s.color].dot : "bg-slate-400")} aria-hidden="true" />
            <span className="font-semibold text-ink">{s?.code}</span> {s?.name}
          </li>
        );
      })}
    </ul>
  );
}
