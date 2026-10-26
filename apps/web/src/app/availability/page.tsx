"use client";

import { RoleNotice } from "@/components/app-shell";
import { AvailabilityEditor } from "@/components/availability-editor";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { useWorkspace } from "@/lib/store";

export default function AvailabilityPage() {
  const { ready, viewTeacher, dataset } = useWorkspace();
  if (!ready) return <PageSkeleton />;
  if (!viewTeacher) return <RoleNotice needs="teacher" />;
  const saved = dataset.availability[viewTeacher.id] ?? [];
  return (
    <div>
      <PageHeader
        title="My Availability"
        description="Tap a period to switch it between available and unavailable. The timetable generator never places your classes in unavailable periods."
      />
      {/* Re-mount after each save so the draft starts from what was stored. */}
      <AvailabilityEditor key={`${viewTeacher.id}:${saved.join(",")}`} teacher={viewTeacher} own />
    </div>
  );
}
