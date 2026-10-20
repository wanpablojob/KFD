import Image from "next/image";
import Link from "next/link";
import { primaryButton, secondaryButton } from "@/components/marketing/styles";

/**
 * The custom 404. A root not-found.tsx handles every unmatched URL, so this is
 * the page a mistyped link lands on. It uses the landing page's look rather
 * than the dashboard shell, because most bad links come from customers.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-6 text-center text-foreground">
      <Image src="/images/kabankalan/badge.png" alt="" width={120} height={120} className="h-28 w-28" />
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Error 404</p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Wala kami mahanap dito.
        </h1>
        <p className="max-w-[44ch] text-base text-muted-foreground">
          The page you were looking for does not exist, or the link was mistyped.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/" className={primaryButton}>
          Back to home
        </Link>
        <Link href="/track" className={secondaryButton}>
          Track an order
        </Link>
      </div>
    </main>
  );
}
