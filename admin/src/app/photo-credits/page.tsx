import type { Metadata } from "next";
import Link from "next/link";
import credits from "@/lib/dish-photo-credits.json";

export const metadata: Metadata = {
  title: "Photo credits — Meriendash",
  description: "The menu photos shown in Meriendash, their photographers and licences.",
};

/**
 * Menu photos come from Wikimedia Commons under free licences. CC BY and
 * CC BY-SA ask for the author, the licence and the source: listed here, one
 * line per photo. They illustrate the kind of dish, not each shop's own plate.
 */
export default function PhotoCreditsPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-3xl bg-background px-4 py-10 text-foreground sm:px-6">
      <Link href="/" className="text-sm text-muted-foreground underline underline-offset-2">
        ← Meriendash
      </Link>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">Photo credits</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Menu photos are from Wikimedia Commons under free licences and show the kind of dish,
        not a particular shop&apos;s plate. A shop that uploads its own photo replaces the one
        here.
      </p>
      <ul className="mt-6 divide-y divide-border text-sm">
        {credits.map((c) => (
          <li key={c.file} className="py-2">
            <a href={c.source} className="font-medium underline underline-offset-2">
              {c.subject}
            </a>{" "}
            <span className="text-muted-foreground">
              by {c.author} ·{" "}
              {c.licenseUrl ? (
                <a href={c.licenseUrl} className="underline underline-offset-2">
                  {c.license}
                </a>
              ) : (
                c.license
              )}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
