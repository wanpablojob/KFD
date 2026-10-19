import type { Metadata } from "next";
import Link from "next/link";
import { ContactDetails } from "@/components/contact-details";
import { BUSINESS, DELIVERY } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Support — KFD",
  description:
    "How to reach KFD about an order, your account, or the service in Kabankalan.",
  alternates: { canonical: "/support" },
};

const link = "font-semibold text-primary underline underline-offset-2";

/**
 * The support URL that goes into the App Store and Google Play listings.
 *
 * Both stores require a support URL that actually offers a way to contact the
 * developer, and both reviewers open it before they approve anything. Contact
 * channels come from site-content.ts through <ContactDetails>, the same block
 * the legal pages use. The answers below describe what the app does today;
 * keep them in step with the Terms when either changes.
 */
export default function SupportPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-bold">Support</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {BUSINESS.name} · Kabankalan City, Negros Occidental
      </p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed">
        <Section title="Contact us">
          <ContactDetails />
          <p className="text-muted-foreground">
            About an order? Include its reference (it starts with #KFD-) so we
            can find it straight away.
          </p>
        </Section>

        <Section title="Where is my order?">
          <p>
            Open the order in the app, or use the tracking link with your order
            reference. It works without signing in.
          </p>
          <p>
            <Link href="/track" className={link}>
              Track an order
            </Link>
          </p>
        </Section>

        <Section title="Cancelling an order">
          <p>
            You can cancel in the app until the restaurant accepts the order.
            After that, contact the restaurant or us as soon as you can; once the
            food is being prepared it may not be possible to cancel.
          </p>
        </Section>

        <Section title="Something was wrong with my order">
          <p>
            Contact us with the order reference and what went wrong. KFD staff
            review every request. If a refund is approved it is paid in cash or
            by GCash, and it appears on the order in your app.
          </p>
        </Section>

        <Section title="Paying">
          <p>
            Pay the rider when your food arrives, in cash or by GCash. We do not
            take card payments. The total you pay is shown before you place the
            order.
          </p>
        </Section>

        <Section title="Your account">
          <ul className="list-disc pl-5">
            <li>Forgot your password? On the sign-in screen, tap &ldquo;Forgot password?&rdquo; and we will email you a code.</li>
            <li>Customers can delete their account in the app under Account, except while an order is on the way.</li>
            <li>Riders can request deletion in the app under Profile. We close the account after settling any payouts and cash.</li>
          </ul>
        </Section>

        <Section title="Riding or selling with KFD">
          <p>
            Riders can apply in the KFD app. Restaurants that want to join can
            contact us using the details above.
          </p>
        </Section>

        <Section title="Delivery coverage and hours">
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
        </Section>

        <Section title="Your data">
          <p>
            The{" "}
            <Link href="/privacy" className={link}>
              Privacy Policy
            </Link>{" "}
            says what we collect and who sees it. The{" "}
            <Link href="/terms" className={link}>
              Terms &amp; Conditions
            </Link>{" "}
            cover ordering, cancelling, refunds and deliveries.
          </p>
        </Section>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
