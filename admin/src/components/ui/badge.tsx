import { cn } from "@/lib/utils";

/**
 * Generic badge primitive. Use domain-specific wrappers for typed status maps.
 *
 *   <Badge variant="success">Active</Badge>
 *   <Badge variant="destructive">Declined</Badge>
 *   <Badge variant="neutral">Pending</Badge>
 */
const variantClasses = {
  primary:
    "bg-primary/10 text-primary ring-primary/20",
  secondary:
    "bg-secondary text-secondary-foreground ring-border",
  success:
    "bg-success/10 text-success ring-success/20",
  warning:
    "bg-warning/10 text-warning ring-warning/20",
  destructive:
    "bg-destructive/10 text-destructive ring-destructive/20",
  info:
    "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30",
  neutral:
    "bg-muted text-muted-foreground ring-border",
  outline:
    "border border-border bg-transparent text-foreground",
} as const;

const sizeClasses = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-0.5 text-xs",
  lg: "px-3 py-1 text-sm",
} as const;

export type BadgeVariant = keyof typeof variantClasses;

export function Badge({
  variant = "neutral",
  size = "md",
  className,
  children,
}: {
  variant?: BadgeVariant;
  size?: keyof typeof sizeClasses;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium ring-1 ring-inset whitespace-nowrap",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
    >
      {children}
    </span>
  );
}