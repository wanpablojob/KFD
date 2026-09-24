import { formatCurrency, formatCompact } from "@/lib/format";
import type { RevenuePoint } from "@/lib/types";

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  const max = Math.max(...data.map((d) => d.revenue));
  const chartHeight = 220;

  return (
    <div className="px-5 pb-5">
      <div className="flex h-[220px] items-end justify-between gap-3">
        {data.map((point) => {
          const height = Math.max((point.revenue / max) * chartHeight, 6);
          return (
            <div
              key={point.label}
              className="group relative flex h-full flex-1 flex-col justify-end gap-2"
            >
              <div className="pointer-events-none absolute inset-x-0 -top-9 z-10 hidden flex-col items-center group-hover:flex">
                <span className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground shadow">
                  {formatCurrency(point.revenue)}
                </span>
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  {point.orders} orders
                </span>
              </div>
              <div
                className="w-full rounded-t-md bg-primary/80 transition-colors group-hover:bg-primary"
                style={{ height }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-3">
        {data.map((point) => (
          <div
            key={point.label}
            className="flex-1 text-center text-xs text-muted-foreground"
          >
            {point.label}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Peak: {formatCompact(max)} — revenue this week{" "}
        {formatCurrency(data.reduce((sum, d) => sum + d.revenue, 0))}
      </p>
    </div>
  );
}