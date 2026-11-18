"use client";

import { Card, CardHeader } from "@/components/ui/card";
import type { RiderForecast } from "@/lib/rider-forecast";

function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${hour < 12 ? "am" : "pm"}`;
}

/**
 * Today's orders hour by hour, forecast vs actual, with the riders each hour
 * needs (rider-forecast.ts). Hours that expect nothing and saw nothing are
 * trimmed from the ends so the busy part of the day is readable.
 */
export function RiderForecastCard({
  forecast,
  onDuty,
  now,
}: {
  forecast: RiderForecast;
  /** Riders online or busy right now. */
  onDuty: number;
  now: Date;
}) {
  const currentHour = now.getHours();
  const active = forecast.hours
    .filter((h) => h.forecast > 0 || h.actual > 0)
    .map((h) => h.hour);
  const from = active.length ? Math.min(...active, currentHour) : 8;
  const to = active.length ? Math.max(...active, currentHour) : 21;
  const shown = forecast.hours.filter((h) => h.hour >= from && h.hour <= to);
  const max = Math.max(1, ...shown.map((h) => Math.max(h.forecast, h.actual)));
  const neededNow = forecast.hours[currentHour]?.ridersNeeded ?? 0;
  const short = neededNow > onDuty;

  const basisText =
    forecast.basis === "same-weekday"
      ? `Forecast from the same weekday in the last ${forecast.samples} weeks, recent weeks weighted most.`
      : forecast.basis === "recent-days"
        ? `Not enough weeks of history yet: forecast from the average of the last ${forecast.samples} ${forecast.samples === 1 ? "day" : "days"}.`
        : "No order history yet, so there is nothing to forecast from.";

  const stats = [
    { label: "Expected orders today", value: String(forecast.expectedOrders) },
    {
      label: "Riders needed at peak",
      value: String(forecast.peakRiders),
      hint:
        forecast.peakHour === null
          ? ""
          : `around ${hourLabel(forecast.peakHour)}`,
    },
    {
      label: "On duty now",
      value: String(onDuty),
      hint: `${neededNow} needed this hour`,
      warn: short,
    },
    {
      label: "Minutes per delivery",
      value: String(forecast.deliveryMinutes),
      hint: "median, last 30 days",
    },
  ];

  return (
    <Card>
      <CardHeader title="Riders needed today" subtitle={basisText} />
      <div className="grid grid-cols-2 gap-3 px-5 pb-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p
              className={`mt-1 text-2xl font-bold tracking-tight ${s.warn ? "text-destructive" : "text-card-foreground"}`}
            >
              {s.value}
            </p>
            {s.hint ? (
              <p
                className={`text-xs ${s.warn ? "text-destructive" : "text-muted-foreground"}`}
              >
                {s.hint}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="overflow-x-auto px-5 pb-5">
        <div className="flex h-48 min-w-max items-end gap-2">
          {shown.map((h) => {
            const isNow = h.hour === currentHour;
            return (
              <div
                key={h.hour}
                className="flex h-full w-10 flex-col items-center justify-end gap-1"
              >
                <span
                  className={`text-[11px] font-semibold ${h.ridersNeeded > 0 ? "text-card-foreground" : "text-transparent"}`}
                  title={`${h.ridersNeeded} rider${h.ridersNeeded === 1 ? "" : "s"} needed`}
                >
                  {h.ridersNeeded}
                </span>
                <div className="flex h-full w-full items-end justify-center gap-0.5">
                  <div
                    className="w-1/2 rounded-t-sm border border-primary/60 bg-primary/15"
                    style={{ height: `${(h.forecast / max) * 100}%` }}
                    title={`Forecast: ${h.forecast} orders`}
                  />
                  <div
                    className="w-1/2 rounded-t-sm bg-primary"
                    style={{ height: `${(h.actual / max) * 100}%` }}
                    title={`Actual: ${h.actual} orders`}
                  />
                </div>
                <span
                  className={`text-[10px] ${isNow ? "font-bold text-primary" : "text-muted-foreground"}`}
                >
                  {hourLabel(h.hour)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border border-primary/60 bg-primary/15" />{" "}
            Forecast orders
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-primary" />{" "}
            Actual orders today
          </span>
          <span>Number above each hour: riders needed (2 jobs per rider)</span>
        </div>
      </div>
    </Card>
  );
}
