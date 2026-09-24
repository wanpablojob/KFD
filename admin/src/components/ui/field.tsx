import { cn } from "@/lib/utils";

export function Label({
  htmlFor,
  className,
  children,
}: {
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "mb-1.5 block text-sm font-medium text-foreground",
        className,
      )}
    >
      {children}
    </label>
  );
}

export function FieldHint({
  children,
  error,
}: {
  children?: React.ReactNode;
  error?: boolean;
}) {
  if (!children) return null;
  return (
    <p
      className={cn(
        "mt-1.5 text-xs text-muted-foreground",
        error && "text-destructive",
      )}
    >
      {children}
    </p>
  );
}