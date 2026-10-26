"use client";

import { SetupChecklist } from "@/components/setup-checklist";
import { ButtonLink, PageHeader } from "@/components/ui";
import { useWorkspace } from "@/lib/store";

export default function SetupOverviewPage() {
  const { dataset } = useWorkspace();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Set up college"
        description="Enter your college's data step by step. Everything is checked as you type; the pre-check tells you what would stop classes from fitting before you generate."
        actions={
          <ButtonLink href="/data" icon="upload">
            {dataset.id === "custom" ? "Save or open a college file" : "Start a blank college or open a file"}
          </ButtonLink>
        }
      />
      <SetupChecklist />
    </div>
  );
}
