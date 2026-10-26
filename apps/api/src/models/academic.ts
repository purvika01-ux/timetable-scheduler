import { Schema, type InferSchemaType } from "mongoose";

import { tenantPlugin } from "../db/tenant.ts";

const collegeId = { type: Schema.Types.ObjectId, required: true, immutable: true } as const;

export const departmentSchema = new Schema(
  {
    collegeId,
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
  },
  { collection: "departments", timestamps: true, strict: "throw" },
);
departmentSchema.plugin(tenantPlugin);
departmentSchema.index({ collegeId: 1, code: 1 }, { unique: true, name: "college_dept_code" });

export const teacherSchema = new Schema(
  {
    collegeId,
    name: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    departmentId: { type: String, required: true, trim: true },
    employeeId: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    maxPeriodsPerDay: { type: Number, required: true, default: 4, min: 1, max: 12 },
  },
  { collection: "teachers", timestamps: true, strict: "throw" },
);
teacherSchema.plugin(tenantPlugin);
teacherSchema.index({ collegeId: 1, employeeId: 1 }, { unique: true, name: "college_teacher_emp_id" });
teacherSchema.index({ collegeId: 1, departmentId: 1 }, { name: "college_teacher_dept" });

export const subjectSchema = new Schema(
  {
    collegeId,
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["theory", "lab"], required: true, default: "theory" },
    color: { type: String, required: true, default: "blue" },
    departmentId: { type: String, trim: true },
  },
  { collection: "subjects", timestamps: true, strict: "throw" },
);
subjectSchema.plugin(tenantPlugin);
subjectSchema.index({ collegeId: 1, code: 1 }, { unique: true, name: "college_subject_code" });

export const sectionSchema = new Schema(
  {
    collegeId,
    name: { type: String, required: true, trim: true },
    programme: { type: String, required: true, trim: true },
    semester: { type: Number, required: true, min: 1, max: 12 },
    strength: { type: Number, required: true, min: 1, max: 500 },
    departmentId: { type: String, required: true, trim: true },
  },
  { collection: "sections", timestamps: true, strict: "throw" },
);
sectionSchema.plugin(tenantPlugin);
sectionSchema.index({ collegeId: 1, name: 1 }, { unique: true, name: "college_section_name" });
sectionSchema.index({ collegeId: 1, departmentId: 1 }, { name: "college_section_dept" });

export const roomSchema = new Schema(
  {
    collegeId,
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["lecture", "lab", "workshop"], required: true, default: "lecture" },
    capacity: { type: Number, required: true, min: 1, max: 1000 },
    building: { type: String, required: true, trim: true },
    departmentId: { type: String, trim: true },
  },
  { collection: "rooms", timestamps: true, strict: "throw" },
);
roomSchema.plugin(tenantPlugin);
roomSchema.index({ collegeId: 1, name: 1 }, { unique: true, name: "college_room_name" });

export const requirementSchema = new Schema(
  {
    collegeId,
    subjectId: { type: String, required: true, trim: true },
    teacherId: { type: String, required: true, trim: true },
    sectionId: { type: String, required: true, trim: true },
    sessionsPerWeek: { type: Number, required: true, min: 1, max: 30 },
    span: { type: Number, required: true, min: 1, max: 4, default: 1 },
    roomType: { type: String, enum: ["lecture", "lab", "workshop"], required: true, default: "lecture" },
  },
  { collection: "requirements", timestamps: true, strict: "throw" },
);
requirementSchema.plugin(tenantPlugin);
requirementSchema.index({ collegeId: 1, sectionId: 1 }, { name: "college_req_section" });
requirementSchema.index({ collegeId: 1, teacherId: 1 }, { name: "college_req_teacher" });

export const teacherAvailabilitySchema = new Schema(
  {
    collegeId,
    teacherId: { type: String, required: true, trim: true },
    slots: { type: [String], default: [] },
  },
  { collection: "teacherAvailability", timestamps: true, strict: "throw" },
);
teacherAvailabilitySchema.plugin(tenantPlugin);
teacherAvailabilitySchema.index({ collegeId: 1, teacherId: 1 }, { unique: true, name: "college_teacher_avail" });

export const timetableSchema = new Schema(
  {
    collegeId,
    source: { type: String, enum: ["sample", "generated", "edited"], required: true, default: "generated" },
    seed: { type: Number, default: null },
    entries: {
      type: [
        {
          id: { type: String, required: true },
          requirementId: { type: String, required: true },
          subjectId: { type: String, required: true },
          teacherId: { type: String, required: true },
          sectionId: { type: String, required: true },
          roomId: { type: String, required: true },
          day: { type: String, enum: ["mon", "tue", "wed", "thu", "fri", "sat"], required: true },
          startPeriod: { type: Number, required: true },
          span: { type: Number, required: true },
        },
      ],
      default: [],
    },
    isValid: { type: Boolean, required: true, default: false },
    validationReport: { type: Schema.Types.Mixed, default: null },
  },
  { collection: "timetables", timestamps: true, strict: "throw" },
);
timetableSchema.plugin(tenantPlugin);
timetableSchema.index({ collegeId: 1 }, { unique: true, name: "college_timetable_unique" });

export type DepartmentDoc = InferSchemaType<typeof departmentSchema>;
export type TeacherDoc = InferSchemaType<typeof teacherSchema>;
export type SubjectDoc = InferSchemaType<typeof subjectSchema>;
export type SectionDoc = InferSchemaType<typeof sectionSchema>;
export type RoomDoc = InferSchemaType<typeof roomSchema>;
export type RequirementDoc = InferSchemaType<typeof requirementSchema>;
export type TeacherAvailabilityDoc = InferSchemaType<typeof teacherAvailabilitySchema>;
export type TimetableDoc = InferSchemaType<typeof timetableSchema>;
