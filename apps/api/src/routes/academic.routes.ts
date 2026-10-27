import { Types } from "mongoose";
import { z } from "zod";

import { memberOf } from "../auth/context.ts";
import { can } from "../auth/permissions.ts";
import { sendData } from "../http/response.ts";
import { valid } from "../middleware/validate.ts";
import { withoutPersonalData, type AcademicService } from "../services/academic.service.ts";
import { collegeParams, objectId, withCollege } from "./schemas.ts";
import type { ModuleSpec } from "./secure-router.ts";

const collegeOnly = { params: collegeParams };
const entityParams = { params: withCollege({ id: objectId }) };

// Departments
const createDepartmentSchema = {
  params: collegeParams,
  body: z.strictObject({
    code: z.string().trim().min(1).max(20),
    name: z.string().trim().min(1).max(100),
  }),
};
const updateDepartmentSchema = {
  params: withCollege({ id: objectId }),
  body: z.strictObject({
    code: z.string().trim().min(1).max(20).optional(),
    name: z.string().trim().min(1).max(100).optional(),
  }),
};

// Teachers
const createTeacherSchema = {
  params: collegeParams,
  body: z.strictObject({
    name: z.string().trim().min(1).max(100),
    designation: z.string().trim().min(1).max(100),
    departmentId: z.string().trim().min(1).max(50),
    employeeId: z.string().trim().min(1).max(50),
    email: z.string().email().optional().or(z.literal("")),
    maxPeriodsPerDay: z.number().int().min(1).max(12).optional(),
  }),
};
const updateTeacherSchema = {
  params: withCollege({ id: objectId }),
  body: z.strictObject({
    name: z.string().trim().min(1).max(100).optional(),
    designation: z.string().trim().min(1).max(100).optional(),
    departmentId: z.string().trim().min(1).max(50).optional(),
    employeeId: z.string().trim().min(1).max(50).optional(),
    email: z.string().email().optional().or(z.literal("")).nullable(),
    maxPeriodsPerDay: z.number().int().min(1).max(12).optional(),
  }),
};

// Subjects
const createSubjectSchema = {
  params: collegeParams,
  body: z.strictObject({
    code: z.string().trim().min(1).max(30),
    name: z.string().trim().min(1).max(100),
    kind: z.enum(["theory", "lab"]),
    color: z.string().trim().min(1).max(30).default("slate"),
    departmentId: z.string().trim().min(1).max(50).optional(),
  }),
};
const updateSubjectSchema = {
  params: withCollege({ id: objectId }),
  body: z.strictObject({
    code: z.string().trim().min(1).max(30).optional(),
    name: z.string().trim().min(1).max(100).optional(),
    kind: z.enum(["theory", "lab"]).optional(),
    color: z.string().trim().min(1).max(30).optional(),
    departmentId: z.string().trim().min(1).max(50).optional().nullable(),
  }),
};

// Sections
const createSectionSchema = {
  params: collegeParams,
  body: z.strictObject({
    name: z.string().trim().min(1).max(50),
    programme: z.string().trim().min(1).max(50),
    semester: z.number().int().min(1).max(12),
    strength: z.number().int().min(1).max(500),
    departmentId: z.string().trim().min(1).max(50),
  }),
};
const updateSectionSchema = {
  params: withCollege({ id: objectId }),
  body: z.strictObject({
    name: z.string().trim().min(1).max(50).optional(),
    programme: z.string().trim().min(1).max(50).optional(),
    semester: z.number().int().min(1).max(12).optional(),
    strength: z.number().int().min(1).max(500).optional(),
    departmentId: z.string().trim().min(1).max(50).optional(),
  }),
};

// Rooms
const createRoomSchema = {
  params: collegeParams,
  body: z.strictObject({
    name: z.string().trim().min(1).max(50),
    type: z.enum(["lecture", "lab", "workshop"]),
    capacity: z.number().int().min(1).max(500),
    building: z.string().trim().min(1).max(100),
    departmentId: z.string().trim().min(1).max(50).optional(),
  }),
};
const updateRoomSchema = {
  params: withCollege({ id: objectId }),
  body: z.strictObject({
    name: z.string().trim().min(1).max(50).optional(),
    type: z.enum(["lecture", "lab", "workshop"]).optional(),
    capacity: z.number().int().min(1).max(500).optional(),
    building: z.string().trim().min(1).max(100).optional(),
    departmentId: z.string().trim().min(1).max(50).optional().nullable(),
  }),
};

