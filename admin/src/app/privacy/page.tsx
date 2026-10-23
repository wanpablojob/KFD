import type { Metadata } from "next";
import Link from "next/link";
import { ContactDetails } from "@/components/contact-details";
import { BUSINESS, LEGAL_UPDATED } from "@/lib/site-content";

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
        {BUSINESS.name} · Kabankalan City, Negros Occidental · Last updated{" "}
        {LEGAL_UPDATED}
      </p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed">
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">What we collect</h2>
          <ul className="list-disc pl-5">
            <li>
              Your account: your email address and a password, or your Google
              sign-in. Passwords are stored by our sign-in provider and are
              never visible to us.
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
              For a Pabakal: the stores and items you ask for, any note, and a
              photo of the receipt the rider takes after buying them.
            </li>
            <li>
              From riders: their location while they have an order, trip or
              Pabakal in hand, and only while the rider app is open. Only the
              latest position is kept, and it is deleted when the job ends.
            </li>
            <li>
              A delivery reference that lets you (and anyone you share it with)
              follow an order.
            </li>
            <li>
              From the app: a notification token if you allow notifications, and
              crash reports, which include your account ID, email, role and
              device details so we can fix the problem.
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
          <h2 className="text-base font-semibold">AI features</h2>
          <ul className="list-disc pl-5">
            <li>
              Pabakal reads the message you type into a shopping list. Only the
              text of that message is sent to Google&apos;s Gemini AI service to
              read it; your name, phone number and address are not.
            </li>
            <li>
              The &ldquo;Picked for you&rdquo; row on Home is chosen from your
              own past orders: the restaurants, cuisines, items and the day and
              time you ordered. That summary, without your name, phone number,
              address or payments, is sent to Gemini to suggest restaurants.
            </li>
            <li>
              Google may use what is sent to improve its services. AI only fills
              in a list or suggests restaurants: you check the list before
              sending, and nothing is ordered without your tap. When AI is not
              available, the app does the same on your phone instead.
            </li>
          </ul>
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
              A Pabakal receipt photo is seen by you, your rider and KFD staff,
              because it is what you pay for.
            </li>
            <li>
              While your order is on its way, you can see your rider&apos;s
              location. Nobody else can, and not once the delivery is done.
            </li>
            <li>
              Services that run KFD for us store or process it: our database and
              sign-in provider, our website host, our push notification service,
              our crash reporting service and Google&apos;s Gemini AI service
              (see AI features).
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Payments</h2>
          <p>
            You pay cash on delivery or by GCash to the rider. We do not collect
            card details. For GCash we record only the reference number the
            rider enters, not your GCash account.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">How long we keep it</h2>
          <p>
            We keep your account details while you have an account. When a
            customer deletes their account, we remove the login and replace the
            name and phone number on past orders. Order, payment, refund and
            cash records are kept, without your contact details, because we need
            them to account for money and to meet tax and other legal duties. A
            rider&apos;s location is kept only while they are on a job: one
            latest position, deleted when the job ends.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">How we protect it</h2>
          <p>
            Data travels over encrypted connections. Access is limited by role:
            customers see their own orders, riders see only the orders assigned
            to them, restaurants see only their own orders, and delivery photos
            are stored privately. Only KFD staff can see everything, and only to
            run the service.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Your rights</h2>
          <p>
            Under the Data Privacy Act of 2012 you may ask what information we
            hold about you, ask us to correct it, object to how we use it, or
            ask us to delete it. Customers can delete their account from the app
            at any time; riders can request deletion from the app. For anything
            else, contact us below. If you believe we have mishandled your data,
            you may also complain to the National Privacy Commission.
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
          <h2 className="text-base font-semibold">Changes to this policy</h2>
          <p>
            When this policy changes, the date at the top changes too, so check
            back from time to time.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">
            Who we are and how to reach us
          </h2>
          <p>
            {BUSINESS.name}, Kabankalan City, Negros Occidental, is responsible
            for your information
            {BUSINESS.registrationNumber
              ? ` (registration ${BUSINESS.registrationNumber})`
              : ""}
            .
          </p>
          <ContactDetails />
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
