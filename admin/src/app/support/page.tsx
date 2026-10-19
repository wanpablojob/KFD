import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS, CONTACT, DELIVERY, hasContactDetails } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Support — KFD",
  description:
    "How to reach KFD about an order, your account, or the service in Kabankalan.",
  alternates: { canonical: "/support" },
};

/**
 * The support URL that goes into the App Store and Google Play listings.
 *
 * Both stores require a support URL that actually offers a way to contact the
 * developer, and both reviewers open it before they approve anything. The
 * contact channels are the same ones the landing page and the legal pages
 * use, so there is one place to fill them in: `site-content.ts`. Anything
 * still empty is stated plainly instead of being faked, because a listing
 * that promises a support channel and has none is the thing that gets an app
 * rejected.
 */
export default function SupportPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-bold">Support</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {BUSINESS.name} · Kabankalan City, Negros Occidental
      </p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed">
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Contact us</h2>
          {hasContactDetails() ? (
            <ul className="list-disc pl-5">
              {CONTACT.email ? <li>Email: {CONTACT.email}</li> : null}
              {CONTACT.phone ? <li>Phone: {CONTACT.phone}</li> : null}
              {CONTACT.messengerUrl ? (
                <li>
                  Messenger:{" "}
                  <a
                    href={CONTACT.messengerUrl}
                    className="font-semibold text-primary underline underline-offset-2"
                  >
                    message us
                  </a>
                </li>
              ) : null}
              {CONTACT.supportHours ? (
                <li>Support hours: {CONTACT.supportHours}</li>
              ) : null}
            </ul>
          ) : (
            <p>
              Support contact details are being set up and will be posted here
              before launch.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">About an order</h2>
          <p>
            If you already ordered, the fastest way to see where it is is the
            tracking link we sent you. It works without an account — only the
            order reference is needed.
          </p>
          <p>
            <Link
              href="/track"
              className="font-semibold text-primary underline underline-offset-2"
            >
              Track an order
            </Link>
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Delivery coverage and hours</h2>
          {DELIVERY.areas.length > 0 || DELIVERY.hours.length > 0 ? (
            <>
              {DELIVERY.areas.length > 0 ? (
                <p>Areas we deliver to: {DELIVERY.areas.join(", ")}.</p>
              ) : null}
              {DELIVERY.hours.length > 0 ? (
                <ul className="list-disc pl-5">
                  {DELIVERY.hours.map((window) => (
                    <li key={window.days}>
                      {window.days}: {window.open} to {window.close}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p>{DELIVERY.note}</p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Your data and your account</h2>
          <p>
            The{" "}
            <Link
              href="/privacy"
              className="font-semibold text-primary underline underline-offset-2"
            >
              Privacy Policy
            </Link>{" "}
            says exactly what we collect and who sees it. The{" "}
            <Link
              href="/terms"
              className="font-semibold text-primary underline underline-offset-2"
            >
              Terms &amp; Conditions
            </Link>{" "}
            cover refunds, cancellations and what a rider does on your behalf.
          </p>
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
