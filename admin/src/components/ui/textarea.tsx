import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, error, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground",
          "placeholder:text-muted-foreground",
          "transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25",
          "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
          error &&
            "border-destructive focus:border-destructive focus:ring-destructive/25",
          className,
        )}
        {...props}
      />
    );
  },
);