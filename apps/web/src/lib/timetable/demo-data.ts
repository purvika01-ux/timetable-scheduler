// Invented sample data. No real people, colleges, or contact details.
// Edit `TIME_GRID` to change days, periods, times, or breaks.

import type {
  AvailabilityMap,
  College,
  Dataset,
  Room,
  Section,
  SessionRequirement,
  Subject,
  Teacher,
  TimeGrid,
} from "./types.ts";

export const DEMO_TEACHER_ID = "t-amandeep";

export const COLLEGE: College = {
  name: "Sutlej Valley Institute of Technology",
  shortName: "SVIT",
  semesterLabel: "Odd semester 2026–27",
};

export const TIME_GRID: TimeGrid = {
  days: [
    { id: "mon", label: "Monday", short: "Mon", periodCount: 8 },
    { id: "tue", label: "Tuesday", short: "Tue", periodCount: 8 },
    { id: "wed", label: "Wednesday", short: "Wed", periodCount: 8 },
    { id: "thu", label: "Thursday", short: "Thu", periodCount: 8 },
    { id: "fri", label: "Friday", short: "Fri", periodCount: 8 },
    { id: "sat", label: "Saturday", short: "Sat", periodCount: 4 },
  ],
  periods: [
    { number: 1, start: "09:00", end: "09:50" },
    { number: 2, start: "09:50", end: "10:40" },
    { number: 3, start: "10:40", end: "11:30" },
    { number: 4, start: "11:30", end: "12:20" },
    { number: 5, start: "13:00", end: "13:50" },
    { number: 6, start: "13:50", end: "14:40" },
    { number: 7, start: "14:40", end: "15:30" },
    { number: 8, start: "15:30", end: "16:20" },
  ],
  breaks: [{ afterPeriod: 4, start: "12:20", end: "13:00", label: "Lunch break" }],
};

export const TEACHERS: Teacher[] = [
  {
    id: DEMO_TEACHER_ID,
    name: "Dr. Amandeep Singh",
    designation: "Associate Professor",
    department: "Computer Science and Engineering",
    employeeId: "SVIT-CSE-014",
    email: "amandeep.singh@svit.example.edu",
    maxPeriodsPerDay: 5,
  },
  {
    id: "t-harpreet",
    name: "Prof. Harpreet Kaur",
    designation: "Professor",
    department: "Computer Science and Engineering",
    employeeId: "SVIT-CSE-003",
    email: "harpreet.kaur@svit.example.edu",
    maxPeriodsPerDay: 5,
  },
  {
    id: "t-rajesh",
    name: "Dr. Rajesh Sharma",
    designation: "Associate Professor",
    department: "Computer Science and Engineering",
    employeeId: "SVIT-CSE-009",
    email: "rajesh.sharma@svit.example.edu",
    maxPeriodsPerDay: 5,
  },
  {
    id: "t-simran",
    name: "Ms. Simran Gill",
    designation: "Assistant Professor",
    department: "Computer Science and Engineering",
    employeeId: "SVIT-CSE-021",
    email: "simran.gill@svit.example.edu",
    maxPeriodsPerDay: 5,
  },
  {
    id: "t-gurpreet",
    name: "Mr. Gurpreet Sandhu",
    designation: "Assistant Professor",
    department: "Computer Science and Engineering",
    employeeId: "SVIT-CSE-025",
    email: "gurpreet.sandhu@svit.example.edu",
    maxPeriodsPerDay: 5,
  },
  {
    id: "t-jaspreet",
    name: "Ms. Jaspreet Brar",
    designation: "Assistant Professor",
    department: "Computer Science and Engineering",
    employeeId: "SVIT-CSE-027",
    email: "jaspreet.brar@svit.example.edu",
    maxPeriodsPerDay: 5,
  },
  {
    id: "t-neha",
    name: "Dr. Neha Bansal",
    designation: "Associate Professor",
    department: "Applied Sciences (Mathematics)",
    employeeId: "SVIT-AS-006",
    email: "neha.bansal@svit.example.edu",
    maxPeriodsPerDay: 5,
  },
  {
    id: "t-manjit",
    name: "Prof. Manjit Dhillon",
    designation: "Visiting Faculty",
    department: "Humanities",
    employeeId: "SVIT-HU-V02",
    email: "manjit.dhillon@svit.example.edu",
    maxPeriodsPerDay: 4,
  },
];

export const ROOMS: Room[] = [
  { id: "r-101", name: "Room 101", type: "lecture", capacity: 72, building: "Block A" },
  { id: "r-102", name: "Room 102", type: "lecture", capacity: 66, building: "Block A" },
  { id: "r-204", name: "Room 204", type: "lecture", capacity: 60, building: "Block B" },
  { id: "r-205", name: "Room 205", type: "lecture", capacity: 50, building: "Block B" },
  { id: "r-lab1", name: "Programming Lab 1", type: "lab", capacity: 64, building: "CSE Block" },
  { id: "r-lab2", name: "Networks Lab", type: "lab", capacity: 60, building: "CSE Block" },
];

