/**
 * Class strings shared by the public pages' forms and calls to action, so the
 * landing page, the lead forms and /track hold one look. Theme tokens only, so
 * dark mode follows globals.css.
 */

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export const primaryButton = `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover active:translate-y-px disabled:opacity-60 ${focus}`;

export const secondaryButton = `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted active:translate-y-px ${focus}`;

export const field =
  "w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30";
