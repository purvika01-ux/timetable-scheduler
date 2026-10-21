import { entryTimes, formatRange, formatTime, periodLabel, periodTimes } from "@/lib/timetable/grid";
import type { Lookup } from "@/lib/timetable/lookup";
import { dayAgenda } from "@/lib/timetable/queries";
import type { DayId, ScheduledEntry, TimeGrid } from "@/lib/timetable/types";

import { describeEntry } from "./class-card";
import { Icon } from "./icons";
import { SUBJECT_STYLE } from "./subject-style";
import { cx, Stamp } from "./ui";

/** One day in time order: classes, free periods and breaks. Readable on phones. */
export function DayAgenda({
  grid,
  entries,
  lookup,
  day,
  onSelect,
  currentId,
  hideFree,
}: {
  grid: TimeGrid;
  entries: ScheduledEntry[];
  lookup: Lookup;
  day: DayId;
  onSelect?: (entry: ScheduledEntry) => void;
  currentId?: string | null;
  hideFree?: boolean;
}) {
  const items = dayAgenda(grid, entries, day).filter((i) => !(hideFree && i.type === "free"));

  return (
    <ol className="divide-y divide-line-soft">
      {items.map((item) => {
        if (item.type === "break") {
          return (
            <li key={`b${item.startPeriod}`} className="hatch flex items-center gap-3 px-3 py-2 text-xs font-medium text-ink-muted">
              <Icon name="coffee" className="h-4 w-4" />
              {item.slot.label} · {formatTime(item.slot.start)} – {formatTime(item.slot.end)}
            </li>
          );
        }
        if (item.type === "free") {
          const t = periodTimes(grid, item.startPeriod, 1);
          return (
            <li key={`f${item.startPeriod}`} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <TimeColumn label={periodLabel(item.startPeriod, 1)} time={formatTime(t.start)} />
              <span className="flex-1 rounded-md border border-dashed border-line px-3 py-2 text-ink-muted">
                Free period
              </span>
            </li>
          );
        }
        const { entry } = item;
        const subject = lookup.subject(entry.subjectId);
        const style = SUBJECT_STYLE[subject?.color ?? "stone"];
        const t = entryTimes(grid, entry);
        const isCurrent = currentId === entry.id;
        const content = (
          <>
            <span className={cx("absolute inset-y-0 left-0 w-1 rounded-l-md", style.accent)} aria-hidden="true" />
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold tracking-wide">{subject?.code}</span>
              {entry.span > 1 && <Stamp>Lab · {entry.span} periods</Stamp>}
              {isCurrent && <Stamp tone="success">Now</Stamp>}
            </span>
            <span className="mt-0.5 block font-semibold">{subject?.name}</span>
            <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-90">
              <span className="flex items-center gap-1">
                <Icon name="clock" className="h-3.5 w-3.5" />
                {formatRange(t)}
              </span>
              <span className="flex items-center gap-1">
                <Icon name="users" className="h-3.5 w-3.5" />
                {lookup.section(entry.sectionId)?.name}
              </span>
              <span className="flex items-center gap-1">
                <Icon name="pin" className="h-3.5 w-3.5" />
                {lookup.room(entry.roomId)?.name}
              </span>
            </span>
          </>
        );
        const cardClass = cx("relative block w-full rounded-md border py-2.5 pl-4 pr-3 text-left", style.card, isCurrent && "ring-2 ring-success");
        return (
          <li key={entry.id} className="flex items-start gap-3 px-3 py-2.5">
            <TimeColumn label={periodLabel(entry.startPeriod, entry.span)} time={formatTime(t.start)} />
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(entry)}
                className={cx(cardClass, "transition hover:shadow-md")}
                aria-label={`${describeEntry(entry, lookup, grid)}. Open details`}
              >
                {content}
              </button>
            ) : (
              <div className={cardClass}>{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function TimeColumn({ label, time }: { label: string; time: string }) {
  return (
    <span className="w-20 shrink-0 pt-1 text-right">
      <span className="block text-sm font-semibold tabular-nums text-ink">{time}</span>
      <span className="block text-[11px] text-ink-muted">{label.replace("Periods", "P").replace("Period", "P")}</span>
    </span>
  );
}
