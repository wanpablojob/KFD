"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * CSS-only tooltip. No portal, no positioning library, no dependency.
 *
 * Opens on hover *and* on focus, which is the part that matters: a `title`
 * attribute is not reachable by keyboard and is not announced by most screen
 * readers, so a tooltip that explains why a rider is flagged would be invisible
 * to exactly the admin who most needs it.
 *
 * Closes on Escape and on blur. The panel is `pointer-events-none` so it can
 * never swallow a click aimed at the trigger underneath it.
 */
export function Tooltip({
  label,
  children,
  className,
}: {
  /** The explanation. This is the whole point of the component. */
  label: string;
  /** The focusable trigger. Kept as the child so callers keep control of it. */
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      <span
        id={id}
        role="tooltip"
        // Kept mounted and toggled with visibility rather than conditionally
        // rendered, so aria-describedby always resolves to a real element.
        className={cn(
          "pointer-events-none absolute left-1/2 top-full z-40 mt-2 w-max max-w-64 -translate-x-1/2",
          "rounded-md bg-card px-2.5 py-1.5 text-xs font-normal leading-snug text-card-foreground shadow-lg",
          "border border-border",
          open ? "visible opacity-100" : "invisible opacity-0",
          "transition-opacity",
        )}
      >
        {label}
      </span>
    </span>
  );
}