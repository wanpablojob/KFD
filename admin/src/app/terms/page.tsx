import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS, CONTACT, hasContactDetails } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Terms & Conditions — KFD",
  description: "The terms for using Kabankalan Food Delivery.",
  alternates: { canonical: "/terms" },
};

/**
 * Pilot-stage terms. Like the privacy page, the draft banner is deliberate:
 * the wording needs owner/legal sign-off before launch, but it already matches
 * how the service behaves (cash on delivery, no card data, local delivery).
 */
export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <p className="mb-6 border-2 border-border bg-muted px-4 py-3 text-sm font-medium">
        Draft notice: these terms describe the pilot service and are pending
        review.
      </p>

      <h1 className="text-2xl font-bold">Terms &amp; Conditions</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {BUSINESS.name} · Kabankalan City, Negros Occidental
      </p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed">
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">The service</h2>
          <p>
            KFD connects customers in Kabankalan with local restaurants and
            riders. Delivery is currently limited to Kabankalan City.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Orders and payment</h2>
          <p>
            Orders are paid in cash on delivery. The total, including the
            delivery and service fees, is shown before you confirm. Prices come
            from the restaurant and are not set by KFD.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Cancellations</h2>
          <p>
            Contact support as soon as possible to cancel. Once a rider has
            collected the food, an order usually cannot be cancelled.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Tracking</h2>
          <p>
            Your order reference lets you follow a delivery. Keep it private;
            anyone who has it can view the order.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Pilot changes</h2>
          <p>
            KFD is a pilot. Features, coverage areas and fees may change as the
            service grows; material changes will be reflected on this page.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Contact</h2>
          {hasContactDetails() ? (
            <p>
              {CONTACT.email ? <>Email {CONTACT.email}. </> : null}
              {CONTACT.phone ? <>Call or text {CONTACT.phone}.</> : null}
            </p>
          ) : (
            <p>Contact details are being set up and will be posted here.</p>
          )}
        </section>
      </div>

      <Link
        href="/"
        className="mt-10 inline-block text-sm font-medium text-primary underline underline-offset-2"
      >
        Back to home
      </Link>
    </main>
  );
}
