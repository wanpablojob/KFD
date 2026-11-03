"use client";

import { useRef, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { SignInDropdown } from "@/components/sign-in-dropdown";
import { LeadForm } from "@/components/lead-form";
import { TrackReferenceForm } from "@/components/track/track-reference-form";
import { BikeIcon, MapPinIcon, ReceiptIcon, StoreIcon } from "@/components/ui/icons";
import { primaryButton, secondaryButton } from "@/components/marketing/styles";
import { PixelRider } from "@/components/pixel/sprites-render";
import { useLandingMotion } from "@/components/landing-motion";
import {
  APP_DOWNLOADS,
  BUSINESS,
  CONTACT,
  DELIVERY,
  DISH_DETAILS,
  DISH_PHOTOS,
  FAQ,
  FEAST_PHOTO,
  HOW_IT_WORKS,
  KITCHEN_PHOTO,
  LOCAL_SPECIALTIES,
  PABAKAL,
  PARTNER_RESTAURANTS,
  PARTNER_TERMS,
  PHOTO_CREDITS,
  SERVICE_FACTS,
  SOCIALS,
  hasContactDetails,
} from "@/lib/site-content";

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#pabakal", label: "Pabakal" },
  { href: "#restaurants", label: "Food" },
  { href: "#app", label: "Get the app" },
  { href: "#faq", label: "FAQ" },
] as const;

/** One icon per service fact, in SERVICE_FACTS order. */
const FACT_ICONS = [ReceiptIcon, MapPinIcon, StoreIcon, BikeIcon] as const;

/** The food circling the badge in the hero, clockwise from the top. */
const HERO_ORBIT = [
  { name: "Inasal", src: DISH_PHOTOS.Inasal },
  { name: "Piaya", src: DISH_PHOTOS.Piaya },
  { name: "Kansi", src: DISH_PHOTOS.Kansi },
  { name: "Napoleones", src: DISH_PHOTOS.Napoleones },
  { name: "Boodle fight", src: FEAST_PHOTO },
] as const;

/** The dish names that run under the hero; the badge separates them. */
const MARQUEE = ["Inasal", "Piaya", "Kansi", "Napoleones", "Pabakal"] as const;

/** The gallery's layout: the first dish leads, larger. */
const GALLERY_ORDER = ["Inasal", "Piaya", "Kansi", "Napoleones"] as const;

const SECTION = "relative mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24";
const H2 = "font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl";
const LEAD = "mt-3 max-w-[60ch] text-base leading-relaxed text-muted-foreground";
const LIFT =
  "transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_18px_40px_-20px_color-mix(in_srgb,var(--primary)_45%,transparent)]";

/** A call to action on the brand-red panel. */
const whiteButton =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-white px-5 py-3 text-sm font-semibold text-primary transition-colors hover:bg-white/90 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary";

/** Position in a sequence, read by the entrance and stagger CSS. */
const turn = (i: number) => ({ "--i": i }) as CSSProperties;

