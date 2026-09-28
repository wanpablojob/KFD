import { TrendingDownIcon, TrendingUpIcon } from "./icons";
import type { Kpi } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatCard({ kpi, className }: { kpi: Kpi; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-(--radius-card) border border-border bg-card p-5 shadow-sm",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">{kpi.label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-card-foreground">
        {kpi.value}
      </p>
      {/* A trend block needs an actual period-over-period delta. Rendering one
          beside a level (a success rate, a headcount) invents a direction the
          data cannot support, and paints a 0% success rate red with a down
          arrow. When `delta` is absent the hint stands alone, with no arrow
          and no colour. */}
      <div className="mt-3 flex items-center gap-1.5 text-xs">
        {kpi.delta === undefined ? null : (
          <TrendBadge delta={kpi.delta} />
        )}
        <span className="text-muted-foreground">{kpi.hint}</span>
      </div>
    </div>
  );
}

function TrendBadge({ delta }: { delta: number }) {
  const positive = delta >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium",
        positive ? "text-success" : "text-destructive",
      )}
    >
      {positive ? (
        <TrendingUpIcon className="h-3.5 w-3.5" />
      ) : (
        <TrendingDownIcon className="h-3.5 w-3.5" />
      )}
      {positive ? "+" : ""}
      {delta}%
    </span>
  );
}