export const SUBJECTS: Subject[] = [
  { id: "sub-ds", code: "CS301", name: "Data Structures", kind: "theory", color: "blue" },
  { id: "sub-dsl", code: "CS351", name: "Data Structures Lab", kind: "lab", color: "indigo" },
  { id: "sub-oop", code: "CS303", name: "Object Oriented Programming", kind: "theory", color: "emerald" },
  { id: "sub-javal", code: "CS353", name: "Java Programming Lab", kind: "lab", color: "teal" },
  { id: "sub-dm", code: "MA301", name: "Discrete Mathematics", kind: "theory", color: "amber" },
  { id: "sub-de", code: "CS305", name: "Digital Electronics", kind: "theory", color: "orange" },
  { id: "sub-ca", code: "CS307", name: "Computer Architecture", kind: "theory", color: "stone" },
  { id: "sub-pc", code: "HU301", name: "Professional Communication", kind: "theory", color: "rose" },
  { id: "sub-daa", code: "CS501", name: "Design and Analysis of Algorithms", kind: "theory", color: "violet" },
  { id: "sub-dbms", code: "CS503", name: "Database Management Systems", kind: "theory", color: "cyan" },
  { id: "sub-dbmsl", code: "CS553", name: "DBMS Lab", kind: "lab", color: "teal" },
  { id: "sub-os", code: "CS505", name: "Operating Systems", kind: "theory", color: "lime" },
  { id: "sub-cn", code: "CS507", name: "Computer Networks", kind: "theory", color: "fuchsia" },
  { id: "sub-cnl", code: "CS557", name: "Computer Networks Lab", kind: "lab", color: "indigo" },
  { id: "sub-se", code: "CS509", name: "Software Engineering", kind: "theory", color: "rose" },
];

export const SECTIONS: Section[] = [
  { id: "s-3a", name: "CSE 3A", programme: "B.Tech CSE", semester: 3, strength: 62 },
  { id: "s-3b", name: "CSE 3B", programme: "B.Tech CSE", semester: 3, strength: 58 },
  { id: "s-5a", name: "CSE 5A", programme: "B.Tech CSE", semester: 5, strength: 55 },
  { id: "s-5b", name: "CSE 5B", programme: "B.Tech CSE", semester: 5, strength: 48 },
];

function theory(id: string, subjectId: string, teacherId: string, sectionId: string, perWeek: number) {
  return { id, subjectId, teacherId, sectionId, sessionsPerWeek: perWeek, span: 1, roomType: "lecture" } as const;
}

function lab(id: string, subjectId: string, teacherId: string, sectionId: string, roomType: "lab" | "workshop" = "lab") {
  return { id, subjectId, teacherId, sectionId, sessionsPerWeek: 1, span: 2, roomType } as const;
}

export const REQUIREMENTS: SessionRequirement[] = [
  // Semester 3
  theory("q-ds-3a", "sub-ds", DEMO_TEACHER_ID, "s-3a", 3),
  theory("q-ds-3b", "sub-ds", DEMO_TEACHER_ID, "s-3b", 3),
  lab("q-dsl-3a", "sub-dsl", DEMO_TEACHER_ID, "s-3a"),
  lab("q-dsl-3b", "sub-dsl", DEMO_TEACHER_ID, "s-3b"),
  theory("q-oop-3a", "sub-oop", "t-simran", "s-3a", 3),
  theory("q-oop-3b", "sub-oop", "t-simran", "s-3b", 3),
  lab("q-javal-3a", "sub-javal", "t-simran", "s-3a"),
  lab("q-javal-3b", "sub-javal", "t-simran", "s-3b"),
  theory("q-dm-3a", "sub-dm", "t-neha", "s-3a", 4),
  theory("q-dm-3b", "sub-dm", "t-neha", "s-3b", 4),
  theory("q-de-3a", "sub-de", "t-jaspreet", "s-3a", 3),
  theory("q-de-3b", "sub-de", "t-jaspreet", "s-3b", 3),
  theory("q-ca-3a", "sub-ca", "t-rajesh", "s-3a", 3),
  theory("q-ca-3b", "sub-ca", "t-rajesh", "s-3b", 3),
  theory("q-pc-3a", "sub-pc", "t-manjit", "s-3a", 2),
  theory("q-pc-3b", "sub-pc", "t-manjit", "s-3b", 2),
  // Semester 5
  theory("q-daa-5a", "sub-daa", DEMO_TEACHER_ID, "s-5a", 3),
  theory("q-daa-5b", "sub-daa", "t-gurpreet", "s-5b", 3),
  theory("q-dbms-5a", "sub-dbms", "t-harpreet", "s-5a", 3),
  theory("q-dbms-5b", "sub-dbms", "t-harpreet", "s-5b", 3),
  lab("q-dbmsl-5a", "sub-dbmsl", "t-harpreet", "s-5a"),
  lab("q-dbmsl-5b", "sub-dbmsl", "t-harpreet", "s-5b"),
  theory("q-os-5a", "sub-os", "t-rajesh", "s-5a", 3),
  theory("q-os-5b", "sub-os", "t-rajesh", "s-5b", 3),
  theory("q-cn-5a", "sub-cn", "t-gurpreet", "s-5a", 3),
  theory("q-cn-5b", "sub-cn", "t-gurpreet", "s-5b", 3),
  lab("q-cnl-5a", "sub-cnl", "t-gurpreet", "s-5a"),
  lab("q-cnl-5b", "sub-cnl", "t-gurpreet", "s-5b"),
  theory("q-se-5a", "sub-se", "t-jaspreet", "s-5a", 3),
  theory("q-se-5b", "sub-se", "t-jaspreet", "s-5b", 3),
];

