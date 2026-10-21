import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { Icon, type IconName } from "./icons";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_BASE =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "border border-line bg-white text-ink hover:bg-surface",
  ghost: "text-ink-muted hover:bg-surface hover:text-ink",
  danger: "bg-danger text-white hover:bg-red-800",
};

export function Button({
  variant = "secondary",
  icon,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; icon?: IconName }) {
  return (
    <button type="button" className={cx(BUTTON_BASE, BUTTON_VARIANT[variant], className)} {...props}>
      {icon && <Icon name={icon} className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "secondary",
  icon,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  icon?: IconName;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cx(BUTTON_BASE, BUTTON_VARIANT[variant], className)}>
      {icon && <Icon name={icon} className="h-4 w-4" />}
      {children}
    </Link>
  );
}

type Tone = "info" | "success" | "warning" | "error";

const TONE: Record<Tone, { box: string; icon: IconName }> = {
  info: { box: "border-sky-200 bg-sky-50 text-sky-950", icon: "info" },
  success: { box: "border-green-200 bg-green-50 text-green-950", icon: "checkCircle" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-950", icon: "alert" },
  error: { box: "border-red-200 bg-red-50 text-red-950", icon: "xCircle" },
};

export function Banner({
  tone,
  title,
  children,
  action,
  onDismiss,
}: {
  tone: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      className={cx("flex gap-3 rounded-lg border px-4 py-3 text-sm", TONE[tone].box)}
    >
      <Icon name={TONE[tone].icon} className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-1 leading-relaxed">{children}</div>}
        {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-m-1 h-8 w-8 shrink-0 rounded p-1.5 hover:bg-black/5"
          aria-label="Dismiss message"
        >
          <Icon name="x" className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

/** Notice-board style status stamp (UI_UX_GUIDELINES.md section 2). */
export function Stamp({ tone = "neutral", children }: { tone?: "neutral" | "success" | "danger" | "warning" | "info"; children: ReactNode }) {
  const styles = {
    neutral: "border-slate-400 text-slate-600",
    success: "border-success text-success",
    danger: "border-danger text-danger",
    warning: "border-warning text-warning",
    info: "border-primary text-primary",
  }[tone];
  return (
    <span className={cx("inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]", styles)}>
      {children}
    </span>
  );
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-lg border border-line bg-white", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" | "success" }) {
  return (
    <div className="rounded-lg border border-line bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={cx("mt-1 text-2xl font-semibold tabular-nums", tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : "text-ink")}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold leading-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-slate-200/70", className)} aria-hidden="true" />;
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-8 w-64" />
      <Skeleton className="mb-6 h-4 w-96 max-w-full" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="mt-4 h-72" />
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <Icon name={icon} className="h-8 w-8 text-ink-muted" />
      <p className="mt-3 font-semibold text-ink">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "min-h-9 rounded px-3 text-sm font-medium transition-colors",
            value === o.value ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
