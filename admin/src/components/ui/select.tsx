import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, error, children, ...props }, ref) {
    return (
      <span className="relative inline-block w-full">
        <select
          ref={ref}
          className={cn(
            "h-9 w-full appearance-none rounded-lg border border-input bg-card pl-3 pr-9 text-sm text-foreground",
            "transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25",
            "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
            error &&
              "border-destructive focus:border-destructive focus:ring-destructive/25",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    );
  },
);