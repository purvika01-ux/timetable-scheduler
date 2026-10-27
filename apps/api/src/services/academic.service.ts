import { Types } from "mongoose";

import type { Deps } from "../deps.ts";
import { ApiError } from "../http/errors.ts";
import { DEFAULT_TIME_GRID } from "../timetable/grid.ts";
import { generateTimetable } from "../timetable/scheduler.ts";
import type { Dataset, ScheduledEntry } from "../timetable/types.ts";
import { validateTimetable } from "../timetable/validator.ts";

export function createAcademicService(deps: Deps) {
  const { models } = deps;

  const notFound = (name = "Record") => new ApiError(404, "not_found", `${name} not found.`);

  // 1. Full Dataset
  async function getDataset(collegeId: Types.ObjectId): Promise<Dataset> {
    const [departments, teachers, subjects, sections, rooms, requirements, availabilityDocs, college] =
      await Promise.all([
        models.Department.find({}).sort({ code: 1 }).lean(),
        models.Teacher.find({}).sort({ name: 1 }).lean(),
        models.Subject.find({}).sort({ code: 1 }).lean(),
        models.Section.find({}).sort({ name: 1 }).lean(),
        models.Room.find({}).sort({ name: 1 }).lean(),
        models.Requirement.find({}).lean(),
        models.TeacherAvailability.find({}).lean(),
        models.College.findById(collegeId).lean(),
      ]);

    const availability: Record<string, `${import("../timetable/types.ts").DayId}-${number}`[]> = {};
    for (const a of availabilityDocs) {
      if (a.slots && a.slots.length > 0) {
        availability[a.teacherId] = a.slots as `${import("../timetable/types.ts").DayId}-${number}`[];
      }
    }

    return {
      id: String(collegeId),
      label: college?.name.en ?? "College",
      description: "Academic timetable dataset",
      college: {
        name: college?.name.en ?? "College",
        shortName: college?.shortName ?? college?.code ?? "COL",
        semesterLabel: "Academic Year 2026–27",
      },
      grid: DEFAULT_TIME_GRID,
      departments: departments.map((d) => ({ id: String(d._id), code: d.code, name: d.name })),
      teachers: teachers.map((t) => ({
        id: String(t._id),
        name: t.name,
        designation: t.designation,
        departmentId: t.departmentId,
        employeeId: t.employeeId,
        email: t.email ?? undefined,
        maxPeriodsPerDay: t.maxPeriodsPerDay,
      })),
      subjects: subjects.map((s) => ({
        id: String(s._id),
        code: s.code,
        name: s.name,
        kind: s.kind,
        color: (s.color as import("../timetable/types.ts").SubjectColor) || "blue",
        departmentId: s.departmentId ?? undefined,
      })),
      sections: sections.map((s) => ({
        id: String(s._id),
        name: s.name,
        programme: s.programme,
        semester: s.semester,
        strength: s.strength,
        departmentId: s.departmentId,
      })),
      rooms: rooms.map((r) => ({
        id: String(r._id),
        name: r.name,
        type: r.type,
        capacity: r.capacity,
        building: r.building,
        departmentId: r.departmentId ?? undefined,
      })),
      requirements: requirements.map((req) => ({
        id: String(req._id),
        subjectId: req.subjectId,
        teacherId: req.teacherId,
        sectionId: req.sectionId,
        sessionsPerWeek: req.sessionsPerWeek,
        span: req.span,
        roomType: req.roomType,
      })),
      availability,
    };
  }

  // 2. Departments
  async function listDepartments() {
    const list = await models.Department.find({}).sort({ code: 1 }).lean();
    return list.map((d) => ({ id: String(d._id), code: d.code, name: d.name }));
  }

  async function createDepartment(input: { code: string; name: string }) {
    const code = input.code.trim().toUpperCase();
    if (await models.Department.exists({ code })) {
      throw new ApiError(409, "duplicate", `Department with code ${code} already exists.`);
    }
    const [doc] = await models.Department.create([{ code, name: input.name.trim() }]);
    return { id: String(doc!._id), code: doc!.code, name: doc!.name };
  }

  async function updateDepartment(id: Types.ObjectId, input: { code?: string; name?: string }) {
    const set: Record<string, unknown> = {};
    if (input.code) {
      const code = input.code.trim().toUpperCase();
      const duplicate = await models.Department.findOne({ code, _id: { $ne: id } });
      if (duplicate) throw new ApiError(409, "duplicate", `Department with code ${code} already exists.`);
      set.code = code;
    }
    if (input.name) set.name = input.name.trim();

    const updated = await models.Department.findByIdAndUpdate(id, { $set: set }, { returnDocument: "after" }).lean();
    if (!updated) throw notFound("Department");
    return { id: String(updated._id), code: updated.code, name: updated.name };
  }

  async function deleteDepartment(id: Types.ObjectId) {
    const dept = await models.Department.findById(id).lean();
    if (!dept) throw notFound("Department");
    const idStr = String(id);
    const inUseTeacher = await models.Teacher.exists({
      $or: [{ departmentId: idStr }, { departmentId: dept.code }],
    });
    if (inUseTeacher) throw new ApiError(409, "state_conflict", "Cannot delete department: assigned to active teachers.");
    const inUseSection = await models.Section.exists({
      $or: [{ departmentId: idStr }, { departmentId: dept.code }],
    });
    if (inUseSection) throw new ApiError(409, "state_conflict", "Cannot delete department: assigned to active sections.");

    await models.Department.findByIdAndDelete(id);
  }

  // 3. Teachers
  async function listTeachers() {
    const list = await models.Teacher.find({}).sort({ name: 1 }).lean();
    return list.map((t) => ({
      id: String(t._id),
      name: t.name,
      designation: t.designation,
      departmentId: t.departmentId,
      employeeId: t.employeeId,
      email: t.email ?? undefined,
      maxPeriodsPerDay: t.maxPeriodsPerDay,
    }));
  }

  async function createTeacher(input: {
    name: string;
    designation: string;
    departmentId: string;
    employeeId: string;
    email?: string;
    maxPeriodsPerDay?: number;
  }) {
    const employeeId = input.employeeId.trim().toUpperCase();
    if (await models.Teacher.exists({ employeeId })) {
      throw new ApiError(409, "duplicate", `Teacher with Employee ID ${employeeId} already exists.`);
    }
    const [doc] = await models.Teacher.create([
      {
        name: input.name.trim(),
        designation: input.designation.trim(),
        departmentId: input.departmentId.trim(),
        employeeId,
        email: input.email?.trim() || undefined,
        maxPeriodsPerDay: input.maxPeriodsPerDay ?? 4,
      },
    ]);
    return {
      id: String(doc!._id),
      name: doc!.name,
      designation: doc!.designation,
      departmentId: doc!.departmentId,
      employeeId: doc!.employeeId,
      email: doc!.email ?? undefined,
      maxPeriodsPerDay: doc!.maxPeriodsPerDay,
    };
  }

  async function updateTeacher(
    id: Types.ObjectId,
    input: {
      name?: string;
      designation?: string;
      departmentId?: string;
      employeeId?: string;
      email?: string | null;
      maxPeriodsPerDay?: number;
    },
  ) {
    const set: Record<string, unknown> = {};
    if (input.name) set.name = input.name.trim();
    if (input.designation) set.designation = input.designation.trim();
    if (input.departmentId) set.departmentId = input.departmentId.trim();
    if (input.employeeId) {
      const emp = input.employeeId.trim().toUpperCase();
      const dup = await models.Teacher.findOne({ employeeId: emp, _id: { $ne: id } });
      if (dup) throw new ApiError(409, "duplicate", `Teacher with Employee ID ${emp} already exists.`);
      set.employeeId = emp;
    }
    if (input.email !== undefined) set.email = input.email?.trim() || null;
    if (input.maxPeriodsPerDay) set.maxPeriodsPerDay = input.maxPeriodsPerDay;

    const updated = await models.Teacher.findByIdAndUpdate(id, { $set: set }, { returnDocument: "after" }).lean();
    if (!updated) throw notFound("Teacher");
    return {
      id: String(updated._id),
      name: updated.name,
      designation: updated.designation,
      departmentId: updated.departmentId,
      employeeId: updated.employeeId,
      email: updated.email ?? undefined,
      maxPeriodsPerDay: updated.maxPeriodsPerDay,
    };
  }

  async function deleteTeacher(id: Types.ObjectId) {
    const teacher = await models.Teacher.findById(id).lean();
    if (!teacher) throw notFound("Teacher");
    const idStr = String(id);
    const inUse = await models.Requirement.exists({
      $or: [{ teacherId: idStr }, { teacherId: teacher.employeeId }],
    });
    if (inUse) throw new ApiError(409, "state_conflict", "Cannot delete teacher: assigned to subject course requirements.");
    await models.Teacher.findByIdAndDelete(id);
    await models.TeacherAvailability.deleteOne({ teacherId: idStr });
  }

  // 4. Subjects
  async function listSubjects() {
    const list = await models.Subject.find({}).sort({ code: 1 }).lean();
    return list.map((s) => ({
      id: String(s._id),
      code: s.code,
      name: s.name,
      kind: s.kind,
      color: s.color,
      departmentId: s.departmentId ?? undefined,
    }));
  }

  async function createSubject(input: {
    code: string;
    name: string;
    kind: "theory" | "lab";
    color: string;
    departmentId?: string;
  }) {
    const code = input.code.trim().toUpperCase();
    if (await models.Subject.exists({ code })) {
      throw new ApiError(409, "duplicate", `Subject with code ${code} already exists.`);
    }
    const [doc] = await models.Subject.create([
      {
        code,
        name: input.name.trim(),
        kind: input.kind,
        color: input.color,
        departmentId: input.departmentId?.trim() || undefined,
      },
    ]);
    return {
      id: String(doc!._id),
      code: doc!.code,
      name: doc!.name,
      kind: doc!.kind,
      color: doc!.color,
      departmentId: doc!.departmentId ?? undefined,
    };
  }

  async function updateSubject(
    id: Types.ObjectId,
    input: {
      code?: string;
      name?: string;
      kind?: "theory" | "lab";
      color?: string;
      departmentId?: string | null;
    },
  ) {
    const set: Record<string, unknown> = {};
    if (input.code) {
      const code = input.code.trim().toUpperCase();
      const dup = await models.Subject.findOne({ code, _id: { $ne: id } });
      if (dup) throw new ApiError(409, "duplicate", `Subject with code ${code} already exists.`);
      set.code = code;
    }
    if (input.name) set.name = input.name.trim();
    if (input.kind) set.kind = input.kind;
    if (input.color) set.color = input.color;
    if (input.departmentId !== undefined) set.departmentId = input.departmentId?.trim() || null;

    const updated = await models.Subject.findByIdAndUpdate(id, { $set: set }, { returnDocument: "after" }).lean();
    if (!updated) throw notFound("Subject");
    return {
      id: String(updated._id),
      code: updated.code,
      name: updated.name,
      kind: updated.kind,
      color: updated.color,
      departmentId: updated.departmentId ?? undefined,
    };
  }

  async function deleteSubject(id: Types.ObjectId) {
    const subject = await models.Subject.findById(id).lean();
    if (!subject) throw notFound("Subject");
    const idStr = String(id);
    const inUse = await models.Requirement.exists({
      $or: [{ subjectId: idStr }, { subjectId: subject.code }],
    });
    if (inUse) throw new ApiError(409, "state_conflict", "Cannot delete subject: assigned to course session requirements.");
    await models.Subject.findByIdAndDelete(id);
  }

  // 5. Sections
  async function listSections() {
    const list = await models.Section.find({}).sort({ name: 1 }).lean();
    return list.map((s) => ({
      id: String(s._id),
      name: s.name,
      programme: s.programme,
      semester: s.semester,
      strength: s.strength,
      departmentId: s.departmentId,
    }));
  }

  async function createSection(input: {
    name: string;
    programme: string;
    semester: number;
    strength: number;
    departmentId: string;
  }) {
    const name = input.name.trim();
    if (await models.Section.exists({ name })) {
      throw new ApiError(409, "duplicate", `Section ${name} already exists.`);
    }
    const [doc] = await models.Section.create([
      {
        name,
        programme: input.programme.trim(),
        semester: input.semester,
        strength: input.strength,
        departmentId: input.departmentId.trim(),
      },
    ]);
    return {
      id: String(doc!._id),
      name: doc!.name,
      programme: doc!.programme,
      semester: doc!.semester,
      strength: doc!.strength,
      departmentId: doc!.departmentId,
    };
  }

  async function updateSection(
    id: Types.ObjectId,
    input: {
      name?: string;
      programme?: string;
      semester?: number;
      strength?: number;
      departmentId?: string;
    },
  ) {
    const set: Record<string, unknown> = {};
    if (input.name) {
      const name = input.name.trim();
      const dup = await models.Section.findOne({ name, _id: { $ne: id } });
      if (dup) throw new ApiError(409, "duplicate", `Section ${name} already exists.`);
      set.name = name;
    }
    if (input.programme) set.programme = input.programme.trim();
    if (input.semester) set.semester = input.semester;
    if (input.strength) set.strength = input.strength;
    if (input.departmentId) set.departmentId = input.departmentId.trim();

    const updated = await models.Section.findByIdAndUpdate(id, { $set: set }, { returnDocument: "after" }).lean();
    if (!updated) throw notFound("Section");
    return {
      id: String(updated._id),
      name: updated.name,
      programme: updated.programme,
      semester: updated.semester,
      strength: updated.strength,
      departmentId: updated.departmentId,
    };
  }

  async function deleteSection(id: Types.ObjectId) {
    const section = await models.Section.findById(id).lean();
    if (!section) throw notFound("Section");
    const idStr = String(id);
    const inUse = await models.Requirement.exists({
      $or: [{ sectionId: idStr }, { sectionId: section.name }],
    });
    if (inUse) throw new ApiError(409, "state_conflict", "Cannot delete section: assigned to course session requirements.");
    await models.Section.findByIdAndDelete(id);
  }

  // 6. Rooms
  async function listRooms() {
    const list = await models.Room.find({}).sort({ name: 1 }).lean();
    return list.map((r) => ({
      id: String(r._id),
      name: r.name,
      type: r.type,
      capacity: r.capacity,
      building: r.building,
      departmentId: r.departmentId ?? undefined,
    }));
  }

  async function createRoom(input: {
    name: string;
    type: "lecture" | "lab" | "workshop";
    capacity: number;
    building: string;
    departmentId?: string;
  }) {
    const name = input.name.trim();
    if (await models.Room.exists({ name })) {
      throw new ApiError(409, "duplicate", `Room ${name} already exists.`);
    }
    const [doc] = await models.Room.create([
      {
        name,
        type: input.type,
        capacity: input.capacity,
        building: input.building.trim(),
        departmentId: input.departmentId?.trim() || undefined,
      },
    ]);
    return {
      id: String(doc!._id),
      name: doc!.name,
      type: doc!.type,
      capacity: doc!.capacity,
      building: doc!.building,
      departmentId: doc!.departmentId ?? undefined,
    };
  }

  async function updateRoom(
    id: Types.ObjectId,
    input: {
      name?: string;
      type?: "lecture" | "lab" | "workshop";
      capacity?: number;
      building?: string;
      departmentId?: string | null;
    },
  ) {
    const set: Record<string, unknown> = {};
    if (input.name) {
      const name = input.name.trim();
      const dup = await models.Room.findOne({ name, _id: { $ne: id } });
      if (dup) throw new ApiError(409, "duplicate", `Room ${name} already exists.`);
      set.name = name;
    }
    if (input.type) set.type = input.type;
    if (input.capacity) set.capacity = input.capacity;
    if (input.building) set.building = input.building.trim();
    if (input.departmentId !== undefined) set.departmentId = input.departmentId?.trim() || null;

    const updated = await models.Room.findByIdAndUpdate(id, { $set: set }, { returnDocument: "after" }).lean();
    if (!updated) throw notFound("Room");
    return {
      id: String(updated._id),
      name: updated.name,
      type: updated.type,
      capacity: updated.capacity,
      building: updated.building,
      departmentId: updated.departmentId ?? undefined,
    };
  }

  async function deleteRoom(id: Types.ObjectId) {
    const res = await models.Room.findByIdAndDelete(id);
    if (!res) throw notFound("Room");
  }

  // 7. Requirements (Course Sessions)
  async function listRequirements() {
    const list = await models.Requirement.find({}).lean();
    return list.map((req) => ({
      id: String(req._id),
      subjectId: req.subjectId,
      teacherId: req.teacherId,
      sectionId: req.sectionId,
      sessionsPerWeek: req.sessionsPerWeek,
      span: req.span,
      roomType: req.roomType,
    }));
  }

  async function createRequirement(input: {
    subjectId: string;
    teacherId: string;
    sectionId: string;
    sessionsPerWeek: number;
    span: number;
    roomType: "lecture" | "lab" | "workshop";
  }) {
    const [doc] = await models.Requirement.create([
      {
        subjectId: input.subjectId.trim(),
        teacherId: input.teacherId.trim(),
        sectionId: input.sectionId.trim(),
        sessionsPerWeek: input.sessionsPerWeek,
        span: input.span,
        roomType: input.roomType,
      },
    ]);
    return {
      id: String(doc!._id),
      subjectId: doc!.subjectId,
      teacherId: doc!.teacherId,
      sectionId: doc!.sectionId,
      sessionsPerWeek: doc!.sessionsPerWeek,
      span: doc!.span,
      roomType: doc!.roomType,
    };
  }

  async function updateRequirement(
    id: Types.ObjectId,
    input: {
      subjectId?: string;
      teacherId?: string;
      sectionId?: string;
      sessionsPerWeek?: number;
      span?: number;
      roomType?: "lecture" | "lab" | "workshop";
    },
  ) {
    const set: Record<string, unknown> = {};
    if (input.subjectId) set.subjectId = input.subjectId.trim();
    if (input.teacherId) set.teacherId = input.teacherId.trim();
    if (input.sectionId) set.sectionId = input.sectionId.trim();
    if (input.sessionsPerWeek) set.sessionsPerWeek = input.sessionsPerWeek;
    if (input.span) set.span = input.span;
    if (input.roomType) set.roomType = input.roomType;

    const updated = await models.Requirement.findByIdAndUpdate(id, { $set: set }, { returnDocument: "after" }).lean();
    if (!updated) throw notFound("Course Requirement");
    return {
      id: String(updated._id),
      subjectId: updated.subjectId,
      teacherId: updated.teacherId,
      sectionId: updated.sectionId,
      sessionsPerWeek: updated.sessionsPerWeek,
      span: updated.span,
      roomType: updated.roomType,
    };
  }

  async function deleteRequirement(id: Types.ObjectId) {
    const res = await models.Requirement.findByIdAndDelete(id);
    if (!res) throw notFound("Course Requirement");
  }

  // 8. Teacher Availability
  async function getAvailability() {
    const docs = await models.TeacherAvailability.find({}).lean();
    const map: Record<string, string[]> = {};
    for (const d of docs) {
      if (d.slots && d.slots.length > 0) map[d.teacherId] = d.slots;
    }
    return map;
  }

  async function setTeacherAvailability(teacherId: string, slots: string[]) {
    await models.TeacherAvailability.findOneAndUpdate(
      { teacherId },
      { $set: { slots } },
      { upsert: true, returnDocument: "after" },
    );
    return { teacherId, slots };
  }

  // 9. Demo Data Seeder
  async function seedDemoData(collegeId: Types.ObjectId) {
    const existing = await models.Department.countDocuments({});
    if (existing > 0) {
      return getDataset(collegeId);
    }

    // Departments
    const [dCse, dAs, dHu] = await models.Department.create([
      { code: "CSE", name: "Computer Science and Engineering" },
      { code: "AS", name: "Applied Sciences" },
      { code: "HU", name: "Humanities" },
    ]);

    // Teachers
    const [t1, t2, t3, t4, t5] = await models.Teacher.create([
      { name: "Dr. Amandeep Singh", designation: "Associate Professor", departmentId: String(dCse!._id), employeeId: "SVIT-CSE-014", maxPeriodsPerDay: 4 },
      { name: "Prof. Rajesh Sharma", designation: "Professor", departmentId: String(dCse!._id), employeeId: "SVIT-CSE-002", maxPeriodsPerDay: 4 },
      { name: "Dr. Jaspreet Kaur", designation: "Assistant Professor", departmentId: String(dCse!._id), employeeId: "SVIT-CSE-028", maxPeriodsPerDay: 4 },
      { name: "Prof. Simran Gupta", designation: "Assistant Professor", departmentId: String(dAs!._id), employeeId: "SVIT-AS-009", maxPeriodsPerDay: 4 },
      { name: "Dr. Harpreet Singh", designation: "Associate Professor", departmentId: String(dHu!._id), employeeId: "SVIT-HU-005", maxPeriodsPerDay: 4 },
    ]);

    // Subjects
    const [s1, s2, s3, s4, s5] = await models.Subject.create([
      { code: "CS301", name: "Data Structures", kind: "theory", color: "blue", departmentId: String(dCse!._id) },
      { code: "CS301L", name: "Data Structures Lab", kind: "lab", color: "emerald", departmentId: String(dCse!._id) },
      { code: "CS305", name: "Digital Electronics", kind: "theory", color: "amber", departmentId: String(dCse!._id) },
      { code: "MA301", name: "Discrete Mathematics", kind: "theory", color: "violet", departmentId: String(dAs!._id) },
      { code: "HU301", name: "Professional Communication", kind: "theory", color: "rose", departmentId: String(dHu!._id) },
    ]);

    // Sections
    const [secA, secB] = await models.Section.create([
      { name: "CSE 3A", programme: "B.Tech CSE", semester: 3, strength: 60, departmentId: String(dCse!._id) },
      { name: "CSE 3B", programme: "B.Tech CSE", semester: 3, strength: 60, departmentId: String(dCse!._id) },
    ]);

    // Rooms
    await models.Room.create([
      { name: "Room 101", type: "lecture", capacity: 70, building: "Main Block" },
      { name: "Room 102", type: "lecture", capacity: 70, building: "Main Block" },
      { name: "Lab 2 (Computing)", type: "lab", capacity: 60, building: "IT Wing", departmentId: String(dCse!._id) },
      { name: "Lab 3 (Hardware)", type: "lab", capacity: 40, building: "IT Wing", departmentId: String(dCse!._id) },
    ]);

    // Requirements
    await models.Requirement.create([
      { subjectId: String(s1!._id), teacherId: String(t1!._id), sectionId: String(secA!._id), sessionsPerWeek: 4, span: 1, roomType: "lecture" },
      { subjectId: String(s2!._id), teacherId: String(t1!._id), sectionId: String(secA!._id), sessionsPerWeek: 1, span: 2, roomType: "lab" },
      { subjectId: String(s3!._id), teacherId: String(t2!._id), sectionId: String(secA!._id), sessionsPerWeek: 4, span: 1, roomType: "lecture" },
      { subjectId: String(s4!._id), teacherId: String(t4!._id), sectionId: String(secA!._id), sessionsPerWeek: 4, span: 1, roomType: "lecture" },
      { subjectId: String(s5!._id), teacherId: String(t5!._id), sectionId: String(secA!._id), sessionsPerWeek: 3, span: 1, roomType: "lecture" },

      { subjectId: String(s1!._id), teacherId: String(t3!._id), sectionId: String(secB!._id), sessionsPerWeek: 4, span: 1, roomType: "lecture" },
      { subjectId: String(s2!._id), teacherId: String(t3!._id), sectionId: String(secB!._id), sessionsPerWeek: 1, span: 2, roomType: "lab" },
      { subjectId: String(s3!._id), teacherId: String(t2!._id), sectionId: String(secB!._id), sessionsPerWeek: 4, span: 1, roomType: "lecture" },
      { subjectId: String(s4!._id), teacherId: String(t4!._id), sectionId: String(secB!._id), sessionsPerWeek: 4, span: 1, roomType: "lecture" },
      { subjectId: String(s5!._id), teacherId: String(t5!._id), sectionId: String(secB!._id), sessionsPerWeek: 3, span: 1, roomType: "lecture" },
    ]);

    return getDataset(collegeId);
  }

  // 9. Timetable Operations
  async function getTimetable(collegeId: Types.ObjectId) {
    const doc = await models.Timetable.findOne({ collegeId }).lean();
    if (!doc) return null;
    return {
      source: doc.source,
      seed: doc.seed,
      entries: doc.entries,
      isValid: doc.isValid,
      validationReport: doc.validationReport,
      updatedAt: doc.updatedAt,
    };
  }

  async function saveTimetable(
    collegeId: Types.ObjectId,
    data: { entries: ScheduledEntry[]; source?: "sample" | "generated" | "edited"; seed?: number | null },
  ) {
    const dataset = await getDataset(collegeId);
    const report = validateTimetable(dataset, data.entries, dataset.availability);
    // Rule 1: a timetable that breaks a hard constraint is never stored. Incomplete is allowed (Q4):
    // missing sessions are reported in the validation report.
    if (!report.valid) {
      throw new ApiError(
        422,
        "rule_violation",
        `This timetable breaks ${report.issues.length === 1 ? "1 scheduling rule" : `${report.issues.length} scheduling rules`}, so it was not saved.`,
        undefined,
        report.issues,
      );
    }

    const doc = await models.Timetable.findOneAndUpdate(
      { collegeId },
      {
        collegeId,
        source: data.source ?? "generated",
        seed: data.seed ?? null,
        entries: data.entries,
        isValid: report.valid,
        validationReport: report,
        updatedAt: new Date(),
      },
      { upsert: true, returnDocument: "after" },
    ).lean();

    return {
      source: doc!.source,
      seed: doc!.seed,
      entries: doc!.entries,
      isValid: doc!.isValid,
      validationReport: report,
      updatedAt: doc!.updatedAt,
    };
  }

  async function validateTimetableEntries(collegeId: Types.ObjectId, entries: ScheduledEntry[]) {
    const dataset = await getDataset(collegeId);
    const report = validateTimetable(dataset, entries, dataset.availability);
    return {
      ...report,
      serverValidated: true,
      validatedAt: new Date().toISOString(),
    };
  }

  async function generateCollegeTimetable(
    collegeId: Types.ObjectId,
    options: { seed?: number; maxAttempts?: number; sectionIds?: string[] } = {},
  ) {
    let dataset = await getDataset(collegeId);
    if (options.sectionIds && options.sectionIds.length > 0) {
      const secSet = new Set(options.sectionIds);
      dataset = {
        ...dataset,
        sections: dataset.sections.filter((s) => secSet.has(s.id)),
        requirements: dataset.requirements.filter((r) => secSet.has(r.sectionId)),
      };
    }

    const start = Date.now();
    const result = generateTimetable(dataset, dataset.availability, {
      seed: options.seed ?? 1,
      maxAttempts: options.maxAttempts ?? 8,
    });
    const report = validateTimetable(dataset, result.entries, dataset.availability);
    const durationMs = Date.now() - start;

    return {
      result,
      report: {
        ...report,
        serverValidated: true,
        validatedAt: new Date().toISOString(),
      },
      durationMs,
    };
  }

  async function clearTimetable(collegeId: Types.ObjectId) {
    await models.Timetable.deleteOne({ collegeId });
    return { ok: true };
  }

  return {
    getDataset,
    listDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    listTeachers,
    createTeacher,
    updateTeacher,
    deleteTeacher,
    listSubjects,
    createSubject,
    updateSubject,
    deleteSubject,
    listSections,
    createSection,
    updateSection,
    deleteSection,
    listRooms,
    createRoom,
    updateRoom,
    deleteRoom,
    listRequirements,
    createRequirement,
    updateRequirement,
    deleteRequirement,
    getAvailability,
    setTeacherAvailability,
    seedDemoData,
    getTimetable,
    saveTimetable,
    validateTimetableEntries,
    generateCollegeTimetable,
    clearTimetable,
  };
}

export type AcademicService = ReturnType<typeof createAcademicService>;

