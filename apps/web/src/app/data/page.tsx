"use client";

import { useRef, useState } from "react";

import { RoleNotice } from "@/components/app-shell";
import { Icon } from "@/components/icons";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Banner, Button, PageHeader, PageSkeleton, Panel } from "@/components/ui";
import { useWorkspace } from "@/lib/store";
import { blankDataset } from "@/lib/timetable/college";
import { OVER_CONSTRAINED_DATASET, STANDARD_DATASET } from "@/lib/timetable/demo-data";
import { MAX_FILE_BYTES, parseCollegeFile, sampleWorkspace, toCollegeFile, type Workspace } from "@/lib/workspace";

type Pending = { workspace: Workspace; title: string; body: string; done: string };

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function DataPage() {
  const { ready, role, dataset, timetable, replaceWorkspace } = useWorkspace();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  if (!ready) return <PageSkeleton />;
  if (role.kind !== "coordinator") return <RoleNotice needs="coordinator" />;

  const download = () => {
    const text = toCollegeFile({ version: 1, dataset, timetable });
    const slug = (dataset.college.shortName || dataset.college.name || "college").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "college";
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-timetable-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("College file downloaded. Keep it somewhere safe; it contains the names you entered.");
  };

  const open = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError("This file is larger than 5 MB, so it is not a college file from this app.");
      return;
    }
    const result = parseCollegeFile(await file.text());
    if (!result.value) {
      setFileError(result.problem ?? "This file could not be opened.");
      return;
    }
    const d = result.value.dataset;
    setPending({
      workspace: result.value,
      title: `Open ${d.college.name || "this college"}?`,
      body: `The file has ${count(d.teachers.length, "teacher")}, ${count(d.rooms.length, "room")}, ${count(d.sections.length, "section")} and ${count(d.requirements.length, "course")}${result.value.timetable ? `, and a timetable of ${count(result.value.timetable.entries.length, "class", "classes")}` : ", and no timetable"}. It replaces the college currently in this browser.`,
      done: `Opened ${d.college.name || "the college file"}.`,
    });
  };

  const confirm = () => {
    if (!pending) return;
    if (replaceWorkspace(pending.workspace)) toast(pending.done);
    else setFileError("This browser blocked saving (storage may be full or disabled). Nothing was changed.");
    setPending(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const current = dataset.college.name || "the current college";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Save and open"
        description="Your college is saved automatically in this browser only. Download a file to keep a backup, move it to another computer, or share it with a colleague."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Download a copy">
          <p className="text-sm text-ink-muted">
            Saves everything (college, week, departments, rooms, teachers, subjects, sections, courses, availability and the current timetable) as
            one file. Opening it in another browser gives the same timetable for the same seed.
          </p>
          <Button variant="primary" icon="download" className="mt-4" onClick={download}>
            Download college file
          </Button>
        </Panel>

        <Panel title="Open a college file">
          <p className="text-sm text-ink-muted">
            Open a file downloaded from this app. It is checked first; a damaged or altered file is refused and nothing changes.
          </p>
          <label className="mt-4 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary">
            <Icon name="upload" className="h-4 w-4" />
            Choose file…
            <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" onChange={(e) => open(e.target.files?.[0])} />
          </label>
          {fileError && (
            <div className="mt-3">
              <Banner tone="error" title="File not opened" onDismiss={() => setFileError(null)}>
                {fileError}
              </Banner>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Start over">
        <p className="text-sm text-ink-muted">Each of these replaces {current} in this browser. Download a copy first if you want to keep it.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            {
              title: "Blank college",
              text: "Start empty and enter your own college step by step.",
              icon: "plus" as const,
              make: (): Pending => ({
                workspace: { version: 1 as const, dataset: blankDataset(), timetable: null },
                title: "Start a blank college?",
                body: `This replaces ${current} and its timetable with an empty college.`,
                done: "Blank college ready. Start with College and week.",
              }),
            },
            {
              title: "Sample college",
              text: "Invented engineering college: 4 sections, 8 teachers, 6 rooms, 74 sessions a week.",
              icon: "sparkle" as const,
              make: (): Pending => ({
                workspace: sampleWorkspace(STANDARD_DATASET),
                title: "Load the sample college?",
                body: `This replaces ${current} with the invented sample college and its timetable.`,
                done: "Sample college loaded.",
              }),
            },
            {
              title: "Stress-test college",
              text: "The sample plus a visiting teacher, an 85-student section and a workshop lab with no room: shows how unplaced sessions are explained.",
              icon: "alert" as const,
              make: (): Pending => ({
                workspace: { version: 1 as const, dataset: structuredClone(OVER_CONSTRAINED_DATASET), timetable: null },
                title: "Load the stress-test college?",
                body: `This replaces ${current} with the over-constrained sample (no timetable yet). Generate to see the unplaced sessions and their reasons.`,
                done: "Stress-test college loaded. Open Generate to see what cannot fit.",
              }),
            },
          ].map((o) => (
            <div key={o.title} className="flex flex-col rounded-lg border border-line p-4">
              <p className="flex items-center gap-2 font-semibold text-ink">
                <Icon name={o.icon} className="h-4 w-4 text-primary" />
                {o.title}
              </p>
              <p className="mt-1 flex-1 text-sm text-ink-muted">{o.text}</p>
              <Button className="mt-3 self-start" onClick={() => setPending(o.make())}>
                Use {o.title.toLowerCase()}
              </Button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Privacy">
        <ul className="space-y-2 text-sm text-ink-muted">
          <li className="flex gap-2">
            <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
            This prototype has no server: nothing you enter is sent anywhere. It stays in this browser until you clear it or download a file.
          </li>
          <li className="flex gap-2">
            <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
            Anyone using this browser profile can see the data. On a shared computer, download a copy and then start a blank college.
          </li>
        </ul>
      </Panel>

      <ConfirmDialog
        open={pending !== null}
        danger
        title={pending?.title ?? ""}
        confirmLabel="Replace"
        onCancel={() => {
          setPending(null);
          if (fileRef.current) fileRef.current.value = "";
        }}
        onConfirm={confirm}
      >
        {pending?.body} This cannot be undone unless you downloaded a copy.
      </ConfirmDialog>
    </div>
  );
}
