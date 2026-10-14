"use client";

import { useEffect, useRef, type CSSProperties } from "react";
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
  DISH_PHOTOS,
  FAQ,
  HERO_PHOTO,
  HOW_IT_WORKS,
  KITCHEN_PHOTO,
  LOCAL_SPECIALTIES,
  MINIMUM_ORDER,
  PARTNER_RESTAURANTS,
  PARTNER_TERMS,
  PHOTO_CREDITS,
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

/** The gallery's layout: the first dish leads, larger. */
const GALLERY_ORDER = ["Inasal", "Piaya", "Kansi", "Napoleones"] as const;

const SECTION = "relative mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24";
const H2 = "text-3xl font-bold tracking-tight text-foreground sm:text-4xl";
const LEAD = "mt-3 max-w-[60ch] text-base leading-relaxed text-muted-foreground";
const LIFT =
  "transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_18px_40px_-20px_color-mix(in_srgb,var(--primary)_45%,transparent)]";

/** Position in a sequence, read by the entrance and stagger CSS. */
const turn = (i: number) => ({ "--i": i }) as CSSProperties;

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
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
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
    <div ref={scope} className="landing min-h-dvh overflow-x-clip bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow"
      >
        Skip to content
      </a>

      {/* ---------- header: anchors + one call to action ---------- */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/65">
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
                className="relative text-sm font-medium text-muted-foreground no-underline transition-colors after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-full after:origin-left after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-300 hover:text-foreground hover:after:scale-x-100"
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
        <section id="top" className="landing-hero-bg relative isolate">
          <div aria-hidden="true" className="landing-dots absolute inset-0 -z-10" />
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-12 pb-20 sm:px-6 md:grid-cols-[1.05fr_0.95fr] md:pt-20 md:pb-28">
            <div className="flex min-w-0 flex-col gap-6">
              <span
                className="enter text-xs font-semibold uppercase tracking-[0.16em] text-primary"
                style={turn(0)}
              >
                Kabankalan City
              </span>
              <h1
                className="enter text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
                style={turn(1)}
              >
                Pagkaing Kabankalan, hatid sa pinto mo.
              </h1>
              <p
                className="enter max-w-[38ch] text-lg leading-relaxed text-muted-foreground"
                style={turn(2)}
              >
                Order from local kitchens, pay cash when it arrives, and follow your
                rider to your door.
              </p>
              <div className="enter flex flex-wrap items-center gap-3" style={turn(3)}>
                <a href="#waitlist" className={primaryButton}>
                  Get the app
                </a>
                <a href="#track" className={secondaryButton}>
                  Track order
                </a>
              </div>
            </div>

            {/* A real photo of the region's signature dish, with the badge as a seal. */}
            <div className="relative mx-auto w-full max-w-120 min-w-0 md:mr-0">
              <div className="enter-photo relative aspect-4/3 overflow-hidden md:aspect-4/5 rounded-4xl shadow-[0_40px_80px_-40px_color-mix(in_srgb,var(--primary)_55%,transparent)] ring-1 ring-border">
                <Image
                  src={HERO_PHOTO}
                  alt="Chicken inasal on a skewer with a mound of rice and calamansi"
                  fill
                  priority
                  sizes="(min-width: 768px) 480px, 92vw"
                  className="object-cover"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-black/45 to-transparent"
                />
                <p className="absolute bottom-4 left-5 right-5 text-sm font-semibold text-white drop-shadow">
                  Chicken inasal, the taste of Negros
                </p>
              </div>
              <Image
                src="/images/kabankalan/badge.png"
                alt=""
                width={160}
                height={160}
                className="enter-seal absolute -top-6 -left-4 h-28 w-28 drop-shadow-xl sm:-left-8 sm:h-36 sm:w-36"
              />
            </div>
          </div>
        </section>

        {/* ---------- service facts: true facts only ---------- */}
        <section aria-label="Service facts" className="border-y border-border bg-card/70">
          <ul className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-x-6 gap-y-5 px-4 py-7 sm:px-6 md:grid-cols-4">
            {SERVICE_FACTS.map((fact, i) => {
              const Icon = FACT_ICONS[i % FACT_ICONS.length];
              return (
                <li key={fact} className="flex items-center gap-3 text-sm font-semibold">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  {fact}
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---------- customer benefits: one photo card, two quiet ones ---------- */}
        <section data-reveal className={SECTION}>
          <h2 className={H2}>Why order with KFD</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-[1.2fr_1fr] md:grid-rows-2">
            <article
              data-stagger
              style={turn(0)}
              className="group relative isolate flex min-h-75 flex-col justify-end gap-3 overflow-hidden rounded-3xl p-8 text-white md:row-span-2 md:min-h-90"
            >
              <Image
                src={KITCHEN_PHOTO}
                alt=""
                fill
                sizes="(min-width: 768px) 560px, 100vw"
                className="-z-20 object-cover transition-transform duration-1200 ease-out group-hover:scale-105"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 -z-10 bg-linear-to-t from-[#4a0905]/95 via-[#7E0E07]/70 to-[#A3130A]/20"
              />
              <h3 className="text-2xl font-bold tracking-tight">{freshKitchens.title}</h3>
              <p className="max-w-[40ch] text-base leading-relaxed text-white/90">
                {freshKitchens.body}
              </p>
            </article>
            <article
              data-stagger
              style={turn(1)}
              className={`flex flex-col gap-3 rounded-3xl bg-muted p-7 ${LIFT}`}
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-card text-primary">
                <BikeIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-bold text-foreground">{followRider.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{followRider.body}</p>
            </article>
            <article
              data-stagger
              style={turn(2)}
              className={`flex flex-col gap-3 rounded-3xl border border-border bg-card p-7 ${LIFT}`}
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                <ReceiptIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-bold text-foreground">{payCash.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{payCash.body}</p>
            </article>
          </div>
        </section>

        {/* ---------- how it works: a numbered run on a tinted band ---------- */}
        <div className="landing-tint">
          <section id="how" data-reveal className={SECTION}>
            <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr]">
              <div>
                <h2 className={H2}>How it works</h2>
                <p className={LEAD}>Tatlong hakbang lang: pumili, magbayad, at hintayin.</p>
              </div>
              <ol className="relative ml-5 flex flex-col gap-9 border-l-2 border-dashed border-border pl-8 md:ml-0">
                {HOW_IT_WORKS.map((step, i) => (
                  <li key={step.key} data-stagger style={turn(i)} className="relative">
                    <span className="absolute -left-12.5 grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground ring-4 ring-background">
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
        </div>

        {/* ---------- inline tracking: the one full-colour band ---------- */}
        <section
          id="track"
          data-reveal
          className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-10 sm:px-6"
        >
          <div className="landing-band grid gap-8 overflow-hidden rounded-3xl bg-primary p-8 text-primary-foreground shadow-[0_30px_70px_-35px_color-mix(in_srgb,var(--primary)_70%,transparent)] sm:p-12 md:grid-cols-2 md:items-center">
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
            <div className="rounded-2xl bg-card p-4 text-foreground shadow-lg sm:p-5">
              <TrackReferenceForm />
            </div>
          </div>
        </section>

        {/* ---------- local food: real photos of the region's dishes ---------- */}
        <section id="restaurants" data-reveal className={SECTION}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className={H2}>Local food, local kitchens</h2>
              {PARTNER_RESTAURANTS.length === 0 ? (
                <p className={LEAD}>
                  We are onboarding Kabankalan kitchens now. Once a restaurant is
                  confirmed, it will be listed here with its specialties.
                </p>
              ) : null}
            </div>
          </div>

          {PARTNER_RESTAURANTS.length > 0 ? (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PARTNER_RESTAURANTS.map((r, i) => (
                <li
                  key={r.name}
                  data-stagger
                  style={turn(i)}
                  className={`rounded-2xl border border-border bg-card p-6 ${LIFT}`}
                >
                  <h3 className="text-lg font-bold">{r.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{r.specialty}</p>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-10 grid auto-rows-50 grid-cols-2 gap-3 sm:auto-rows-55 sm:gap-4 md:grid-cols-4">
              {GALLERY_ORDER.filter((dish) => LOCAL_SPECIALTIES.includes(dish)).map((dish, i) => (
                <li
                  key={dish}
                  data-stagger
                  style={turn(i)}
                  className={`group relative isolate overflow-hidden rounded-3xl ${
                    i === 0 ? "col-span-2 row-span-2" : i === 1 ? "col-span-2" : ""
                  }`}
                >
                  <Image
                    src={DISH_PHOTOS[dish]}
                    alt={`${dish}, a Negros Occidental specialty`}
                    fill
                    sizes={i === 0 ? "(min-width: 768px) 560px, 100vw" : "(min-width: 768px) 280px, 50vw"}
                    className="-z-10 object-cover transition-transform duration-1200 ease-out group-hover:scale-110"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 bg-linear-to-t from-black/60 via-black/0 to-black/0"
                  />
                  <span className="absolute bottom-4 left-4 rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-[#3A2115] backdrop-blur">
                    {dish}
                  </span>
                </li>
              ))}
            </ul>
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
                <div data-stagger style={turn(0)} className={`rounded-2xl border border-border bg-card p-5 ${LIFT}`}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Delivery
                  </dt>
                  <dd className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl" data-delivery-fee>
                    {formatCurrency(DELIVERY_FEE)}
                  </dd>
                </div>
                <div data-stagger style={turn(1)} className={`rounded-2xl border border-border bg-card p-5 ${LIFT}`}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Service
                  </dt>
                  <dd className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl" data-service-fee>
                    {formatCurrency(SERVICE_FEE)}
                  </dd>
                </div>
                <div data-stagger style={turn(2)} className={`rounded-2xl border border-border bg-card p-5 ${LIFT}`}>
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

        {/* ---------- waitlist: on a soft warm panel ---------- */}
        <section id="waitlist" data-reveal className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-10 sm:px-6">
          <div className="landing-hero-bg relative isolate overflow-hidden rounded-4xl border border-border px-6 py-14 sm:px-12">
            <div aria-hidden="true" className="landing-dots absolute inset-0 -z-10" />
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
          </div>
        </section>

        {/* ---------- partners ---------- */}
        <section data-reveal className={SECTION}>
          <h2 className={H2}>Grow with KFD</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <article
              id="sell"
              data-stagger
              style={turn(0)}
              className="scroll-mt-24 rounded-3xl bg-muted p-7 sm:p-8"
            >
              <span className="grid h-11 w-11 place-items-center rounded-full bg-card text-primary">
                <StoreIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-2xl font-bold tracking-tight">Sell on KFD</h3>
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

            <article
              id="drive"
              data-stagger
              style={turn(1)}
              className="scroll-mt-24 rounded-3xl border border-border bg-card p-7 sm:p-8"
            >
              <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary">
                <BikeIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-2xl font-bold tracking-tight">Drive with KFD</h3>
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
              {FAQ.map((item, i) => (
                <details key={item.q} data-stagger style={turn(i)} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg text-base font-semibold text-foreground transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span
                      aria-hidden="true"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-lg leading-none transition-[transform,background-color] duration-300 group-open:rotate-45 group-open:bg-primary/15"
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
      <footer className="border-t border-border bg-card/70">
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

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 pb-10 sm:px-6">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {BUSINESS.name}
            {BUSINESS.registrationNumber ? `, Reg. No. ${BUSINESS.registrationNumber}` : null}
          </p>
          {/* CC BY-SA asks for the author, the licence and the source. */}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Food photos from Wikimedia Commons:{" "}
            {PHOTO_CREDITS.map((c, i) => (
              <span key={c.source}>
                <a href={c.source} className="underline underline-offset-2 hover:text-foreground">
                  {c.subject}
                </a>{" "}
                by {c.author} (
                <a href={c.licenseUrl} className="underline underline-offset-2 hover:text-foreground">
                  {c.license}
                </a>
                ){i < PHOTO_CREDITS.length - 1 ? "; " : "."}
              </span>
            ))}
          </p>
        </div>
      </footer>
    </div>
  );
}