/** Seeded unavailability for the other (non-editable) sample teachers. */
export const OTHER_TEACHER_AVAILABILITY: AvailabilityMap = {
  "t-neha": ["mon-1", "mon-2", "sat-1", "sat-2", "sat-3", "sat-4"],
  "t-manjit": [
    "mon-1", "mon-2", "mon-3", "mon-4", "mon-5", "mon-6", "mon-7", "mon-8",
    "fri-1", "fri-2", "fri-3", "fri-4", "fri-5", "fri-6", "fri-7", "fri-8",
    "sat-1", "sat-2", "sat-3", "sat-4",
  ],
  "t-harpreet": ["wed-7", "wed-8"],
};

/** Default availability for the demo teacher before they save their own. */
export const DEFAULT_DEMO_TEACHER_UNAVAILABLE: AvailabilityMap[string] = ["wed-8", "sat-3", "sat-4"];

export const STANDARD_DATASET: Dataset = {
  id: "standard",
  label: "Standard semester",
  description: "4 sections, 8 teachers, 6 rooms, 30 course requirements. Everything should fit.",
  college: COLLEGE,
  grid: TIME_GRID,
  teachers: TEACHERS,
  rooms: ROOMS,
  subjects: SUBJECTS,
  sections: SECTIONS,
  requirements: REQUIREMENTS,
};

// Over-constrained variant: shows how sessions that cannot be placed are reported.
const EXTRA_TEACHER: Teacher = {
  id: "t-kuldeep",
  name: "Prof. Kuldeep Arora",
  designation: "Visiting Faculty",
  department: "Computer Science and Engineering",
  employeeId: "SVIT-CSE-V05",
  email: "kuldeep.arora@svit.example.edu",
  maxPeriodsPerDay: 2,
};

const EXTRA_SECTION: Section = {
  id: "s-7a",
  name: "CSE 7A (merged)",
  programme: "B.Tech CSE",
  semester: 7,
  strength: 85,
};

const EXTRA_SUBJECTS: Subject[] = [
  { id: "sub-cc", code: "CS701", name: "Cloud Computing", kind: "theory", color: "cyan" },
  { id: "sub-cd", code: "CS703", name: "Compiler Design", kind: "theory", color: "violet" },
  { id: "sub-iot", code: "CS751", name: "IoT Workshop", kind: "lab", color: "orange" },
];

export const OVER_CONSTRAINED_DATASET: Dataset = {
  ...STANDARD_DATASET,
  id: "over-constrained",
  label: "Over-constrained (stress test)",
  description:
    "Adds a visiting teacher free only on Saturday morning, an 85-student section, and a lab that needs a workshop room the college does not have.",
  teachers: [...TEACHERS, EXTRA_TEACHER],
  sections: [...SECTIONS, EXTRA_SECTION],
  subjects: [...SUBJECTS, ...EXTRA_SUBJECTS],
  requirements: [
    ...REQUIREMENTS,
    theory("q-cc-5a", "sub-cc", "t-kuldeep", "s-5a", 3),
    theory("q-cd-7a", "sub-cd", "t-rajesh", "s-7a", 2),
    lab("q-iot-5b", "sub-iot", "t-gurpreet", "s-5b", "workshop"),
  ],
};

export const OVER_CONSTRAINED_EXTRA_AVAILABILITY: AvailabilityMap = {
  "t-kuldeep": [
    ...(["mon", "tue", "wed", "thu", "fri"] as const).flatMap((d) =>
      [1, 2, 3, 4, 5, 6, 7, 8].map((p) => `${d}-${p}` as const),
    ),
    "sat-3",
    "sat-4",
  ],
};

export const DATASETS: Dataset[] = [STANDARD_DATASET, OVER_CONSTRAINED_DATASET];
