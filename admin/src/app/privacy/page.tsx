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
              Your account: your email address and a password, or your Google
              sign-in. Passwords are stored by our sign-in provider and are never
              visible to us.
            </li>
            <li>
              When you join the waitlist or apply as a restaurant or rider: your
              name and a phone number or email address. Riders may also give a
              city, a licence number, an ORCR number and a government ID
              reference, and a GCash number for payouts.
            </li>
            <li>
              When you order: the items, the total, your barangay, delivery
              address and contact number, so the rider can reach you, and any
              rating you leave afterwards.
            </li>
            <li>
              When a rider completes a delivery: a photo of the delivered order,
              the cash collected and, for GCash payments, the GCash reference
              number. These settle disputes and account for the cash.
            </li>
            <li>
              A delivery reference that lets you (and anyone you share it with)
              follow an order.
            </li>
            <li>
              From the app: a notification token if you allow notifications, and
              crash reports, which include your account ID, email, role and device
              details so we can fix the problem.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">How we use it</h2>
          <p>
            To contact you about your signup, to prepare and deliver your order,
            to let you track it, to pay riders and settle cash, and to keep the
            app working. We do not sell your information.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Who sees it</h2>
          <ul className="list-disc pl-5">
            <li>
              The restaurant sees your name and your order. The rider sees your
              name, address and contact number while delivering it.
            </li>
            <li>
              Delivery photos are seen only by the rider who took them and KFD
              staff, never by other customers.
            </li>
            <li>
              Services that run KFD for us store or process it: our database and
              sign-in provider, our website host, our push notification service
              and our crash reporting service.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Payments</h2>
          <p>
            You pay cash on delivery or by GCash to the rider. We do not collect
            card details. For GCash we record only the reference number the rider
            enters, not your GCash account.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Your choices</h2>
          <p>
            You can delete your account from the app at any time. Under the Data
            Privacy Act of 2012 you may also ask us to show, correct or delete
            the information we hold about you, using the contact details below.
            Order and payment records may be kept where we need them to account
            for money or to meet the law.
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