export function LandingScene() {
  const scope = useRef<HTMLDivElement>(null);
  useLandingMotion(scope);

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
            <span className="font-display text-xl font-bold tracking-tight text-foreground">KFD</span>
          </a>

          <nav aria-label="Sections" className="hidden items-center gap-7 lg:flex">
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

          <div className="flex items-center gap-2">
            <SignInDropdown />
            <a href="#track" data-magnet className={`${primaryButton} px-4 py-2`}>
              Track order
            </a>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="landing-progress absolute inset-x-0 bottom-0 h-0.5 bg-primary"
        />
      </header>

      <main id="main">
        {/* ---------- hero ---------- */}
        <section id="top" className="landing-hero-bg relative isolate">
          <div aria-hidden="true" className="landing-dots absolute inset-0 -z-10" />
          {/* Soft brand light that drifts behind the hero. */}
          <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
            <span data-orb className="absolute -top-24 right-[-10%] h-112 w-md rounded-full bg-primary/20 blur-3xl" />
            <span data-orb className="absolute bottom-[-20%] left-[-10%] h-96 w-96 rounded-full bg-secondary/15 blur-3xl" />
          </div>
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-12 pb-20 sm:px-6 md:grid-cols-[1.05fr_0.95fr] md:pt-20 md:pb-28">
            <div data-hero-copy className="flex min-w-0 flex-col gap-6">
              <span
                className="enter text-xs font-semibold uppercase tracking-[0.16em] text-primary"
                style={turn(0)}
              >
                Kabankalan City
              </span>
              {/* TODO(owner): a Hiligaynon headline, written by a native speaker. */}
              <h1
                className="enter font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
                style={turn(1)}
              >
                Pagkaing Kabankalan,{" "}
                <span className="text-primary">
                  hatid sa{" "}
                  <span className="relative inline-block whitespace-nowrap">
                    pinto mo.
                    <span
                      aria-hidden="true"
                      data-underline
                      className="absolute inset-x-0 bottom-[0.06em] -z-10 h-[0.28em] origin-left rounded-full bg-primary/20"
                    />
                  </span>
                </span>
              </h1>
              <p
                className="enter max-w-[38ch] text-lg leading-relaxed text-muted-foreground"
                style={turn(2)}
              >
                Order from local kitchens, pay cash or GCash when it arrives, and
                follow every step of your order.
              </p>
              <div className="enter flex flex-wrap items-center gap-3" style={turn(3)}>
                <a href="#app" data-magnet className={primaryButton}>
                  Get the app
                </a>
                <a href="#track" data-magnet className={secondaryButton}>
                  Track order
                </a>
              </div>
            </div>

            {/* The badge, with local food circling it. Positions are set here so
                the orbit is whole without JavaScript; landing-motion.ts turns it. */}
            <div
              data-tilt
              data-orbit-stage
              className="relative mx-auto aspect-square w-full max-w-sm min-w-0 select-none sm:max-w-120 md:mr-0"
            >
              <div aria-hidden="true" className="absolute inset-[16%] rounded-full bg-primary/15 blur-3xl" />
              <span
                aria-hidden="true"
                data-ring-deco
                className="absolute inset-[8%] rounded-full border-2 border-dashed border-primary/25"
              />
              <span
                aria-hidden="true"
                data-ring-deco
                className="absolute inset-[24%] rounded-full border border-primary/15"
              />
              <div data-badge className="absolute inset-[27%]">
                <Image
                  src="/images/kabankalan/badge.png"
                  alt="Kabankalan Food Delivery"
                  fill
                  priority
                  sizes="(min-width: 640px) 220px, 46vw"
                  className="enter-seal object-contain drop-shadow-2xl"
                />
              </div>
              <ul data-orbit className="absolute inset-0">
                {HERO_ORBIT.map((dish, i) => {
                  const a = (i / HERO_ORBIT.length) * 2 * Math.PI;
                  return (
                    <li
                      key={dish.name}
                      data-orbit-item
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      // Rounded: the browser shortens long decimals, which breaks hydration.
                      style={{
                        left: `${(50 + 42 * Math.sin(a)).toFixed(2)}%`,
                        top: `${(50 - 42 * Math.cos(a)).toFixed(2)}%`,
                      }}
                    >
                      <div className="enter-orbit" style={turn(i)}>
                        <div className="flex flex-col items-center gap-1.5 transition-transform duration-300 ease-out hover:scale-110">
                          <span className="relative block size-16 overflow-hidden rounded-full shadow-xl ring-4 ring-background sm:size-24">
                            <Image src={dish.src} alt={dish.name} fill sizes="96px" className="object-cover" />
                          </span>
                          <span className="rounded-full bg-card/90 px-2.5 py-0.5 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur sm:text-xs">
                            {dish.name}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
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
                  <span data-fact-icon className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  {fact}
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---------- dish names: one strip, steered by the scroll ---------- */}
        <div aria-hidden="true" className="overflow-hidden border-b border-border py-6 sm:py-8">
          <div data-marquee-track className="flex w-max items-center">
            {[0, 1].map((copy) =>
              MARQUEE.map((word, i) => (
                <span key={`${copy}-${word}`} className="flex items-center">
                  <span
                    className={`px-6 font-display text-4xl font-bold tracking-tight whitespace-nowrap sm:px-8 sm:text-6xl ${
                      i % 2 ? "text-transparent [-webkit-text-stroke:1.5px_var(--primary)]" : "text-foreground"
                    }`}
                  >
                    {word}
                  </span>
                  <Image src="/images/kabankalan/badge.png" alt="" width={48} height={48} className="h-10 w-10 sm:h-12 sm:w-12" />
                </span>
              )),
            )}
          </div>
        </div>

        {/* ---------- how it works: a numbered run on a tinted band ---------- */}
        <div className="landing-tint">
          <section id="how" data-reveal className={SECTION}>
            <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr]">
              <div>
                <h2 data-words className={H2}>How it works</h2>
                <p className={LEAD}>Tatlong hakbang lang: pumili, magbayad, at hintayin.</p>
                {DELIVERY.areas.length > 0 ? (
                  <p className="mt-6 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">We deliver to </span>
                    {DELIVERY.areas.join(", ")}.
                  </p>
                ) : null}
              </div>
              <ol className="relative ml-5 flex flex-col gap-9 border-l-2 border-dashed border-border pl-8 md:ml-0">
                <span
                  aria-hidden="true"
                  data-line
                  className="absolute top-0 -left-0.5 h-full w-0.5 origin-top scale-y-0 rounded-full bg-primary"
                />
                {HOW_IT_WORKS.map((step, i) => (
                  <li key={step.key} data-stagger className="relative">
                    <span data-step className="absolute -left-12.5 grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground ring-4 ring-background">
                      {i + 1}
                    </span>
                    <h3 className="font-display text-2xl font-bold text-foreground">{step.title}</h3>
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
          <div className="relative pt-12">
          {/* The rider rides the band's top edge; zoom keeps the box the sprite's size. */}
          <span aria-hidden="true" data-rider className="absolute top-0 left-6 block">
            <span className="block">
              <PixelRider style={{ zoom: 0.75 }} />
            </span>
          </span>
          <div data-spotlight className="landing-band relative grid gap-8 overflow-hidden rounded-3xl bg-primary p-8 text-primary-foreground shadow-[0_30px_70px_-35px_color-mix(in_srgb,var(--primary)_70%,transparent)] sm:p-12 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Track your order</h2>
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
          </div>
        </section>

        {/* ---------- local food: real photos of the region's dishes ---------- */}
        <section id="restaurants" data-reveal className={SECTION}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 data-words className={H2}>Local food, local kitchens</h2>
              <p className={LEAD}>The dishes Negros is known for, from Kabankalan kitchens.</p>
            </div>
          </div>

          {PARTNER_RESTAURANTS.length > 0 ? (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PARTNER_RESTAURANTS.map((r) => (
                <li
                  key={r.name}
                  data-stagger
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
                  data-tile
                  className={`group relative isolate overflow-hidden rounded-3xl ${
                    i === 0 ? "col-span-2 row-span-2" : i === 1 ? "col-span-2" : ""
                  }`}
                >
                  <span
                    aria-hidden="true"
                    data-glare
                    className="pointer-events-none absolute inset-0 opacity-0 bg-[radial-gradient(circle_at_var(--gx,50%)_var(--gy,50%),rgba(255,255,255,0.35),transparent_55%)]"
                  />
                  <div className="landing-settle absolute inset-0 -z-10">
                    <Image
                      src={DISH_PHOTOS[dish]}
                      alt={`${dish}, a Negros Occidental specialty`}
                      fill
                      sizes={i === 0 ? "(min-width: 768px) 560px, 100vw" : "(min-width: 768px) 280px, 50vw"}
                      className="object-cover transition-transform duration-1200 ease-out group-hover:scale-110"
                    />
                  </div>
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 bg-linear-to-t from-black/75 via-black/15 to-black/0"
                  />
                  <div className="absolute inset-x-4 bottom-4 flex flex-col items-start gap-1.5">
                    <span className="rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-[#3A2115] backdrop-blur">
                      {dish}
                    </span>
                    <p
                      className={`max-w-[42ch] text-white/90 ${
                        i === 0 ? "text-sm" : "line-clamp-2 text-xs"
                      }`}
                    >
                      {DISH_DETAILS[dish]}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------- pabakal: the chat, played as a conversation ---------- */}
        <section id="pabakal" data-reveal className={SECTION}>
          <div className="grid items-center gap-12 md:grid-cols-[0.95fr_1.05fr]">
            <div>
              <h2 data-words className={H2}>Pabakal. Just say what you need.</h2>
              <p className={LEAD}>
                Message what to buy and where. A rider shops for you and brings it
                to your door.
              </p>
              <ul className="mt-8 flex flex-col gap-4">
                {PABAKAL.points.map((point, i) => (
                  <li key={point} data-stagger className="flex items-start gap-3 text-base">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {i + 1}
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
              <a href="#app" data-stagger data-magnet className={`${secondaryButton} mt-8`}>
                Get the app
              </a>
            </div>

            {/* The real example: pabakal-sentences.test.ts reads it into these stops. */}
            <figure
              data-chat
              className="relative rounded-4xl border border-border bg-card p-5 shadow-[0_40px_80px_-50px_color-mix(in_srgb,var(--primary)_55%,transparent)] sm:p-7"
            >
              <figcaption className="sr-only">An example Pabakal chat</figcaption>
              <div className="flex flex-col gap-4">
                <p
                  data-chat-part="ask"
                  className="ml-auto max-w-[85%] rounded-3xl rounded-br-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground"
                >
                  {PABAKAL.example}
                </p>
                <div className="relative">
                <div
                  data-chat-part="typing"
                  aria-hidden="true"
                  className="invisible absolute top-0 left-0 flex w-16 gap-1.5 rounded-3xl rounded-bl-md bg-muted px-4 py-3 opacity-0"
                >
                  {[0, 1, 2].map((d) => (
                    <span key={d} data-dot className="h-2 w-2 rounded-full bg-muted-foreground/60" />
                  ))}
                </div>
                <div
                  data-chat-part="reply"
                  className="mr-auto w-full max-w-[85%] rounded-3xl rounded-bl-md bg-muted p-4 text-sm"
                >
                  <p className="font-semibold text-foreground">Got it. Your list:</p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {PABAKAL.stops.flatMap((stop) =>
                      stop.items.map((item) => (
                        <li
                          key={`${stop.store}-${item.name}`}
                          data-chat-part="row"
                          className="flex items-center justify-between gap-3 rounded-2xl bg-card px-3 py-2"
                        >
                          <span className="flex items-center gap-2">
                            <StoreIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                            <span className="font-semibold">{item.name}</span>
                            <span className="text-muted-foreground">at {stop.store}</span>
                          </span>
                          <span className="font-mono font-semibold">×{item.quantity}</span>
                        </li>
                      )),
                    )}
                  </ul>
                  <p data-chat-part="fee" className="mt-3 text-xs text-muted-foreground">
                    {PABAKAL.fee}
                  </p>
                </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  data-chat-replay
                  hidden
                  className="rounded-full bg-muted px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Play again
                </button>
              </div>
            </figure>
          </div>
        </section>

        {/* ---------- get the app: the brand red, as the app's own splash ---------- */}
        <section id="app" data-reveal className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-10 sm:px-6">
          <div data-spotlight className="landing-band relative grid overflow-hidden rounded-4xl bg-primary text-primary-foreground shadow-[0_30px_70px_-35px_color-mix(in_srgb,var(--primary)_70%,transparent)] md:grid-cols-[1.15fr_0.85fr]">
            <div className="flex flex-col items-start gap-5 p-8 sm:p-12">
              <Image
                src="/images/kabankalan/badge.png"
                alt=""
                width={96}
                height={96}
                data-pop
                className="h-20 w-20 drop-shadow-lg sm:h-24 sm:w-24"
              />
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Get the KFD app
              </h2>
              {APP_DOWNLOADS.android || APP_DOWNLOADS.iphone ? (
                <>
                  <p className="max-w-[44ch] text-base leading-relaxed opacity-90">
                    Order, pay and follow every step of your order from your phone.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {APP_DOWNLOADS.android ? (
                      <a href={APP_DOWNLOADS.android} data-magnet className={whiteButton}>
                        Download for Android
                      </a>
                    ) : null}
                    {APP_DOWNLOADS.iphone ? (
                      <a href={APP_DOWNLOADS.iphone} data-magnet className={whiteButton}>
                        Get it on iPhone
                      </a>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <p className="max-w-[44ch] text-base leading-relaxed opacity-90">
                    The app is almost ready for Kabankalan. Leave your number or
                    email and we will tell you the moment you can download it.
                  </p>
                  <div className="w-full max-w-md rounded-2xl bg-card p-4 text-left text-foreground shadow-lg sm:p-5">
                    <LeadForm kind="waitlist" submitLabel="Tell me when it is ready" />
                  </div>
                </>
              )}
            </div>
            <div className="relative hidden min-h-80 md:block">
              <Image
                src={KITCHEN_PHOTO}
                alt="A plate of chicken inasal with rice"
                data-zoom
                fill
                sizes="(min-width: 768px) 420px, 0px"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        {/* ---------- partners ---------- */}
        <section data-reveal className={SECTION}>
          <h2 data-words className={H2}>Grow with KFD</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <article
              id="sell"
              data-stagger
              className="scroll-mt-24 rounded-3xl bg-muted p-7 sm:p-8"
            >
              <span className="grid h-11 w-11 place-items-center rounded-full bg-card text-primary">
                <StoreIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-display text-2xl font-bold tracking-tight">Sell on KFD</h3>
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
              className="scroll-mt-24 rounded-3xl border border-border bg-card p-7 sm:p-8"
            >
              <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary">
                <BikeIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-display text-2xl font-bold tracking-tight">Drive with KFD</h3>
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
            <h2 data-words className={H2}>Questions</h2>
            <div className="mt-8 divide-y divide-border border-y border-border">
              {FAQ.map((item) => (
                <details key={item.q} data-stagger className="group py-5">
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
            <div className="mt-8 flex flex-col gap-2 text-base">
              {hasContactDetails() ? (
                <ul className="flex flex-col gap-2">
                  {CONTACT.messengerUrl ? (
                    <li>
                      <a href={CONTACT.messengerUrl} className="font-semibold text-primary underline underline-offset-2">
                        Message us on Messenger
                      </a>
                    </li>
                  ) : null}
                  {CONTACT.phone ? <li>Call or text {CONTACT.phone}</li> : null}
                  {CONTACT.email ? <li>Email {CONTACT.email}</li> : null}
                </ul>
              ) : null}
              <p className="text-muted-foreground">
                Something else?{" "}
                <Link href="/support" className="font-semibold text-primary underline underline-offset-2">
                  Visit the support page
                </Link>
              </p>
            </div>
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
              <span className="font-display text-xl font-bold">KFD</span>
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
            <Link href="/support" className="text-muted-foreground hover:text-foreground">
              Support
            </Link>
            <Link href="/track" className="text-muted-foreground hover:text-foreground">
              Track an order
            </Link>
          </nav>

          {hasContactDetails() || SOCIALS.length > 0 ? (
          <div className="flex flex-col gap-2 text-sm">
            <span className="font-semibold text-foreground">Contact</span>
            {CONTACT.messengerUrl ? (
              <a href={CONTACT.messengerUrl} className="text-muted-foreground hover:text-foreground">
                Messenger
              </a>
            ) : null}
            {CONTACT.phone ? <span className="text-muted-foreground">{CONTACT.phone}</span> : null}
            {CONTACT.email ? <span className="text-muted-foreground">{CONTACT.email}</span> : null}
            {SOCIALS.map((s) => (
              <a key={s.href} href={s.href} className="text-muted-foreground hover:text-foreground">
                {s.label}
              </a>
            ))}
          </div>
          ) : null}

          <div className="flex flex-col items-start gap-3 text-sm">
            <span className="font-semibold text-foreground">For staff</span>
            <Link href="/login?next=%2Fmerchant" className="text-muted-foreground hover:text-foreground">
              Open the merchant portal
            </Link>
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
        {/* The brand, large, rising letter by letter as the page ends. */}
        <div aria-hidden="true" className="overflow-hidden px-4 sm:px-6">
          <p
            data-wordmark
            className="mx-auto max-w-6xl text-center font-display text-[30vw] leading-[0.78] font-extrabold tracking-tighter text-primary select-none lg:text-[22rem]"
          >
            KFD
          </p>
        </div>
      </footer>
    </div>
  );
}
