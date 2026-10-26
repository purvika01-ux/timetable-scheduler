"use client";

import { useEffect, useId, useRef, useState } from "react";

import { useWorkspace } from "@/lib/store";
import { checkDataset, fieldErrors, usedBy, type SetupArea } from "@/lib/timetable/college";
import type { Dataset } from "@/lib/timetable/types";

import { Icon } from "./icons";
import { ConfirmDialog, Modal } from "./modal";
import { useToast } from "./toast";
import { Banner, Button, EmptyState, Panel } from "./ui";

type Option = { value: string; label: string };

export type Field<T> = {
  key: keyof T & string;
  label: string;
  type: "text" | "number" | "select" | "email";
  /** For selects; a function receives the record being edited. */
  options?: Option[] | ((draft: T) => Option[]);
  /** Label of an empty choice; choosing it stores no value (e.g. "Shared by all departments"). */
  emptyOption?: string;
  hint?: string;
  optional?: boolean;
  min?: number;
  max?: number;
  /** Fill other fields when this one changes (e.g. a lab subject sets the room type). */
  onChange?: (draft: T, value: string) => T;
};

export type Column<T> = { header: string; cell: (item: T) => React.ReactNode; className?: string };

export function EntityEditor<T extends { id: string }>({
  area,
  title,
  singular,
  items,
  columns,
  fields,
  blank,
  label,
  datasetWith,
  emptyText,
  rowActions,
  intro,
}: {
  area: SetupArea;
  title: string;
  /** Lower-case noun for one record, e.g. "room". */
  singular: string;
  items: T[];
  columns: Column<T>[];
  fields: Field<T>[];
  blank: () => T;
  label: (item: T) => string;
  /** The whole college with this list replaced. */
  datasetWith: (items: T[]) => Dataset;
  emptyText: string;
  rowActions?: (item: T) => React.ReactNode;
  intro?: React.ReactNode;
}) {
  const { dataset, updateDataset } = useWorkspace();
  const toast = useToast();
  const [draft, setDraft] = useState<T | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<T | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const problems = checkDataset(dataset).filter((p) => p.area === area);
  const withProblems = new Set(problems.map((p) => p.id));

  useEffect(() => {
    if (Object.keys(errors).length === 0) return;
    formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [errors]);

  const open = (item: T, fresh: boolean) => {
    setDraft(structuredClone(item));
    setIsNew(fresh);
    setErrors({});
    setSaveError(null);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const nextItems = isNew ? [...items, draft] : items.map((x) => (x.id === draft.id ? draft : x));
    const next = datasetWith(nextItems);
    const keys = new Set(fields.map((f) => f.key as string));
    const found = Object.fromEntries(Object.entries(fieldErrors(checkDataset(next), draft.id)).filter(([k]) => keys.has(k)));
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    const result = updateDataset(next);
    if (!result.ok) {
      setSaveError("This browser blocked saving (storage may be full or disabled). Nothing was changed.");
      return;
    }
    setDraft(null);
    toast(
      result.removed > 0
        ? `${label(draft)} saved. ${result.removed} ${result.removed === 1 ? "class was" : "classes were"} removed from the timetable because ${result.removed === 1 ? "it no longer matches its course" : "they no longer match their courses"}; generate again or place them by hand.`
        : `${label(draft)} saved.`,
    );
  };

  const remove = () => {
    if (!deleting) return;
    const result = updateDataset(datasetWith(items.filter((x) => x.id !== deleting.id)));
    if (result.ok) toast(`${label(deleting)} deleted.`);
    setDeleting(null);
  };

  const blockers = deleting ? usedBy(dataset, area, deleting.id) : [];

  return (
    <div className="space-y-4">
      {intro}
      {problems.length > 0 && (
        <Banner tone="error" title={`${problems.length} ${problems.length === 1 ? "problem needs" : "problems need"} fixing here`}>
          <ul className="list-disc space-y-0.5 pl-4">
            {problems.slice(0, 6).map((p, i) => (
              <li key={i}>
                {p.id ? `${label(items.find((x) => x.id === p.id) ?? ({ id: p.id } as T)) || "Unnamed"}: ` : ""}
                {p.message}
              </li>
            ))}
          </ul>
        </Banner>
      )}
      <Panel
        title={`${title} (${items.length})`}
        action={
          <Button variant="primary" icon="plus" onClick={() => open(blank(), true)}>
            Add {singular}
          </Button>
        }
      >
        {items.length === 0 ? (
          <EmptyState icon="plus" title={`No ${title.toLowerCase()} yet`}>
            {emptyText}
          </EmptyState>
        ) : (
          <div className="relative -mx-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                  {columns.map((c) => (
                    <th key={c.header} scope="col" className={c.className ?? "px-4 py-2 font-semibold"}>
                      {c.header}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-2 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-line-soft last:border-0">
                    {columns.map((c, i) => (
                      <td key={c.header} className="px-4 py-2 align-middle">
                        {i === 0 && withProblems.has(item.id) && (
                          <span className="mr-1.5 inline-flex align-middle text-danger" title="Needs fixing">
                            <Icon name="alert" className="h-4 w-4" />
                            <span className="sr-only">Needs fixing: </span>
                          </span>
                        )}
                        {c.cell(item)}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right">
                      <span className="inline-flex gap-1">
                        {rowActions?.(item)}
                        <button
                          type="button"
                          onClick={() => open(item, false)}
                          className="grid h-9 w-9 place-items-center rounded-md text-ink-muted hover:bg-surface hover:text-ink"
                          aria-label={`Edit ${label(item)}`}
                        >
                          <Icon name="edit" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(item)}
                          className="grid h-9 w-9 place-items-center rounded-md text-ink-muted hover:bg-red-50 hover:text-danger"
                          aria-label={`Delete ${label(item)}`}
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={isNew ? `Add ${singular}` : `Edit ${draft ? label(draft) || singular : singular}`}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>Cancel</Button>
            <Button type="submit" form={formId} variant="primary" icon="checkCircle">
              Save
            </Button>
          </>
        }
      >
        {draft && (
          <form id={formId} ref={formRef} onSubmit={save} noValidate className="space-y-4">
            {Object.keys(errors).length > 0 && (
              <p className="text-sm font-medium text-danger" role="alert">
                Please fix the {Object.keys(errors).length === 1 ? "field" : "fields"} marked below.
              </p>
            )}
            {saveError && <Banner tone="error" title="Not saved">{saveError}</Banner>}
            {fields.map((f) => (
              <FieldInput
                key={f.key}
                field={f}
                draft={draft}
                error={errors[f.key]}
                onChange={(value) => {
                  setDraft((d) => {
                    if (!d) return d;
                    let next = { ...d } as T;
                    const raw = value;
                    const typed = f.type === "number" ? (raw === "" ? Number.NaN : Number(raw)) : raw === "" && f.emptyOption !== undefined ? undefined : raw;
                    (next as Record<string, unknown>)[f.key] = typed;
                    if (f.onChange) next = f.onChange(next, raw);
                    return next;
                  });
                  setErrors((er) => {
                    const { [f.key]: _removed, ...rest } = er;
                    void _removed;
                    return rest;
                  });
                }}
              />
            ))}
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null && blockers.length === 0}
        danger
        title={`Delete ${deleting ? label(deleting) : singular}?`}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      >
        This removes it from your college data in this browser. It cannot be undone, but you can add it again.
      </ConfirmDialog>
      <Modal
        open={deleting !== null && blockers.length > 0}
        onClose={() => setDeleting(null)}
        title={`${deleting ? label(deleting) : ""} is still in use`}
        footer={
          <Button variant="primary" onClick={() => setDeleting(null)} autoFocus>
            OK
          </Button>
        }
      >
        <p className="text-sm text-ink-muted">Change or delete these first, then try again:</p>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink">
          {blockers.slice(0, 8).map((b) => (
            <li key={b}>{b}</li>
          ))}
          {blockers.length > 8 && <li>and {blockers.length - 8} more</li>}
        </ul>
      </Modal>
    </div>
  );
}

function FieldInput<T>({
  field,
  draft,
  error,
  onChange,
}: {
  field: Field<T>;
  draft: T;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const raw = (draft as Record<string, unknown>)[field.key];
  const value = raw === undefined || (typeof raw === "number" && Number.isNaN(raw)) ? "" : String(raw);
  const describedBy = [field.hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    "aria-invalid": error ? ("true" as const) : ("false" as const),
    "aria-describedby": describedBy,
    className: `h-10 w-full rounded-md border bg-white px-3 text-sm ${error ? "border-danger" : "border-line"}`,
  };
  const options = typeof field.options === "function" ? field.options(draft) : (field.options ?? []);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {field.label}
        {field.optional && <span className="font-normal text-ink-muted"> (optional)</span>}
      </label>
      {field.type === "select" ? (
        <select {...common} value={value} onChange={(e) => onChange(e.target.value)}>
          {field.emptyOption !== undefined ? <option value="">{field.emptyOption}</option> : value === "" && <option value="">Choose…</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={field.type === "number" ? "number" : field.type === "email" ? "email" : "text"}
          inputMode={field.type === "number" ? "numeric" : undefined}
          min={field.min}
          max={field.max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
      )}
      {field.hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">
          {field.hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 flex items-center gap-1 text-xs font-medium text-danger">
          <Icon name="alert" className="h-3.5 w-3.5" />
          {error}
        </p>
      )}
    </div>
  );
}
