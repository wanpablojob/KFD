import { cn } from "@/lib/utils";

/**
 * Table-shaped loading placeholder. Prefer this over a spinner whenever the
 * content being loaded is a table, so the layout does not jump on arrival.
 */
export function TableSkeleton({
  rows = 8,
  columns = 6,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-(--radius-card) border border-border bg-card",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-5 py-3">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-border/70 px-5 py-3.5 last:border-b-0"
        >
          {Array.from({ length: columns }).map((_, c) => (
            <div
              key={c}
              className="h-3.5 flex-1 animate-pulse rounded bg-muted"
              style={{ opacity: 1 - r * 0.06 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
