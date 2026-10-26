"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AvailabilityEditor } from "@/components/availability-editor";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { useWorkspace } from "@/lib/store";

function TeacherAvailability() {
  const { dataset } = useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const teacher = dataset.teachers.find((t) => t.id === params.get("teacher")) ?? dataset.teachers[0];

  if (!teacher) {
    return (
      <EmptyState icon="users" title="No teachers yet">
        Add teachers first; then mark the periods each one cannot teach.
      </EmptyState>
    );
  }
  const saved = dataset.availability[teacher.id] ?? [];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="availability-teacher" className="text-sm font-medium text-ink">
          Teacher
        </label>
        <select
          id="availability-teacher"
          value={teacher.id}
          onChange={(e) => router.replace(`/setup/availability?teacher=${encodeURIComponent(e.target.value)}`)}
          className="h-10 min-w-56 rounded-md border border-line bg-white px-2 text-sm"
        >
          {dataset.teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({(dataset.availability[t.id] ?? []).length} unavailable)
            </option>
          ))}
        </select>
      </div>
      <AvailabilityEditor key={`${teacher.id}:${saved.join(",")}`} teacher={teacher} own={false} />
    </div>
  );
}

export default function SetupAvailabilityPage() {
  return (
    <div>
      <PageHeader
        title="Teacher availability"
        description="Mark the periods each teacher cannot teach, for example a visiting teacher who comes only in the mornings. Teachers can also mark their own in the teacher view."
      />
      <Suspense fallback={<PageSkeleton />}>
        <TeacherAvailability />
      </Suspense>
    </div>
  );
}
