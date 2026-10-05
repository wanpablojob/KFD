import { formatCurrency } from "@/lib/format";
import type { RiderEarningsDay } from "@/lib/types";

/**
 * Payouts per day, same bar construction as RevenueChart so the two read as one
 * system. The day label comes from the SQL's `day` column rather than a client
 * date format: the RPC already returns one row per day in the window, so the
 * label is the key it grouped by.
 *
 * The max is floored at 1 because an all-zero window makes every ratio 0/0, and
 * React drops a NaN height silently -- bars with no height and no explanation.
 */
export function EarningsChart({ data }: { data: RiderEarningsDay[] }) {
  if (data.length === 0) {
    return (
      <p className="px-5 pb-5 text-sm text-muted-foreground">
        No earnings recorded in this period.
      </p>
    );
  }

  const max = Math.max(1, ...data.map((point) => point.amount));
  const chartHeight = 180;
  const total = data.reduce((sum, point) => sum + point.amount, 0);
  const deliveries = data.reduce((sum, point) => sum + point.deliveries, 0);

  return (
    <div className="px-5 pb-5">
      <div className="flex h-45 items-end justify-between gap-1">
        {data.map((point) => {
          const height = Math.max((point.amount / max) * chartHeight, 4);
          return (
            <div
              key={point.day}
              className="group relative flex h-full flex-1 flex-col justify-end gap-2"
            >
              <div className="pointer-events-none absolute inset-x-0 -top-9 z-10 hidden flex-col items-center group-hover:flex">
                <span className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground shadow">
                  {formatCurrency(point.amount)}
                </span>
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  {point.deliveries} deliveries
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

      <div className="mt-2 flex gap-1">
        {data.map((point) => (
          <div
            key={point.day}
            className="flex-1 truncate text-center text-[10px] text-muted-foreground"
          >
            {point.day.slice(5)}
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {formatCurrency(total)} from {deliveries} deliveries — best day{" "}
        {formatCurrency(max)}
      </p>
    </div>
  );
}