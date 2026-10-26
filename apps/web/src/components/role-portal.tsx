"use client";

import Link from "next/link";
import { useState } from "react";

import { Icon, type IconName } from "@/components/icons";
import { Button, cx } from "@/components/ui";
import { useWorkspace } from "@/lib/store";

interface RoleCardProps {
  title: string;
  badge: string;
  badgeTone: "blue" | "purple" | "emerald" | "indigo" | "amber";
  icon: IconName;
  description: string;
  features: string[];
  selector?: React.ReactNode;
  onEnter: () => void;
  actionText: string;
}

const BADGE_STYLES = {
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
};

const ICON_BG_STYLES = {
  blue: "bg-blue-100 text-blue-700",
  purple: "bg-purple-100 text-purple-700",
  emerald: "bg-emerald-100 text-emerald-700",
  indigo: "bg-indigo-100 text-indigo-700",
  amber: "bg-amber-100 text-amber-800",
};

function RoleCard({
  title,
  badge,
  badgeTone,
  icon,
  description,
  features,
  selector,
  onEnter,
  actionText,
}: RoleCardProps) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-line bg-white p-5 shadow-sm transition-all hover:border-slate-400 hover:shadow-md">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className={cx("grid h-11 w-11 place-items-center rounded-lg", ICON_BG_STYLES[badgeTone])}>
            <Icon name={icon} className="h-6 w-6" />
          </div>
          <span className={cx("rounded-full border px-2.5 py-0.5 text-xs font-semibold", BADGE_STYLES[badgeTone])}>
            {badge}
          </span>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-xs text-ink-muted leading-relaxed">{description}</p>
        </div>

        {selector && <div className="pt-1">{selector}</div>}

        <div className="space-y-1.5 border-t border-line/60 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Accessible Features</p>
          <ul className="space-y-1 text-xs text-ink">
            {features.map((feat, idx) => (
              <li key={idx} className="flex items-center gap-1.5">
                <span className="text-emerald-600 font-bold">✓</span>
                <span>{feat}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 pt-3 border-t border-line/40">
        <Button
          variant={badgeTone === "blue" ? "primary" : "secondary"}
          onClick={onEnter}
          className="w-full justify-center text-sm font-semibold shadow-xs"
        >
          {actionText}
        </Button>
      </div>
    </div>
  );
}

export function RolePortal() {
  const { dataset, setRole } = useWorkspace();

  const [selectedDeptId, setSelectedDeptId] = useState<string>(
    dataset.departments[0]?.id ?? "",
  );
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    dataset.teachers[0]?.id ?? "",
  );
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    dataset.sections[0]?.id ?? "",
  );

  const selectedDept = dataset.departments.find((d) => d.id === selectedDeptId);
  const selectedTeacher = dataset.teachers.find((t) => t.id === selectedTeacherId);
  const selectedSection = dataset.sections.find((s) => s.id === selectedSectionId);

  return (
    <div className="mx-auto max-w-6xl space-y-8 py-4 sm:py-8">
      {/* Hero Welcome Banner */}
      <div className="rounded-2xl border border-line bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/20 p-6 shadow-sm sm:p-10">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            <Icon name="sparkle" className="h-3.5 w-3.5" />
            <span>Punjab College Timetable Optimizer</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-4xl">
            Select Your Role to Enter Portal
          </h1>
          <p className="text-sm text-ink-muted sm:text-base leading-relaxed">
            Choose your academic role below. Each portal is customized so you only see the dashboards, features,
            and timetables applicable to your responsibilities.
          </p>
        </div>
      </div>

      {/* Role Selection Grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {/* 1. Timetable Coordinator */}
        <RoleCard
          title="Timetable Coordinator"
          badge="Full Admin"
          badgeTone="blue"
          icon="settings"
          description="Build, configure, and optimize the entire college schedule with zero clashes."
          features={[
            "College & teaching week setup",
            "Constraint pre-check validator",
            "AI Web Worker timetable generator",
            "Manual drag & drop schedule editor",
            "Export JSON files & master reports",
          ]}
          actionText="Enter as Coordinator"
          onEnter={() => setRole({ kind: "coordinator" })}
        />

        {/* 2. Principal / Administrator */}
        <RoleCard
          title="Principal / Administrator"
          badge="Executive"
          badgeTone="purple"
          icon="dashboard"
          description="Executive oversight across all departments, audit compliance, and print master timetables."
          features={[
            "Executive compliance dashboard",
            "Zero-clash validation certification",
            "Teacher teaching load audit",
            "Room & lab capacity utilization",
            "Whole-college timetable review (read-only)",
          ]}
          actionText="Enter as Principal"
          onEnter={() => setRole({ kind: "principal" })}
        />

        {/* 3. Head of Department (HOD) */}
        <RoleCard
          title="Head of Department (HOD)"
          badge="Department"
          badgeTone="emerald"
          icon="chart"
          description="Manage departmental faculty teaching quotas, specialized labs, and section schedules."
          features={[
            "Departmental executive dashboard",
            "Department faculty workload summary",
            "Dedicated departmental lab utilization",
            "Section schedules & faculty assignments",
          ]}
          selector={
            dataset.departments.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-muted" htmlFor="hod-dept-select">
                  Select Department:
                </label>
                <select
                  id="hod-dept-select"
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                >
                  {dataset.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>
            )
          }
          actionText={selectedDept ? `Enter as HOD (${selectedDept.code})` : "Enter as HOD"}
          onEnter={() =>
            setRole({
              kind: "hod",
              departmentId: selectedDeptId || dataset.departments[0]?.id || "",
            })
          }
        />

        {/* 4. Teacher / Faculty */}
        <RoleCard
          title="Teacher / Faculty Member"
          badge="Faculty"
          badgeTone="indigo"
          icon="user"
          description="Access your personal daily teaching agenda, next lecture room, and submit unavailable slots."
          features={[
            "Today's class agenda & live countdown",
            "Personal weekly timetable grid",
            "Self-service unavailability submission",
            "Workload limits & profile details",
          ]}
          selector={
            dataset.teachers.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-muted" htmlFor="teacher-select">
                  Select Faculty Member:
                </label>
                <select
                  id="teacher-select"
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                >
                  {dataset.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.designation || "Faculty"})
                    </option>
                  ))}
                </select>
              </div>
            )
          }
          actionText={selectedTeacher ? `Enter as ${selectedTeacher.name.split(" ")[0]}` : "Enter as Teacher"}
          onEnter={() =>
            setRole({
              kind: "teacher",
              teacherId: selectedTeacherId || dataset.teachers[0]?.id || "",
            })
          }
        />

        {/* 5. Student */}
        <RoleCard
          title="Student"
          badge="Student"
          badgeTone="amber"
          icon="calendar"
          description="Find your next class room number, daily timetable routine, and teacher assignments."
          features={[
            "Today's classes & room finder",
            "Next period countdown timer",
            "Full weekly section timetable",
            "Printable class schedule",
          ]}
          selector={
            dataset.sections.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-muted" htmlFor="student-section-select">
                  Select Class / Section:
                </label>
                <select
                  id="student-section-select"
                  value={selectedSectionId}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
                >
                  {dataset.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      Section {s.name} ({s.strength} students)
                    </option>
                  ))}
                </select>
              </div>
            )
          }
          actionText={selectedSection ? `Enter as Student (${selectedSection.name})` : "Enter as Student"}
          onEnter={() =>
            setRole({
              kind: "student",
              sectionId: selectedSectionId || dataset.sections[0]?.id || "",
            })
          }
        />
      </div>

      {/* Backend API Sign In Note */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-xl border border-line bg-surface p-5 sm:flex-row">
        <div>
          <p className="text-sm font-semibold text-ink">Have a registered platform account?</p>
          <p className="text-xs text-ink-muted">
            For multi-college central deployment with 2-Step MFA and database synchronization.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/register"
            className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-slate-50"
          >
            Register College
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
          >
            Platform Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