// Requirements
const createRequirementSchema = {
  params: collegeParams,
  body: z.strictObject({
    subjectId: z.string().trim().min(1).max(50),
    teacherId: z.string().trim().min(1).max(50),
    sectionId: z.string().trim().min(1).max(50),
    sessionsPerWeek: z.number().int().min(1).max(30),
    span: z.number().int().min(1).max(4).default(1),
    roomType: z.enum(["lecture", "lab", "workshop"]).default("lecture"),
  }),
};
const updateRequirementSchema = {
  params: withCollege({ id: objectId }),
  body: z.strictObject({
    subjectId: z.string().trim().min(1).max(50).optional(),
    teacherId: z.string().trim().min(1).max(50).optional(),
    sectionId: z.string().trim().min(1).max(50).optional(),
    sessionsPerWeek: z.number().int().min(1).max(30).optional(),
    span: z.number().int().min(1).max(4).optional(),
    roomType: z.enum(["lecture", "lab", "workshop"]).optional(),
  }),
};

// Availability
const setAvailabilitySchema = {
  params: withCollege({ teacherId: z.string().trim().min(1).max(50) }),
  body: z.strictObject({
    slots: z.array(z.string().trim().min(1).max(20)).max(100),
  }),
};

// Timetable
const scheduledEntrySchema = z.strictObject({
  id: z.string().trim().min(1).max(100),
  requirementId: z.string().trim().min(1).max(100),
  subjectId: z.string().trim().min(1).max(100),
  teacherId: z.string().trim().min(1).max(100),
  sectionId: z.string().trim().min(1).max(100),
  roomId: z.string().trim().min(1).max(100),
  day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat"]),
  startPeriod: z.number().int().min(1).max(20),
  span: z.number().int().min(1).max(10),
});

const saveTimetableSchema = {
  params: collegeParams,
  body: z.strictObject({
    entries: z.array(scheduledEntrySchema).max(500),
    source: z.enum(["sample", "generated", "edited"]).optional(),
    seed: z.number().nullable().optional(),
  }),
};

const validateTimetableSchema = {
  params: collegeParams,
  body: z.strictObject({
    entries: z.array(scheduledEntrySchema).max(500),
  }),
};

const generateTimetableSchema = {
  params: collegeParams,
  body: z.strictObject({
    seed: z.number().optional(),
    maxAttempts: z.number().int().min(1).max(50).optional(),
    sectionIds: z.array(z.string().trim()).max(50).optional(),
  }),
};

