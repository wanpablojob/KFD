"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { SignInDropdown } from "@/components/sign-in-dropdown";
import { LeadForm } from "@/components/lead-form";
import { TrackReferenceForm } from "@/components/track/track-reference-form";
import { PixelBowl, PixelCrate, PixelScooter } from "@/components/pixel/sprites-render";
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

const SPRITES = { crate: PixelCrate, bowl: PixelBowl, scooter: PixelScooter } as const;

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#areas", label: "Areas" },
  { href: "#faq", label: "FAQ" },
] as const;

/**
 * Reveal-on-scroll without a dependency.
 *
 * It sets `data-reveal-ready` only after mount, so the server HTML and the no-JS
 * page show everything; the hidden start state never exists until the browser
 * can also un-hide it. Reduced motion marks everything visible and steps out.
 * This is also what removes the old hydration mismatch: nothing branch-on-media
 * is decided during render.
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

  return (
    <div ref={scope} className="pixel-page pixel-scanlines relative min-h-dvh">
      <a href="#main" className="pixel-skip-link">
        Skip to content
      </a>

      {/* ---------- sticky header: anchors + one CTA ---------- */}
      <header className="pixel-sticky">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <a href="#top" className="flex items-center gap-2 no-underline">
            <PixelBowl title="KFD" />
            <span className="pixel-title text-2xl">KFD</span>
          </a>

          <nav aria-label="Sections" className="hidden items-center gap-6 md:flex">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="pixel-nav-link">
                {item.label}
              </a>
            ))}
          </nav>

          <a href="#track" className="pixel-btn pixel-btn-primary pixel-focus">
            Track order
          </a>
        </div>
      </header>

      <main id="main">
        {/* ---------- hero ---------- */}
        <section
          id="top"
          className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-12 pb-16 sm:pt-16"
        >
          <div className="grid items-center gap-12 md:grid-cols-[1.15fr_0.85fr]">
            <div className="flex flex-col gap-6">
              <span className="pixel-eyebrow">Kabankalan City</span>
              <h1 className="pixel-title text-4xl leading-tight font-bold sm:text-5xl">
                Pagkaing Kabankalan,
                <br />
                hatid sa pinto mo.
              </h1>
              <p className="pixel-body max-w-xl text-base sm:text-lg">
                Order from local kitchens, pay cash on delivery, and follow your
                rider until the food reaches your door. Cash on delivery, dito
                lang sa Kabankalan.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <a href="#track" className="pixel-btn pixel-btn-primary pixel-focus">
                  Track your order
                </a>
                <a href="#waitlist" className="pixel-btn pixel-btn-secondary pixel-focus">
                  Get the app
                </a>
              </div>
            </div>

            {/* Decorative pixel art only -- no stock imagery. */}
            <div className="flex justify-center md:justify-end">
              <div
                className="pixel-checker pixel-card pixel-float flex flex-col items-center gap-6 p-8"
                aria-hidden="true"
              >
                <PixelScooter title="" />
                <div className="flex items-center gap-6">
                  <PixelCrate title="" />
                  <PixelBowl title="" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="pixel-rule mx-auto w-full max-w-6xl" />

        {/* ---------- trust bar: true facts only ---------- */}
        <section
          aria-label="Service facts"
          className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10"
        >
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICE_FACTS.map((fact) => (
              <li
                key={fact}
                className="pixel-card flex items-center gap-3 px-5 py-4 text-sm font-bold"
              >
                <span aria-hidden="true" className="pixel-dot" />
                {fact}
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- customer benefits ---------- */}
        <section
          data-reveal
          className="relative z-10 mx-auto w-full max-w-6xl px-6 py-16"
        >
          <div className="grid gap-6 md:grid-cols-3">
            {CUSTOMER_BENEFITS.map((benefit) => {
              const Sprite = SPRITES[benefit.sprite];
              return (
                <article
                  key={benefit.title}
                  className="pixel-card pixel-card-hover flex flex-col gap-4 p-6"
                >
                  <span className="flex h-14 items-center">
                    <Sprite title="" />
                  </span>
                  <h3 className="text-lg font-bold">{benefit.title}</h3>
                  <p className="pixel-body text-sm">{benefit.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* ---------- how it works ---------- */}
        <section
          id="how"
          data-reveal
          className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-16"
        >
          <h2 className="pixel-title mb-3 text-2xl font-bold sm:text-3xl">
            How it works
          </h2>
          <p className="pixel-body mb-10 max-w-2xl text-sm">
            Tatlong hakbang lang: pumili, magbayad, at hintayin.
          </p>
          <ol className="grid gap-6 md:grid-cols-3">
            {HOW_IT_WORKS.map((step, i) => (
              <li key={step.key} className="pixel-card flex flex-col gap-3 p-6">
                <span className="pixel-title text-3xl text-primary">{i + 1}</span>
                <h3 className="text-lg font-bold">{step.title}</h3>
                <p className="pixel-body text-sm">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- inline tracking ---------- */}
        <section
          id="track"
          data-reveal
          className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-16"
        >
          <div className="pixel-card flex flex-col gap-5 p-8 sm:p-10">
            <h2 className="pixel-title text-2xl font-bold sm:text-3xl">
              Track your order
            </h2>
            <p className="pixel-body max-w-2xl text-sm">
              Paste the reference from your receipt. It looks like{" "}
              <code className="pixel-code">#KFD-XXXXXXXXXXXX</code>.
            </p>
            <TrackReferenceForm />
          </div>
        </section>

        {/* ---------- featured restaurants ---------- */}
        <section
          id="restaurants"
          data-reveal
          className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-16"
        >
          <h2 className="pixel-title mb-3 text-2xl font-bold sm:text-3xl">
            Local food, local kitchens
          </h2>
          {PARTNER_RESTAURANTS.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {PARTNER_RESTAURANTS.map((r) => (
                <article key={r.name} className="pixel-card p-6">
                  <h3 className="text-lg font-bold">{r.name}</h3>
                  <p className="pixel-body text-sm">{r.specialty}</p>
                </article>
              ))}
            </div>
          ) : (
            <>
              <p className="pixel-body mb-6 max-w-2xl text-sm">
                We are onboarding Kabankalan kitchens now. Once a restaurant is
                confirmed, it will be listed here with its specialties.
              </p>
              <ul className="flex flex-wrap gap-3">
                {LOCAL_SPECIALTIES.map((dish) => (
                  <li key={dish} className="pixel-chip">
                    {dish}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* ---------- delivery info (single source of truth) ---------- */}
        <section
          id="areas"
          data-reveal
          className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-16"
        >
          <h2 className="pixel-title mb-3 text-2xl font-bold sm:text-3xl">
            Areas, hours and fees
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="pixel-card flex flex-col gap-3 p-6">
              <h3 className="text-lg font-bold">Delivery areas</h3>
              {DELIVERY.areas.length > 0 ? (
                <ul className="pixel-body flex flex-wrap gap-2 text-sm">
                  {DELIVERY.areas.map((area) => (
                    <li key={area} className="pixel-chip">
                      {area}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pixel-body text-sm" data-delivery-state="pending">
                  {DELIVERY.note}
                </p>
              )}

              <h3 className="mt-2 text-lg font-bold">Hours</h3>
              {DELIVERY.hours.length > 0 ? (
                <dl className="pixel-body text-sm">
                  {DELIVERY.hours.map((w) => (
                    <div key={w.days} className="flex justify-between">
                      <dt>{w.days}</dt>
                      <dd>
                        {w.open}–{w.close}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="pixel-body text-sm" data-delivery-state="pending">
                  Delivery hours are being finalised.
                </p>
              )}
            </div>

            <div className="pixel-card flex flex-col gap-3 p-6">
              <h3 className="text-lg font-bold">Fees</h3>
              <dl className="pixel-body text-sm">
                <div className="flex justify-between border-b border-border/60 py-2">
                  <dt>Delivery fee</dt>
                  <dd className="tabular-nums" data-delivery-fee>
                    {formatCurrency(DELIVERY_FEE)}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-border/60 py-2">
                  <dt>Service fee</dt>
                  <dd className="tabular-nums" data-service-fee>
                    {formatCurrency(SERVICE_FEE)}
                  </dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt>Minimum order</dt>
                  <dd className="tabular-nums">
                    {MINIMUM_ORDER == null ? "None" : formatCurrency(MINIMUM_ORDER)}
                  </dd>
                </div>
              </dl>
              <p className="pixel-body text-xs">
                Pay cash on delivery. The exact total is always shown before you
                confirm your order.
              </p>
            </div>
          </div>
        </section>

        {/* ---------- waitlist ---------- */}
        <section
          id="waitlist"
          data-reveal
          className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-16"
        >
          <div className="grid gap-8 md:grid-cols-2 md:items-start">
            <div className="flex flex-col gap-3">
              <h2 className="pixel-title text-2xl font-bold sm:text-3xl">
                Get the app
              </h2>
              <p className="pixel-body text-sm">
                The KFD customer app is not in the app stores yet. Join the
                waitlist and we will tell you the moment it is ready for
                Kabankalan.
              </p>
            </div>
            <LeadForm kind="waitlist" submitLabel="Join the waitlist" />
          </div>
        </section>

        {/* ---------- partners ---------- */}
        <section
          data-reveal
          className="relative z-10 mx-auto w-full max-w-6xl px-6 py-16"
        >
          <div className="grid gap-6 md:grid-cols-2">
            <article id="sell" className="pixel-card scroll-mt-24 p-8">
              <h2 className="pixel-title mb-3 text-2xl font-bold">Sell on KFD</h2>
              <p className="pixel-body mb-2 text-sm">{PARTNER_TERMS.restaurant.blurb}</p>
              <p className="pixel-body mb-6 text-sm">{PARTNER_TERMS.restaurant.terms}</p>
              <LeadForm
                kind="restaurant"
                submitLabel="Apply as a restaurant"
                withNote
                notePlaceholder="Restaurant name, barangay, and best time to call"
                compact
              />
            </article>

            <article id="drive" className="pixel-card scroll-mt-24 p-8">
              <h2 className="pixel-title mb-3 text-2xl font-bold">Drive with KFD</h2>
              <p className="pixel-body mb-2 text-sm">{PARTNER_TERMS.rider.blurb}</p>
              <p className="pixel-body mb-6 text-sm">{PARTNER_TERMS.rider.terms}</p>
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
        <section
          id="faq"
          data-reveal
          className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-16"
        >
          <h2 className="pixel-title mb-8 text-2xl font-bold sm:text-3xl">FAQ</h2>
          <div className="flex flex-col gap-3">
            {FAQ.map((item) => (
              <details key={item.q} className="pixel-card px-5 py-4">
                <summary className="cursor-pointer text-sm font-bold">
                  {item.q}
                </summary>
                <p className="pixel-body mt-3 text-sm">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ---------- support ---------- */}
        <section
          id="support"
          data-reveal
          className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-16"
        >
          <h2 className="pixel-title mb-3 text-2xl font-bold sm:text-3xl">Support</h2>
          {hasContactDetails() ? (
            <ul className="pixel-body flex flex-col gap-2 text-sm">
              {CONTACT.messengerUrl ? (
                <li>
                  <a href={CONTACT.messengerUrl} className="pixel-link">
                    Message us on Messenger
                  </a>
                </li>
              ) : null}
              {CONTACT.phone ? <li>Phone: {CONTACT.phone}</li> : null}
              {CONTACT.email ? <li>Email: {CONTACT.email}</li> : null}
              {CONTACT.supportHours ? (
                <li>Support hours: {CONTACT.supportHours}</li>
              ) : null}
            </ul>
          ) : (
            <p className="pixel-body max-w-2xl text-sm" data-support-state="pending">
              Support details are being set up and will be posted here before
              launch.
            </p>
          )}
        </section>
      </main>

      {/* ---------- footer ---------- */}
      <footer className="relative z-10 border-t-4 border-foreground/10">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <span className="pixel-title text-xl">KFD</span>
            <span className="pixel-body text-xs">{BUSINESS.name}</span>
          </div>

          <nav aria-label="Company" className="flex flex-col gap-2 text-sm">
            <span className="pixel-eyebrow">Company</span>
            <Link href="/privacy" className="pixel-link">
              Privacy Policy
            </Link>
            <Link href="/terms" className="pixel-link">
              Terms &amp; Conditions
            </Link>
            <Link href="/track" className="pixel-link">
              Track an order
            </Link>
          </nav>

          <div className="flex flex-col gap-2 text-sm">
            <span className="pixel-eyebrow">Get in touch</span>
            {hasContactDetails() ? (
              <>
                {CONTACT.messengerUrl ? (
                  <a href={CONTACT.messengerUrl} className="pixel-link">
                    Messenger
                  </a>
                ) : null}
                {CONTACT.phone ? <span>{CONTACT.phone}</span> : null}
                {CONTACT.email ? <span>{CONTACT.email}</span> : null}
              </>
            ) : (
              <span className="pixel-body text-xs">
                Contact details coming soon.
              </span>
            )}
            {SOCIALS.map((s) => (
              <a key={s.href} href={s.href} className="pixel-link">
                {s.label}
              </a>
            ))}
          </div>

          <div className="flex flex-col gap-3 text-sm">
            <span className="pixel-eyebrow">For staff</span>
            <Link href="/login?next=%2Fmerchant" className="pixel-link">
              Open the merchant portal
            </Link>
            <SignInDropdown />
          </div>
        </div>

        <div className="mx-auto w-full max-w-6xl px-6 pb-10">
          <p className="pixel-body text-xs">
            © {new Date().getFullYear()} {BUSINESS.name}
            {BUSINESS.registrationNumber
              ? ` · Reg. No. ${BUSINESS.registrationNumber}`
              : null}
          </p>
        </div>
      </footer>
    </div>
  );
}
