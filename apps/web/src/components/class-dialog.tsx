"use client";

import { useMemo, useState } from "react";

import { entryTimes, formatRange, PERIOD_MINUTES, periodLabel, validStarts } from "@/lib/timetable/grid";
import type { Lookup } from "@/lib/timetable/lookup";
import { checkMove, findValidMoves, type MoveTarget } from "@/lib/timetable/moves";
import type { AvailabilityMap, Dataset, DayId, ScheduledEntry, ValidationIssue } from "@/lib/timetable/types";

import { Icon, type IconName } from "./icons";
import { Modal } from "./modal";
import { SUBJECT_STYLE } from "./subject-style";
import { Banner, Button, cx, Stamp } from "./ui";

export function ClassDialog({
  entry,
  dataset,
  lookup,
  entries,
  availability,
  onClose,
  onMove,
}: {
  entry: ScheduledEntry | null;
  dataset: Dataset;
  lookup: Lookup;
  entries: ScheduledEntry[];
  availability: AvailabilityMap;
  onClose: () => void;
  /** When given, the dialog offers a validated "Move class" form. */
  onMove?: (entries: ScheduledEntry[], message: string) => boolean;
}) {
  return (
    <Modal
      open={entry !== null}
      onClose={onClose}
      wide
      title={entry ? (lookup.subject(entry.subjectId)?.name ?? "Class") : ""}
      description={entry ? <ClassSubtitle entry={entry} lookup={lookup} /> : null}
    >
      {entry && (
        // Keyed so the move form resets for each class.
        <ClassDialogBody
          key={entry.id + entry.day + entry.startPeriod}
          entry={entry}
          dataset={dataset}
          lookup={lookup}
          entries={entries}
          availability={availability}
          onClose={onClose}
          onMove={onMove}
        />
      )}
    </Modal>
  );
}

function ClassSubtitle({ entry, lookup }: { entry: ScheduledEntry; lookup: Lookup }) {
  const subject = lookup.subject(entry.subjectId);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className={cx("h-2.5 w-2.5 rounded-sm", SUBJECT_STYLE[subject?.color ?? "stone"].dot)} aria-hidden="true" />
      <span className="font-semibold text-ink">{subject?.code}</span>
      <Stamp>{subject?.kind === "lab" ? "Lab" : "Theory"}</Stamp>
    </span>
  );
}

function ClassDialogBody({
  entry,
  dataset,
  lookup,
  entries,
  availability,
  onClose,
  onMove,
}: {
  entry: ScheduledEntry;
  dataset: Dataset;
  lookup: Lookup;
  entries: ScheduledEntry[];
  availability: AvailabilityMap;
  onClose: () => void;
  onMove?: (entries: ScheduledEntry[], message: string) => boolean;
}) {
  const grid = dataset.grid;
  const day = grid.days.find((d) => d.id === entry.day);
  const room = lookup.room(entry.roomId);
  const section = lookup.section(entry.sectionId);
  const teacher = lookup.teacher(entry.teacherId);
  const req = lookup.requirement(entry.requirementId);
  const minutes = entry.span * PERIOD_MINUTES;

  const details: { icon: IconName; label: string; value: React.ReactNode }[] = [
    { icon: "calendar", label: "Day", value: day?.label },
    {
      icon: "clock",
      label: "Time",
      value: (
        <>
          {formatRange(entryTimes(grid, entry))}{" "}
          <span className="text-ink-muted">({periodLabel(entry.startPeriod, entry.span)})</span>
        </>
      ),
    },
    { icon: "layers", label: "Duration", value: `${minutes} minutes (${entry.span} ${entry.span > 1 ? "periods" : "period"})` },
    { icon: "users", label: "Section", value: `${section?.name} · ${section?.programme}, semester ${section?.semester} · ${section?.strength} students` },
    { icon: "pin", label: "Room", value: `${room?.name} · ${room?.building} · ${room?.type} room for ${room?.capacity}` },
    { icon: "user", label: "Teacher", value: teacher?.name },
    { icon: "book", label: "Weekly sessions", value: req ? `${req.sessionsPerWeek} per week for this section` : "—" },
  ];

  return (
    <div>
      <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-[auto_1fr]">
        {details.map((d) => (
          <div key={d.label} className="contents">
            <dt className="flex items-center gap-2 text-sm text-ink-muted">
              <Icon name={d.icon} className="h-4 w-4" />
              {d.label}
            </dt>
            <dd className="text-sm font-medium text-ink">{d.value}</dd>
          </div>
        ))}
      </dl>
      {onMove && (
        <MoveForm
          entry={entry}
          dataset={dataset}
          lookup={lookup}
          entries={entries}
          availability={availability}
          onClose={onClose}
          onMove={onMove}
        />
      )}
    </div>
  );
}

