import { cn } from "@/lib/utils";

/**
 * A 1-5 score as stars.
 *
 * The number is repeated in the accessible label, because "★★★★☆" read aloud
 * is five symbols and the score is the only thing that matters. The unused
 * stars stay rendered (dimmed) so the row height does not jump between a 1 and
 * a 5, which is what makes a table of ratings readable at a glance.
 */
export function Stars({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const score = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 leading-none", className)}
      role="img"
      aria-label={`${score} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          aria-hidden="true"
          className={star <= score ? "text-amber-500" : "text-muted-foreground/30"}
        >
          ★
        </span>
      ))}
    </span>
  );
}
