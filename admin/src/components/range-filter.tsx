"use client";

import { Button } from "./ui/button";
import { CalendarIcon } from "./ui/icons";
import { presetRange } from "@/lib/report-metrics";

export interface RangeValue {
  /** Local date, YYYY-MM-DD. */
  from: string;
  /** Local date, YYYY-MM-DD, inclusive. */
  to: string;
}

const DEFAULT_PRESETS = [7, 30, 90] as const;

/**
 * The date range control shared by Reports, Refunds and Reviews.
 *
 * Presets set both bounds in one click, because the common report is "the last
 * month" and asking for two dates to get it is where people give up. The date
 * inputs stay editable for a closed period -- the one thing a preset cannot
 * express -- and both are local days: a range is what the operator's calendar
 * says, not what UTC says.
 */
export function RangeFilter({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
}: {
  value: RangeValue;
  onChange: (next: RangeValue) => void;
  presets?: readonly number[];
}) {
  // Recomputed per render: the presets are relative to today, and a page left
  // open overnight should roll over on the next interaction rather than pin
  // "last 7 days" to yesterday forever.
  const now = new Date();

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Date range">
      {presets.map((days) => {
        const preset = presetRange(days, now);
        const active = preset.from === value.from && preset.to === value.to;
        return (
          <Button
            key={days}
            variant={active ? "primary" : "outline"}
            size="sm"
            aria-pressed={active}
            onClick={() => onChange(preset)}
          >
            {days} days
          </Button>
        );
      })}

      <div className="flex items-center gap-2">
        <label htmlFor="range-from" className="sr-only">
          From
        </label>
        <input
          id="range-from"
          type="date"
          value={value.from}
          max={value.to}
          onChange={(event) => {
            if (event.target.value) onChange({ ...value, from: event.target.value });
          }}
          className="h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground"
        />
        <span className="text-muted-foreground" aria-hidden="true">
          →
        </span>
        <label htmlFor="range-to" className="sr-only">
          To
        </label>
        <input
          id="range-to"
          type="date"
          value={value.to}
          min={value.from}
          onChange={(event) => {
            if (event.target.value) onChange({ ...value, to: event.target.value });
          }}
          className="h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground"
        />
      </div>

      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarIcon className="h-3.5 w-3.5" />
        {value.from} → {value.to}
      </span>
    </div>
  );
}