function MoveForm({
  entry,
  dataset,
  lookup,
  entries,
  availability,
  onClose,
  onMove,
}: {
  entry: ScheduledEntry;
  dataset: Dataset;
  lookup: Lookup;
  entries: ScheduledEntry[];
  availability: AvailabilityMap;
  onClose: () => void;
  onMove: (entries: ScheduledEntry[], message: string) => boolean;
}) {
  const grid = dataset.grid;
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState<DayId>(entry.day);
  const [start, setStart] = useState(entry.startPeriod);
  const [roomId, setRoomId] = useState(entry.roomId);
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);

  const req = lookup.requirement(entry.requirementId);
  const rooms = dataset.rooms.filter((r) => r.type === (req?.roomType ?? "lecture"));
  const starts = validStarts(grid, day, entry.span);
  const suggestions = useMemo(
    () => (open ? findValidMoves(dataset, entries, availability, entry) : []),
    [open, dataset, entries, availability, entry],
  );

  const pick = (t: MoveTarget) => {
    setDay(t.day);
    setStart(t.startPeriod);
    setRoomId(t.roomId);
    setIssues(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (day === entry.day && start === entry.startPeriod && roomId === entry.roomId) {
      setIssues([{ kind: "grid", entryIds: [entry.id], message: "Choose a different day, period or room first." }]);
      return;
    }
    const result = checkMove(dataset, entries, availability, entry.id, { day, startPeriod: start, roomId });
    if (result.issues.length > 0) {
      setIssues(result.issues);
      return;
    }
    const dayLabel = grid.days.find((d) => d.id === day)?.label;
    const message = `${lookup.subject(entry.subjectId)?.code} moved to ${dayLabel}, ${periodLabel(start, entry.span).toLowerCase()}, ${lookup.room(roomId)?.name}. Whole timetable revalidated: no clashes.`;
    if (onMove(result.entries, message)) onClose();
    else setIssues([{ kind: "reference", entryIds: [entry.id], message: "This browser blocked saving. Your timetable was not changed." }]);
  };

  if (!open) {
    return (
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-sm text-ink-muted">Need a different slot? Moves are checked against the whole timetable.</p>
        <Button icon="move" onClick={() => setOpen(true)}>
          Move class
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-5 border-t border-line pt-4" noValidate>
      <h3 className="text-sm font-semibold text-ink">Move this class</h3>
      <p className="mt-0.5 text-xs text-ink-muted">
        The move is saved only if the whole timetable stays free of teacher, room and section clashes.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink">Day</span>
          <select
            value={day}
            onChange={(e) => {
              const next = e.target.value as DayId;
              setDay(next);
              const valid = validStarts(grid, next, entry.span);
              if (!valid.includes(start)) setStart(valid[0] ?? 1);
              setIssues(null);
            }}
            className="h-10 w-full rounded-md border border-line bg-white px-2"
          >
            {grid.days.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink">Start</span>
          <select
            value={start}
            onChange={(e) => {
              setStart(Number(e.target.value));
              setIssues(null);
            }}
            className="h-10 w-full rounded-md border border-line bg-white px-2"
          >
            {starts.map((p) => (
              <option key={p} value={p}>
                {periodLabel(p, entry.span)} · {formatRange(entryTimes(grid, { startPeriod: p, span: entry.span }))}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink">Room</span>
          <select
            value={roomId}
            onChange={(e) => {
              setRoomId(e.target.value);
              setIssues(null);
            }}
            className="h-10 w-full rounded-md border border-line bg-white px-2"
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.capacity} seats)
              </option>
            ))}
          </select>
        </label>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-ink-muted">
            {suggestions.length} clash-free {suggestions.length === 1 ? "option" : "options"} (click to fill the form):
          </p>
          <ul className="mt-1.5 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
            {suggestions.map((t) => (
              <li key={`${t.day}-${t.startPeriod}`}>
                <button
                  type="button"
                  onClick={() => pick(t)}
                  className="flex items-center gap-1 rounded border border-green-300 bg-green-50 px-2 py-1 text-xs font-medium text-green-900 hover:bg-green-100"
                >
                  <Icon name="check" className="h-3 w-3" />
                  {grid.days.find((d) => d.id === t.day)?.short} P{t.startPeriod} · {lookup.room(t.roomId)?.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {open && suggestions.length === 0 && (
        <p className="mt-3 text-xs text-ink-muted">No clash-free slot exists for this class right now.</p>
      )}

      {issues && issues.length > 0 && (
        <div className="mt-3">
          <Banner tone="error" title="Move not saved: it would create a problem">
            <ul className="list-disc space-y-0.5 pl-4">
              {issues.map((i, n) => (
                <li key={n}>{i.message}</li>
              ))}
            </ul>
          </Banner>
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" variant="primary" icon="checkCircle">
          Check and move
        </Button>
      </div>
    </form>
  );
}
