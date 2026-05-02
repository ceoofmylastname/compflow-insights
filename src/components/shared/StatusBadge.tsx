import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Status pill colors per Wiki/ui-design-system.md (Status colors —
 * canonical seven-status model). Issued is teal-filled, Issue Paid is
 * green-filled, Direct Pay (rendered as a separate badge elsewhere) is
 * teal-outlined to avoid colliding with Issued.
 *
 * Color pulse: when the status visibly changes on the same mounted
 * badge, the pill animates a 400ms color flash so realtime
 * transitions feel alive (matches the cascade in
 * Wiki/realtime-updates-and-hierarchy-cascade.md).
 */
type Variant = {
  /** Outer container classes (background + border + text). */
  shell: string;
  /** Dot color (Tailwind bg-*). Empty string = no dot for filled pills. */
  dot: string;
};

const FILLED_TEAL: Variant = {
  shell: "bg-teal-500 text-white border-transparent",
  dot: "",
};
const FILLED_GREEN: Variant = {
  shell: "bg-emerald-500 text-white border-transparent",
  dot: "",
};
const FILLED_ORANGE: Variant = {
  shell: "bg-orange-500 text-white border-transparent",
  dot: "",
};

const SOFT_SKY: Variant = {
  shell: "bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/25",
  dot: "bg-sky-500",
};
const SOFT_AMBER: Variant = {
  shell: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/25",
  dot: "bg-amber-500",
};
const SOFT_RED: Variant = {
  shell: "bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/25",
  dot: "bg-red-500",
};
const SOFT_GRAY: Variant = {
  shell: "bg-muted text-muted-foreground border-border",
  dot: "bg-muted-foreground/60",
};

const STATUS_VARIANTS: Record<string, Variant> = {
  // Pipeline bucket
  Draft: SOFT_GRAY,
  Submitted: SOFT_SKY,
  Pending: SOFT_AMBER,
  // Booked + Realized
  Issued: FILLED_TEAL,
  "Issue Paid": FILLED_GREEN,
  // At-risk
  "Potential Lapse": FILLED_ORANGE,
  // Dead
  Terminated: SOFT_RED,
  // Deprecated alias — kept so half-deployed tenants render correctly.
  // TODO: remove after Active enum drop.
  Active: FILLED_TEAL,
};

export function StatusBadge({ status }: { status: string | null }) {
  const prevRef = useRef<string | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (prevRef.current !== null && prevRef.current !== status) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 400);
      return () => clearTimeout(t);
    }
    prevRef.current = status;
  }, [status]);

  if (!status) return <span className="text-muted-foreground">--</span>;

  const variant = STATUS_VARIANTS[status] ?? SOFT_GRAY;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-sm transition-colors duration-200",
        variant.shell,
        pulse && "ring-2 ring-offset-1 ring-current"
      )}
      style={pulse ? { animation: "status-pulse 400ms ease-out" } : undefined}
    >
      {variant.dot && <span className={cn("h-1.5 w-1.5 rounded-full", variant.dot)} />}
      {status}
    </span>
  );
}
