"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { SignInDropdown } from "@/components/sign-in-dropdown";
import { LeadForm } from "@/components/lead-form";
import { TrackReferenceForm } from "@/components/track/track-reference-form";
import { BikeIcon, MapPinIcon, ReceiptIcon, StoreIcon } from "@/components/ui/icons";
import { primaryButton, secondaryButton } from "@/components/marketing/styles";
import { formatCurrency } from "@/lib/format";
import {
  BUSINESS,
  CONTACT,
  CUSTOMER_BENEFITS,
  DELIVERY,
  DELIVERY_FEE,
  FAQ,
  HOW_IT_WORKS,
  LOCAL_SPECIALTIES,
  MINIMUM_ORDER,
  PARTNER_RESTAURANTS,
  PARTNER_TERMS,
  SERVICE_FACTS,
  SERVICE_FEE,
  SOCIALS,
  hasContactDetails,
} from "@/lib/site-content";

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#areas", label: "Areas" },
  { href: "#faq", label: "FAQ" },
] as const;

/** One icon per service fact, in SERVICE_FACTS order. */
const FACT_ICONS = [ReceiptIcon, MapPinIcon, StoreIcon, BikeIcon] as const;

const SECTION = "relative mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20";
const H2 = "text-3xl font-bold tracking-tight text-foreground sm:text-4xl";
const LEAD = "mt-3 max-w-[60ch] text-base leading-relaxed text-muted-foreground";

/**
 * Reveal-on-scroll without a dependency.
 *
 * It sets `data-reveal-ready` only after mount, so the server HTML and the no-JS
 * page show everything; the hidden start state never exists until the browser
 * can also un-hide it. Reduced motion marks everything visible and steps out.
 */
function useReveal(scope: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = scope.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (targets.length === 0) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      targets.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    root.setAttribute("data-reveal-ready", "");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [scope]);
}

