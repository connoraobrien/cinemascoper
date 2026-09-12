import type { ReactNode } from "react";
import { ReleaseType } from "@/lib/clientTypes";

export function ReleaseTypeBadge({ type }: { type: ReleaseType }) {
  const styles: Record<ReleaseType, string> = {
    "Standard Theatrical": "bg-accent-soft text-accent border-accent-dim/40",
    "Limited Release": "bg-amber-950/60 text-amber-300 border-amber-700/40",
    "Film Festival": "bg-violet-950/60 text-violet-300 border-violet-700/40",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide ${styles[type]}`}>
      {type}
    </span>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-accent-dim/60 bg-accent-soft text-accent"
          : "border-base-700 bg-base-900 text-base-300 hover:border-base-600 hover:text-base-100"
      }`}
    >
      {children}
    </button>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-base-700 bg-base-900/50 px-6 py-10 text-center">
      <p className="text-sm font-medium text-base-300">{title}</p>
      {hint && <p className="mt-1 text-xs text-base-500">{hint}</p>}
    </div>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-base-100">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-base-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function IconButton({
  onClick,
  title,
  children,
  variant = "default",
}: {
  onClick?: () => void;
  title?: string;
  children: ReactNode;
  variant?: "default" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
        variant === "danger"
          ? "border-base-700 text-base-400 hover:border-red-800 hover:bg-red-950/40 hover:text-red-400"
          : "border-base-700 text-base-400 hover:border-base-600 hover:text-base-100"
      }`}
    >
      {children}
    </button>
  );
}
