import type { Metadata } from "next";
import Link from "next/link";
import { ContactDetails } from "@/components/contact-details";
import { BUSINESS, LEGAL_UPDATED } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Terms & Conditions — KFD",
  description: "The terms for using Kabankalan Food Delivery.",
  alternates: { canonical: "/terms" },
};

/**
 * Pilot-stage terms. Every rule here is one the product enforces (the
 * cancellation window, the three-open-order cap, staff-only refunds capped at
 * the order total, the delivery photo); none is aspirational. The draft
 * banner stays until the owner and a lawyer sign the wording off.
 */
export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <p className="mb-6 border-2 border-border bg-muted px-4 py-3 text-sm font-medium">
        Draft notice: these terms describe the pilot service and are pending
        legal review.
      </p>

      <h1 className="text-2xl font-bold">Terms &amp; Conditions</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {BUSINESS.name} · Kabankalan City, Negros Occidental · Last updated{" "}
        {LEGAL_UPDATED}
      </p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed">
        <Section title="1. About these terms">
          <p>
            KFD connects customers in Kabankalan City with local restaurants and
            the riders who deliver for them. By creating an account or placing
            an order you agree to these terms. Our{" "}
            <Link href="/privacy" className="font-semibold text-primary underline underline-offset-2">
              Privacy Policy
            </Link>{" "}
            explains what we do with your information.
          </p>
        </Section>

        <Section title="2. Your account">
          <ul className="list-disc pl-5">
            <li>Give your real name, a working email and a contact number. Riders call that number to deliver your order.</li>
            <li>Keep your password to yourself. You are responsible for orders placed from your account.</li>
            <li>We may block an account used for fake orders, abuse of riders or restaurant staff, or anything unlawful.</li>
          </ul>
        </Section>

        <Section title="3. Placing an order">
          <ul className="list-disc pl-5">
            <li>Menus and prices come from each restaurant, not from KFD.</li>
            <li>
              Before you confirm, you see the full total: the food, the delivery
              fee for your barangay, and a service fee. In some barangays the
              delivery fee is agreed with the rider at your door; the app tells
              you when that is the case.
            </li>
            <li>We deliver only to the barangays listed in the app.</li>
            <li>You can have up to three orders in progress at a time.</li>
            <li>An order is accepted once the restaurant confirms it in the app.</li>
          </ul>
        </Section>

        <Section title="4. Paying">
          <p>
            You pay the rider when your food arrives, in cash or by GCash. We do
            not take card payments. For GCash, the rider records the payment&apos;s
            reference number as proof.
          </p>
        </Section>

        <Section title="5. Cancelling">
          <ul className="list-disc pl-5">
            <li>You can cancel in the app until the restaurant accepts your order.</li>
            <li>
              After that, contact the restaurant or KFD support as soon as you
              can. Once the food is being prepared, cancelling may not be
              possible.
            </li>
            <li>A restaurant may cancel an order it cannot fulfil, for example if an item has run out. It must give a reason, which you can see on the order.</li>
          </ul>
        </Section>

        <Section title="6. Delivery">
          <ul className="list-disc pl-5">
            <li>Delivery times depend on the kitchen and the distance. Your tracking page shows the live status.</li>
            <li>Please be reachable at your contact number. If the rider cannot reach you or the address, they may report the delivery as failed and KFD will follow up.</li>
            <li>The rider takes a photo when handing over the order, as proof of delivery. It is seen only by the rider and KFD staff.</li>
          </ul>
        </Section>

        <Section title="7. Problems and refunds">
          <ul className="list-disc pl-5">
            <li>If something is wrong with an order, contact KFD support with your order reference.</li>
            <li>KFD staff review each request. An approved refund is paid in cash or by GCash, and never more than you paid for that order.</li>
            <li>Refunds on an order are shown to you in the app.</li>
          </ul>
        </Section>

        <Section title="8. Ratings">
          <p>
            After a delivery you can rate the restaurant and the rider and leave
            a comment. Please keep ratings honest and respectful.
          </p>
        </Section>

        <Section title="9. Restaurants and riders">
          <p>
            Restaurants are independent businesses and are responsible for the
            food they prepare, including its ingredients and allergens. Ask the
            restaurant if you have an allergy. Restaurants and riders work with
            KFD under separate partner terms.
          </p>
        </Section>

        <Section title="10. Fair use">
          <p>
            Do not place orders you do not intend to receive, harass riders or
            restaurant staff, or try to access orders that are not yours.
            Tracking references are for following your own orders.
          </p>
        </Section>

        <Section title="11. Closing your account">
          <p>
            Customers can delete their account from the app at any time, except
            while an order is on the way. Riders can request deletion from the
            app; KFD closes the account after settling any payouts and cash.
          </p>
        </Section>

        <Section title="12. Liability">
          <p>
            KFD runs the platform with reasonable care. To the extent Philippine
            law allows, KFD is not responsible for losses caused by restaurants
            or by events outside its control. Nothing in these terms limits
            rights you have under Philippine consumer law.
          </p>
        </Section>

        <Section title="13. Changes">
          <p>
            KFD is a pilot. Coverage, fees and features may change. When these
            terms change, the date at the top changes too, and continuing to use
            KFD means you accept the new terms. These terms are governed by the
            laws of the Philippines.
          </p>
        </Section>

        <Section title="14. Contact">
          <ContactDetails />
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
