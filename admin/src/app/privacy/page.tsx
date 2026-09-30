import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS, CONTACT, hasContactDetails } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Privacy Policy — KFD",
  description:
    "How Kabankalan Food Delivery collects, uses and protects your information.",
  alternates: { canonical: "/privacy" },
};

/**
 * A plain-language policy that matches what the product actually does. It is
 * marked as a draft on the page because it has not been reviewed by a lawyer;
 * the content, not the styling, is what needs sign-off before launch.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <p className="mb-6 border-2 border-border bg-muted px-4 py-3 text-sm font-medium">
        Draft notice: this policy describes how KFD works today and is pending
        legal review.
      </p>

      <h1 className="text-2xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {BUSINESS.name} · Kabankalan City, Negros Occidental
      </p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed">
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">What we collect</h2>
          <ul className="list-disc pl-5">
            <li>
              When you join the waitlist or apply as a restaurant or rider: your
              name and a phone number or email address.
            </li>
            <li>
              When you order: the items, the total, your delivery address and
              your contact number, so the rider can reach you.
            </li>
            <li>
              A delivery reference that lets you (and anyone you share it with)
              follow an order.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">How we use it</h2>
          <p>
            To contact you about your signup, to prepare and deliver your order,
            and to let you track it. We do not sell your information.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Payments</h2>
          <p>
            KFD is cash on delivery. We do not collect card or online payment
            details.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Tracking links</h2>
          <p>
            An order reference is enough to view that order, so treat it like a
            password. Tracking pages are set not to be indexed by search engines
            and not to leak the reference to other sites.
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
