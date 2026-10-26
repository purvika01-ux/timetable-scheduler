// Domain types for the frontend-only prototype. Kept free of React and browser APIs so the
// scheduler and validator can run in Node tests.

export type DayId = "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

/** "mon-3" means Monday, period 3. */
export type SlotKey = `${DayId}-${number}`;

export interface DayConfig {
  id: DayId;
  label: string;
  short: string;
  /** Periods 1..periodCount are teaching periods on this day (Saturday is a half day). */
  periodCount: number;
}

export interface Period {
  number: number;
  /** 24-hour local time, "09:00". */
  start: string;
  end: string;
}

export interface BreakSlot {
  /** The break sits between `afterPeriod` and `afterPeriod + 1`. No class may span it. */
  afterPeriod: number;
  start: string;
  end: string;
  label: string;
}

export interface TimeGrid {
  days: DayConfig[];
  periods: Period[];
  breaks: BreakSlot[];
}

export type RoomType = "lecture" | "lab" | "workshop";

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  capacity: number;
  building: string;
}

export interface Teacher {
  id: string;
  name: string;
  designation: string;
  department: string;
  employeeId: string;
  email: string;
  maxPeriodsPerDay: number;
}

export type SubjectKind = "theory" | "lab";

export type SubjectColor =
  | "blue"
  | "emerald"
  | "amber"
  | "rose"
  | "violet"
  | "cyan"
  | "lime"
  | "orange"
  | "fuchsia"
  | "teal"
  | "indigo"
  | "stone";

export interface Subject {
  id: string;
  code: string;
  name: string;
  kind: SubjectKind;
  color: SubjectColor;
}

export interface Section {
  id: string;
  name: string;
  programme: string;
  semester: number;
  strength: number;
}

/** "Section X needs N sessions of subject Y per week, taught by teacher Z." */
export interface SessionRequirement {
  id: string;
  subjectId: string;
  teacherId: string;
  sectionId: string;
  sessionsPerWeek: number;
  /** Consecutive periods per session (labs use 2). */
  span: number;
  roomType: RoomType;
}

export interface ScheduledEntry {
  id: string;
  requirementId: string;
  subjectId: string;
  teacherId: string;
  sectionId: string;
  roomId: string;
  day: DayId;
  startPeriod: number;
  span: number;
}

/** Unavailable slots per teacher id. Anything not listed is available. */
export type AvailabilityMap = Record<string, SlotKey[]>;

export interface College {
  name: string;
  shortName: string;
  semesterLabel: string;
}

export interface Dataset {
  id: string;
  label: string;
  description: string;
  college: College;
  grid: TimeGrid;
  teachers: Teacher[];
  rooms: Room[];
  subjects: Subject[];
  sections: Section[];
  requirements: SessionRequirement[];
}

export interface UnplacedSession {
  requirementId: string;
  /** 1-based: which of the requirement's weekly sessions could not be placed. */
  occurrence: number;
  subjectId: string;
  teacherId: string;
  sectionId: string;
  span: number;
  reasons: string[];
}

export interface GenerationResult {
  entries: ScheduledEntry[];
  unplaced: UnplacedSession[];
  seed: number;
  totalSessions: number;
  attempts: number;
}

export type IssueKind =
  | "teacher"
  | "room"
  | "section"
  | "availability"
  | "capacity"
  | "roomType"
  | "grid"
  | "dailyLimit"
  | "requirement"
  | "duplicate"
  | "reference";

export interface ValidationIssue {
  kind: IssueKind;
  message: string;
  entryIds: string[];
}

/** A requirement with fewer scheduled sessions than it needs each week. */
export interface MissingSessions {
  requirementId: string;
  missing: number;
}

export interface ValidationReport {
  /** True when no entry breaks a rule (no clashes, no misplaced classes). Says nothing about completeness. */
  valid: boolean;
  /** True when every requirement has all of its weekly sessions. */
  complete: boolean;
  counts: Record<IssueKind, number>;
  issues: ValidationIssue[];
  missing: MissingSessions[];
}
