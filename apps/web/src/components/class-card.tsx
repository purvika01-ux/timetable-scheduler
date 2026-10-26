import { entryTimes, formatRange } from "@/lib/timetable/grid";
import type { Lookup } from "@/lib/timetable/lookup";
import type { ScheduledEntry, TimeGrid } from "@/lib/timetable/types";

import { Icon } from "./icons";
import { SUBJECT_STYLE } from "./subject-style";
import { cx } from "./ui";

export type Perspective = "teacher" | "section" | "room" | "department";

/** Accessible description, e.g. "Data Structures, CSE 3A, Room 101, Monday 9:50 AM – 10:40 AM". */
export function describeEntry(entry: ScheduledEntry, lookup: Lookup, grid: TimeGrid): string {
  const day = grid.days.find((d) => d.id === entry.day)?.label ?? entry.day;
  return [
    lookup.subject(entry.subjectId)?.name,
    lookup.section(entry.sectionId)?.name,
    lookup.room(entry.roomId)?.name,
    lookup.teacher(entry.teacherId)?.name,
    `${day} ${formatRange(entryTimes(grid, entry))}`,
  ]
    .filter(Boolean)
    .join(", ");
}

export function ClassCard({
  entry,
  lookup,
  grid,
  perspective = "teacher",
  onSelect,
  flagged,
  compact,
}: {
  entry: ScheduledEntry;
  lookup: Lookup;
  grid: TimeGrid;
  perspective?: Perspective;
  onSelect?: (entry: ScheduledEntry) => void;
  flagged?: boolean;
  compact?: boolean;
}) {
  const subject = lookup.subject(entry.subjectId);
  const style = SUBJECT_STYLE[subject?.color ?? "stone"];
  const section = lookup.section(entry.sectionId)?.name;
  const room = lookup.room(entry.roomId)?.name;
  const teacher = lookup.teacher(entry.teacherId)?.name;
  const lines =
    perspective === "teacher"
      ? [
          { icon: "users" as const, text: section },
          { icon: "pin" as const, text: room },
        ]
      : perspective === "section"
        ? [
            { icon: "user" as const, text: teacher },
            { icon: "pin" as const, text: room },
          ]
        : perspective === "department"
          ? [
              { icon: "users" as const, text: section },
              { icon: "pin" as const, text: room },
            ]
          : [
              { icon: "users" as const, text: section },
              { icon: "user" as const, text: teacher },
            ];

  const body = (
    <>
      <span className={cx("absolute inset-y-0 left-0 w-1 rounded-l-md", style.accent)} aria-hidden="true" />
      <span className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-bold tracking-wide">{subject?.code}</span>
        {entry.span > 1 && (
          <span className="rounded-sm border border-current/30 px-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">
            Lab · {entry.span}p
          </span>
        )}
        {flagged && <Icon name="alert" className="h-3.5 w-3.5 text-danger" />}
      </span>
      <span className={cx("block font-semibold leading-snug", compact ? "line-clamp-1 text-xs" : "line-clamp-2 text-[13px]")}>
        {subject?.name}
      </span>
      {!compact && (
        <span className="mt-1 block space-y-0.5 text-[11px] opacity-85">
          {lines.map((l) => (
            <span key={l.icon} className="flex items-center gap-1 truncate">
              <Icon name={l.icon} className="h-3 w-3 shrink-0" />
              <span className="truncate">{l.text}</span>
            </span>
          ))}
        </span>
      )}
    </>
  );

  const className = cx(
    "relative block h-full w-full overflow-hidden rounded-md border py-1.5 pl-3 pr-2 text-left",
    style.card,
    flagged && "ring-2 ring-danger",
  );

  if (!onSelect) {
    return (
      <div className={className} title={describeEntry(entry, lookup, grid)}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className={cx(className, "transition hover:-translate-y-px hover:shadow-md")}
      aria-label={`${describeEntry(entry, lookup, grid)}. Open details`}
      title={describeEntry(entry, lookup, grid)}
    >
      {body}
    </button>
  );
}