export function academicRoutes(s: { academic: AcademicService }): ModuleSpec {
  const id = (v: string) => new Types.ObjectId(v);

  return {
    mount: "/colleges/:collegeId/academic",
    routes: [
      // Full Dataset & Demo Seed
      {
        method: "get",
        path: "/",
        access: { kind: "member", capability: "timetable.view" },
        schemas: collegeOnly,
        handler: async (_req, res) => {
          const member = memberOf(res);
          const dataset = await s.academic.getDataset(member.collegeId);
          sendData(res, can(member.roles, "academic.view") ? dataset : withoutPersonalData(dataset));
        },
      },
      {
        method: "post",
        path: "/seed",
        access: { kind: "member", capability: "academic.manage" },
        schemas: collegeOnly,
        handler: async (_req, res) => sendData(res, await s.academic.seedDemoData(memberOf(res).collegeId), 201),
      },

      // Departments
      {
        method: "get",
        path: "/departments",
        access: { kind: "member", capability: "academic.view" },
        schemas: collegeOnly,
        handler: async (_req, res) => sendData(res, await s.academic.listDepartments()),
      },
      {
        method: "post",
        path: "/departments",
        access: { kind: "member", capability: "academic.manage" },
        schemas: createDepartmentSchema,
        handler: async (req, res) => sendData(res, await s.academic.createDepartment(valid(req, createDepartmentSchema).body), 201),
      },
      {
        method: "patch",
        path: "/departments/:id",
        access: { kind: "member", capability: "academic.manage" },
        schemas: updateDepartmentSchema,
        handler: async (req, res) => {
          const { params, body } = valid(req, updateDepartmentSchema);
          sendData(res, await s.academic.updateDepartment(id(params.id), body));
        },
      },
      {
        method: "delete",
        path: "/departments/:id",
        access: { kind: "member", capability: "academic.manage" },
        schemas: entityParams,
        handler: async (req, res) => {
          await s.academic.deleteDepartment(id(valid(req, entityParams).params.id));
          res.status(204).end();
        },
      },

      // Teachers
      {
        method: "get",
        path: "/teachers",
        access: { kind: "member", capability: "academic.view" },
        schemas: collegeOnly,
        handler: async (_req, res) => sendData(res, await s.academic.listTeachers()),
      },
      {
        method: "post",
        path: "/teachers",
        access: { kind: "member", capability: "academic.manage" },
        schemas: createTeacherSchema,
        handler: async (req, res) => sendData(res, await s.academic.createTeacher(valid(req, createTeacherSchema).body), 201),
      },
      {
        method: "patch",
        path: "/teachers/:id",
        access: { kind: "member", capability: "academic.manage" },
        schemas: updateTeacherSchema,
        handler: async (req, res) => {
          const { params, body } = valid(req, updateTeacherSchema);
          sendData(res, await s.academic.updateTeacher(id(params.id), body));
        },
      },
      {
        method: "delete",
        path: "/teachers/:id",
        access: { kind: "member", capability: "academic.manage" },
        schemas: entityParams,
        handler: async (req, res) => {
          await s.academic.deleteTeacher(id(valid(req, entityParams).params.id));
          res.status(204).end();
        },
      },

      // Subjects
      {
        method: "get",
        path: "/subjects",
        access: { kind: "member", capability: "academic.view" },
        schemas: collegeOnly,
        handler: async (_req, res) => sendData(res, await s.academic.listSubjects()),
      },
      {
        method: "post",
        path: "/subjects",
        access: { kind: "member", capability: "academic.manage" },
        schemas: createSubjectSchema,
        handler: async (req, res) => sendData(res, await s.academic.createSubject(valid(req, createSubjectSchema).body), 201),
      },
      {
        method: "patch",
        path: "/subjects/:id",
        access: { kind: "member", capability: "academic.manage" },
        schemas: updateSubjectSchema,
        handler: async (req, res) => {
          const { params, body } = valid(req, updateSubjectSchema);
          sendData(res, await s.academic.updateSubject(id(params.id), body));
        },
      },
      {
        method: "delete",
        path: "/subjects/:id",
        access: { kind: "member", capability: "academic.manage" },
        schemas: entityParams,
        handler: async (req, res) => {
          await s.academic.deleteSubject(id(valid(req, entityParams).params.id));
          res.status(204).end();
        },
      },

      // Sections
      {
        method: "get",
        path: "/sections",
        access: { kind: "member", capability: "academic.view" },
        schemas: collegeOnly,
        handler: async (_req, res) => sendData(res, await s.academic.listSections()),
      },
      {
        method: "post",
        path: "/sections",
        access: { kind: "member", capability: "academic.manage" },
        schemas: createSectionSchema,
        handler: async (req, res) => sendData(res, await s.academic.createSection(valid(req, createSectionSchema).body), 201),
      },
      {
        method: "patch",
        path: "/sections/:id",
        access: { kind: "member", capability: "academic.manage" },
        schemas: updateSectionSchema,
        handler: async (req, res) => {
          const { params, body } = valid(req, updateSectionSchema);
          sendData(res, await s.academic.updateSection(id(params.id), body));
        },
      },
      {
        method: "delete",
        path: "/sections/:id",
        access: { kind: "member", capability: "academic.manage" },
        schemas: entityParams,
        handler: async (req, res) => {
          await s.academic.deleteSection(id(valid(req, entityParams).params.id));
          res.status(204).end();
        },
      },

      // Rooms
      {
        method: "get",
        path: "/rooms",
        access: { kind: "member", capability: "academic.view" },
        schemas: collegeOnly,
        handler: async (_req, res) => sendData(res, await s.academic.listRooms()),
      },
      {
        method: "post",
        path: "/rooms",
        access: { kind: "member", capability: "academic.manage" },
        schemas: createRoomSchema,
        handler: async (req, res) => sendData(res, await s.academic.createRoom(valid(req, createRoomSchema).body), 201),
      },
      {
        method: "patch",
        path: "/rooms/:id",
        access: { kind: "member", capability: "academic.manage" },
        schemas: updateRoomSchema,
        handler: async (req, res) => {
          const { params, body } = valid(req, updateRoomSchema);
          sendData(res, await s.academic.updateRoom(id(params.id), body));
        },
      },
      {
        method: "delete",
        path: "/rooms/:id",
        access: { kind: "member", capability: "academic.manage" },
        schemas: entityParams,
        handler: async (req, res) => {
          await s.academic.deleteRoom(id(valid(req, entityParams).params.id));
          res.status(204).end();
        },
      },

      // Requirements
      {
        method: "get",
        path: "/requirements",
        access: { kind: "member", capability: "academic.view" },
        schemas: collegeOnly,
        handler: async (_req, res) => sendData(res, await s.academic.listRequirements()),
      },
      {
        method: "post",
        path: "/requirements",
        access: { kind: "member", capability: "academic.manage" },
        schemas: createRequirementSchema,
        handler: async (req, res) => sendData(res, await s.academic.createRequirement(valid(req, createRequirementSchema).body), 201),
      },
      {
        method: "patch",
        path: "/requirements/:id",
        access: { kind: "member", capability: "academic.manage" },
        schemas: updateRequirementSchema,
        handler: async (req, res) => {
          const { params, body } = valid(req, updateRequirementSchema);
          sendData(res, await s.academic.updateRequirement(id(params.id), body));
        },
      },
      {
        method: "delete",
        path: "/requirements/:id",
        access: { kind: "member", capability: "academic.manage" },
        schemas: entityParams,
        handler: async (req, res) => {
          await s.academic.deleteRequirement(id(valid(req, entityParams).params.id));
          res.status(204).end();
        },
      },

      // Teacher Availability
      {
        method: "get",
        path: "/availability",
        access: { kind: "member", capability: "academic.view" },
        schemas: collegeOnly,
        handler: async (_req, res) => sendData(res, await s.academic.getAvailability()),
      },
      {
        method: "post",
        path: "/availability/:teacherId",
        access: { kind: "member", capability: "availability.manage" },
        schemas: setAvailabilitySchema,
        handler: async (req, res) => {
          const { params, body } = valid(req, setAvailabilitySchema);
          sendData(res, await s.academic.setTeacherAvailability(params.teacherId, body.slots));
        },
      },

      // Timetable
      {
        method: "get",
        path: "/timetable",
        access: { kind: "member", capability: "timetable.view" },
        schemas: collegeOnly,
        handler: async (_req, res) => sendData(res, await s.academic.getTimetable(memberOf(res).collegeId)),
      },
      {
        method: "post",
        path: "/timetable",
        access: { kind: "member", capability: "academic.manage" },
        schemas: saveTimetableSchema,
        handler: async (req, res) => {
          const { body } = valid(req, saveTimetableSchema);
          sendData(res, await s.academic.saveTimetable(memberOf(res).collegeId, body));
        },
      },
      {
        method: "post",
        path: "/timetable/validate",
        access: { kind: "member", capability: "academic.view" },
        schemas: validateTimetableSchema,
        handler: async (req, res) => {
          const { body } = valid(req, validateTimetableSchema);
          sendData(res, await s.academic.validateTimetableEntries(memberOf(res).collegeId, body.entries));
        },
      },
      {
        method: "post",
        path: "/timetable/generate",
        access: { kind: "member", capability: "academic.manage" },
        schemas: generateTimetableSchema,
        handler: async (req, res) => {
          const { body } = valid(req, generateTimetableSchema);
          sendData(res, await s.academic.generateCollegeTimetable(memberOf(res).collegeId, body));
        },
      },
      {
        method: "delete",
        path: "/timetable",
        access: { kind: "member", capability: "academic.manage" },
        schemas: collegeOnly,
        handler: async (_req, res) => {
          await s.academic.clearTimetable(memberOf(res).collegeId);
          res.status(204).end();
        },
      },
    ],
  };
}

