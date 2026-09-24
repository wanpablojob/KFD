import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const palettes = [
  { bg: "bg-primary/10", text: "text-primary" },
  { bg: "bg-success/10", text: "text-success" },
  { bg: "bg-warning/10", text: "text-warning" },
  { bg: "bg-blue-100", text: "text-blue-700" },
  { bg: "bg-violet-100", text: "text-violet-700" },
  { bg: "bg-emerald-100", text: "text-emerald-700" },
];

const sizes = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
} as const;

export function hashPalette(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash % palettes.length;
}

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const palette = palettes[hashPalette(name)];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        palette.bg,
        palette.text,
        sizes[size],
        className,
      )}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}