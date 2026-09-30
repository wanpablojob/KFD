import type { Metadata } from "next";
import Link from "next/link";
import { TrackReferenceForm } from "@/components/track/track-reference-form";

/**
 * The tracking entry point. This is the page the header, hero and footer link
 * to, so it renders a real input instead of a 404 when no reference is in the
 * URL.
 *
 * Noindex: a reference is a bearer secret, and nothing here should be crawled
 * or shared. The Referrer-Policy for the whole /track subtree is set to
 * no-referrer in next.config.ts, so the reference in the URL never leaks in a
 * Referer header when a customer taps an outbound link.
 */
export const metadata: Metadata = {
  title: "Track your order — KFD",
  description: "Enter your KFD order reference to see the live status of your delivery.",
  robots: { index: false, follow: false },
};

export default function TrackIndexPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-8 px-4 py-12">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Kabankalan Food Delivery
        </p>
        <h1 className="text-2xl font-semibold text-card-foreground">
          Track your order
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter the reference from your receipt. It looks like{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            #KFD-XXXXXXXXXXXX
          </code>
          .
        </p>
      </header>

      <section className="rounded-(--radius-card) border border-border bg-card p-6">
        <TrackReferenceForm variant="page" />
      </section>

      <p className="text-xs text-muted-foreground">
        Anyone with this reference can see the order, so treat it like a password
        and do not post it publicly.{" "}
        <Link href="/" className="underline underline-offset-2">
          Back to home
        </Link>
      </p>
    </main>
  );
}