export function LandingScene() {
  const scope = useRef<HTMLDivElement>(null);
  useReveal(scope);

  const [freshKitchens, followRider, payCash] = CUSTOMER_BENEFITS;

  return (
    <div ref={scope} className="landing min-h-dvh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow"
      >
        Skip to content
      </a>

      {/* ---------- header: anchors + one call to action ---------- */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5 no-underline">
            <Image
              src="/images/kabankalan/badge.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9"
            />
            <span className="text-lg font-bold tracking-tight text-foreground">KFD</span>
          </a>

          <nav aria-label="Sections" className="hidden items-center gap-7 md:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-muted-foreground no-underline transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <a href="#track" className={`${primaryButton} px-4 py-2`}>
            Track order
          </a>
        </div>
      </header>

      <main id="main">
        {/* ---------- hero ---------- */}
        <section
          id="top"
          className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-12 pb-16 sm:px-6 md:grid-cols-[1.1fr_0.9fr] md:pt-20 md:pb-24"
        >
          <div className="flex min-w-0 flex-col gap-6">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Kabankalan City
            </span>
            <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Pagkaing Kabankalan, hatid sa pinto mo.
            </h1>
            <p className="max-w-[38ch] text-lg leading-relaxed text-muted-foreground">
              Order from local kitchens, pay cash when it arrives, and follow your
              rider to your door.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a href="#waitlist" className={primaryButton}>
                Get the app
              </a>
              <a href="#track" className={secondaryButton}>
                Track order
              </a>
            </div>
          </div>

          <div className="flex min-w-0 justify-center md:justify-end">
            <div className="relative w-full max-w-[420px]">
              <div
                aria-hidden="true"
                className="absolute inset-[6%] rounded-full bg-primary/10 blur-2xl"
              />
              <Image
                src="/images/kabankalan/badge.png"
                alt="The Kabankalan Food Delivery badge: a rider on a scooter carrying a KFD food cover"
                width={848}
                height={848}
                priority
                sizes="(min-width: 768px) 420px, 80vw"
                className="relative h-auto w-full drop-shadow-xl"
              />
            </div>
          </div>
        </section>

        {/* ---------- service facts: true facts only ---------- */}
        <section aria-label="Service facts" className="border-y border-border bg-card/60">
          <ul className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-x-6 gap-y-5 px-4 py-7 sm:px-6 md:grid-cols-4">
            {SERVICE_FACTS.map((fact, i) => {
              const Icon = FACT_ICONS[i % FACT_ICONS.length];
              return (
                <li key={fact} className="flex items-center gap-3 text-sm font-semibold">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  {fact}
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---------- customer benefits: one strong card, two quiet ones ---------- */}
        <section data-reveal className={SECTION}>
          <h2 className={H2}>Why order with KFD</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-[1.2fr_1fr] md:grid-rows-2">
            <article className="flex flex-col justify-end gap-3 rounded-3xl bg-primary p-8 text-primary-foreground md:row-span-2 md:min-h-[320px]">
              <h3 className="text-2xl font-bold tracking-tight">{freshKitchens.title}</h3>
              <p className="max-w-[40ch] text-base leading-relaxed opacity-90">
                {freshKitchens.body}
              </p>
            </article>
            <article className="flex flex-col gap-2 rounded-3xl bg-muted p-7">
              <h3 className="text-lg font-bold text-foreground">{followRider.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{followRider.body}</p>
            </article>
            <article className="flex flex-col gap-2 rounded-3xl border border-border bg-card p-7">
              <h3 className="text-lg font-bold text-foreground">{payCash.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{payCash.body}</p>
            </article>
          </div>
        </section>

        {/* ---------- how it works: a numbered run ---------- */}
        <section id="how" data-reveal className={SECTION}>
          <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className={H2}>How it works</h2>
              <p className={LEAD}>Tatlong hakbang lang: pumili, magbayad, at hintayin.</p>
            </div>
            <ol className="relative ml-5 flex flex-col gap-8 border-l border-border pl-8 md:ml-0">
              {HOW_IT_WORKS.map((step, i) => (
                <li key={step.key} className="relative">
                  <span className="absolute -left-[49px] grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground ring-4 ring-background">
                    {i + 1}
                  </span>
                  <h3 className="text-xl font-bold text-foreground">{step.title}</h3>
                  <p className="mt-1 text-base leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- inline tracking: the one full-colour band ---------- */}
        <section id="track" data-reveal className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-8 sm:px-6">
          <div className="grid gap-8 rounded-3xl bg-primary p-8 text-primary-foreground sm:p-12 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Track your order</h2>
              <p className="mt-3 max-w-[44ch] text-base leading-relaxed opacity-90">
                Paste the reference from your receipt. It looks like{" "}
                <code className="whitespace-nowrap rounded-md bg-primary-foreground/15 px-1.5 py-0.5 font-mono text-sm">
                  #KFD-XXXXXXXXXXXX
                </code>
                .
              </p>
            </div>
            <div className="rounded-2xl bg-card p-4 text-foreground sm:p-5">
              <TrackReferenceForm />
            </div>
          </div>
        </section>

        {/* ---------- local food ---------- */}
        <section id="restaurants" data-reveal className={SECTION}>
          <h2 className={H2}>Local food, local kitchens</h2>
          {PARTNER_RESTAURANTS.length > 0 ? (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PARTNER_RESTAURANTS.map((r) => (
                <li key={r.name} className="rounded-2xl border border-border bg-card p-6">
                  <h3 className="text-lg font-bold">{r.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{r.specialty}</p>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p className={LEAD}>
                We are onboarding Kabankalan kitchens now. Once a restaurant is
                confirmed, it will be listed here with its specialties.
              </p>
              <ul className="mt-6 flex flex-wrap gap-2">
                {LOCAL_SPECIALTIES.map((dish) => (
                  <li
                    key={dish}
                    className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold"
                  >
                    {dish}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* ---------- delivery info (single source of truth) ---------- */}
        <section id="areas" data-reveal className={SECTION}>
          <h2 className={H2}>Areas, hours and fees</h2>
          <div className="mt-10 grid gap-10 md:grid-cols-2">
            <div className="flex flex-col gap-8">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Delivery areas
                </h3>
                {DELIVERY.areas.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {DELIVERY.areas.map((area) => (
                      <li
                        key={area}
                        className="rounded-full border border-border bg-card px-3 py-1.5 text-sm"
                      >
                        {area}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-base text-foreground" data-delivery-state="pending">
                    {DELIVERY.note}
                  </p>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Hours
                </h3>
                {DELIVERY.hours.length > 0 ? (
                  <dl className="mt-3 flex flex-col gap-1 text-base">
                    {DELIVERY.hours.map((w) => (
                      <div key={w.days} className="flex justify-between gap-4">
                        <dt>{w.days}</dt>
                        <dd className="tabular-nums">
                          {w.open} to {w.close}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-3 text-base text-foreground" data-delivery-state="pending">
                    Delivery hours are being finalised.
                  </p>
                )}
              </div>
            </div>

            <div>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Delivery
                  </dt>
                  <dd
                    className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl"
                    data-delivery-fee
                  >
                    {formatCurrency(DELIVERY_FEE)}
                  </dd>
                </div>
                <div className="rounded-2xl border border-border bg-card p-5">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Service
                  </dt>
                  <dd
                    className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl"
                    data-service-fee
                  >
                    {formatCurrency(SERVICE_FEE)}
                  </dd>
                </div>
                <div className="rounded-2xl border border-border bg-card p-5">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Minimum
                  </dt>
                  <dd className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl">
                    {MINIMUM_ORDER == null ? "None" : formatCurrency(MINIMUM_ORDER)}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-sm text-muted-foreground">
                Pay cash on delivery. The exact total is always shown before you
                confirm your order.
              </p>
            </div>
          </div>
        </section>

        {/* ---------- waitlist ---------- */}
        <section id="waitlist" data-reveal className={SECTION}>
          <div className="mx-auto max-w-xl text-center">
            <h2 className={H2}>Get the app</h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              The KFD customer app is not in the app stores yet. Join the waitlist
              and we will tell you the moment it is ready for Kabankalan.
            </p>
          </div>
          <div className="mx-auto mt-8 max-w-md text-left">
            <LeadForm kind="waitlist" submitLabel="Join the waitlist" />
          </div>
        </section>

        {/* ---------- partners ---------- */}
        <section data-reveal className={SECTION}>
          <h2 className={H2}>Grow with KFD</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <article id="sell" className="scroll-mt-24 rounded-3xl bg-muted p-7 sm:p-8">
              <h3 className="text-2xl font-bold tracking-tight">Sell on KFD</h3>
              <p className="mt-2 text-base text-foreground">{PARTNER_TERMS.restaurant.blurb}</p>
              <p className="mt-2 mb-6 text-sm text-muted-foreground">
                {PARTNER_TERMS.restaurant.terms}
              </p>
              <LeadForm
                kind="restaurant"
                submitLabel="Apply as a restaurant"
                withNote
                notePlaceholder="Restaurant name, barangay, and best time to call"
                compact
              />
            </article>

            <article id="drive" className="scroll-mt-24 rounded-3xl border border-border bg-card p-7 sm:p-8">
              <h3 className="text-2xl font-bold tracking-tight">Drive with KFD</h3>
              <p className="mt-2 text-base text-foreground">{PARTNER_TERMS.rider.blurb}</p>
              <p className="mt-2 mb-6 text-sm text-muted-foreground">
                {PARTNER_TERMS.rider.terms}
              </p>
              <LeadForm
                kind="rider"
                submitLabel="Apply as a rider"
                withNote
                notePlaceholder="Barangay, your motorcycle, and availability"
                compact
              />
            </article>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="faq" data-reveal className={SECTION}>
          <div className="mx-auto max-w-3xl">
            <h2 className={H2}>Questions</h2>
            <div className="mt-8 divide-y divide-border border-y border-border">
              {FAQ.map((item) => (
                <details key={item.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span
                      aria-hidden="true"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-lg leading-none transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-[65ch] text-base leading-relaxed text-muted-foreground">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- support ---------- */}
        <section id="support" data-reveal className={SECTION}>
          <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-8 sm:p-10">
            <h2 className="text-2xl font-bold tracking-tight">Support</h2>
            {hasContactDetails() ? (
              <ul className="mt-4 flex flex-col gap-2 text-base">
                {CONTACT.messengerUrl ? (
                  <li>
                    <a href={CONTACT.messengerUrl} className="font-semibold text-primary underline underline-offset-2">
                      Message us on Messenger
                    </a>
                  </li>
                ) : null}
                {CONTACT.phone ? <li>Phone: {CONTACT.phone}</li> : null}
                {CONTACT.email ? <li>Email: {CONTACT.email}</li> : null}
                {CONTACT.supportHours ? <li>Support hours: {CONTACT.supportHours}</li> : null}
              </ul>
            ) : (
              <p className="mt-3 text-base text-muted-foreground" data-support-state="pending">
                Support details are being set up and will be posted here before
                launch.
              </p>
            )}
          </div>
        </section>
      </main>

      {/* ---------- footer ---------- */}
      <footer className="border-t border-border bg-card/60">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div className="flex flex-col gap-3">
            <span className="flex items-center gap-2.5">
              <Image
                src="/images/kabankalan/badge.png"
                alt=""
                width={32}
                height={32}
                className="h-8 w-8"
              />
              <span className="text-lg font-bold">KFD</span>
            </span>
            <span className="text-sm text-muted-foreground">{BUSINESS.name}</span>
          </div>

          <nav aria-label="Company" className="flex flex-col gap-2 text-sm">
            <span className="font-semibold text-foreground">Company</span>
            <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-muted-foreground hover:text-foreground">
              Terms &amp; Conditions
            </Link>
            <Link href="/track" className="text-muted-foreground hover:text-foreground">
              Track an order
            </Link>
          </nav>

          <div className="flex flex-col gap-2 text-sm">
            <span className="font-semibold text-foreground">Contact</span>
            {hasContactDetails() ? (
              <>
                {CONTACT.messengerUrl ? (
                  <a href={CONTACT.messengerUrl} className="text-muted-foreground hover:text-foreground">
                    Messenger
                  </a>
                ) : null}
                {CONTACT.phone ? <span className="text-muted-foreground">{CONTACT.phone}</span> : null}
                {CONTACT.email ? <span className="text-muted-foreground">{CONTACT.email}</span> : null}
              </>
            ) : (
              <span className="text-muted-foreground">Contact details coming soon.</span>
            )}
            {SOCIALS.map((s) => (
              <a key={s.href} href={s.href} className="text-muted-foreground hover:text-foreground">
                {s.label}
              </a>
            ))}
          </div>

          <div className="flex flex-col items-start gap-3 text-sm">
            <span className="font-semibold text-foreground">For staff</span>
            <Link href="/login?next=%2Fmerchant" className="text-muted-foreground hover:text-foreground">
              Open the merchant portal
            </Link>
            <SignInDropdown />
          </div>
        </div>

        <div className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {BUSINESS.name}
            {BUSINESS.registrationNumber ? `, Reg. No. ${BUSINESS.registrationNumber}` : null}
          </p>
        </div>
      </footer>
    </div>
  );
}
