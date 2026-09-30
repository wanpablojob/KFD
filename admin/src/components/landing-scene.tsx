"use client";

import { useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { SignInDropdown } from "@/components/sign-in-dropdown";
import { PixelBowl, PixelCrate, PixelScooter } from "@/components/pixel/sprites-render";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const PILLARS = [
  {
    sprite: "crate",
    title: "Real kitchens",
    body: "Menus priced by the merchant and read straight from the menu table, so what a customer orders is what the kitchen is paid for.",
  },
  {
    sprite: "bowl",
    title: "Live tracking",
    body: "Every order carries a high-entropy reference. Customers follow status and rider assignment without an account.",
  },
  {
    sprite: "scooter",
    title: "Assigned riders",
    body: "Riders are provisioned against a real account, then attached to a restaurant or dispatched, with status the dispatch board can trust.",
  },
] as const;

const STATS = [
  { value: "24x16", label: "rider sprite" },
  { value: "0", label: "client-trusted prices" },
  { value: "3", label: "portals" },
] as const;

export function LandingScene() {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (reduced) {
        gsap.set("[data-reveal], [data-stagger]", { autoAlpha: 1, y: 0 });
        return;
      }

      // Hero: wordmark, copy and sprite arrive in sequence, then the scooter
      // rolls. Scoped to the hero so it does not fight the scroll reveals.
      const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
      intro
        .fromTo("[data-hero-eyebrow]", { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5 })
        .fromTo(
          "[data-hero-title]",
          { autoAlpha: 0, y: 28, filter: "blur(6px)" },
          { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.8 },
          "-=0.25",
        )
        .fromTo(
          "[data-hero-copy]",
          { autoAlpha: 0, y: 16 },
          { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.12 },
          "-=0.4",
        )
        .fromTo(
          "[data-hero-sprite]",
          { autoAlpha: 0, x: -40 },
          { autoAlpha: 1, x: 0, duration: 0.7, ease: "back.out(1.6)" },
          "-=0.5",
        );

      // Idle drift on the hero scooter, so the page is not static once loaded.
      gsap.to("[data-hero-sprite]", {
        y: -8,
        duration: 1.4,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });

      // Scroll reveals. each: true so every card animates as it enters rather
      // than the whole row snapping in together.
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.fromTo(
          el,
          { autoAlpha: 0, y: 40 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.7,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 85%", once: true },
          },
        );
      });

      gsap.utils.toArray<HTMLElement>("[data-stagger]").forEach((group) => {
        gsap.fromTo(
          group.querySelectorAll("[data-stagger-item]"),
          { autoAlpha: 0, y: 32 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.6,
            stagger: 0.12,
            ease: "power3.out",
            scrollTrigger: { trigger: group, start: "top 82%", once: true },
          },
        );
      });
    },
    { scope },
  );

  return (
    <div ref={scope} className="pixel-page pixel-scanlines relative min-h-dvh">
      {/* ---------- header ---------- */}
      <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-6">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2">
            <PixelBowl title="KFD" />
            <span className="pixel-title text-2xl">KFD</span>
          </span>
        </div>
        <nav className="flex items-center gap-3">
          <Link href="/track" className="pixel-btn pixel-btn-secondary pixel-focus">
            Track order
          </Link>
          <SignInDropdown />
        </nav>
      </header>

      {/* ---------- hero ---------- */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-10 pb-20 sm:pt-20">
        <div className="grid items-center gap-12 md:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col gap-6">
            <span data-hero-eyebrow className="pixel-eyebrow">
              Kabankalan City
            </span>
            <h1
              data-hero-title
              className="pixel-title text-4xl leading-tight font-bold sm:text-6xl"
            >
              Food delivery,
              <br />
              block by block.
            </h1>
            <p data-hero-copy className="pixel-body max-w-xl text-base sm:text-lg">
              KFD connects Kabankalan&apos;s restaurants, riders and customers in one
              system. Menus, orders and dispatch — priced and routed on the server,
              never in the app.
            </p>
            <div data-hero-copy className="flex flex-wrap items-center gap-4">
              <Link href="/login?next=%2Fmerchant" className="pixel-btn pixel-btn-primary pixel-focus">
                Open the merchant portal
              </Link>
              <Link href="/track" className="pixel-btn pixel-btn-secondary pixel-focus">
                Track a delivery
              </Link>
            </div>
          </div>

          <div className="flex justify-center md:justify-end">
            <div
              data-hero-sprite
              className="pixel-checker pixel-card flex items-center justify-center p-8"
            >
              <PixelScooter title="KFD delivery scooter" />
            </div>
          </div>
        </div>
      </section>

      <div className="pixel-rule mx-auto w-full max-w-6xl" />

      {/* ---------- stats ---------- */}
      <section data-stagger className="relative z-10 mx-auto w-full max-w-6xl px-6 py-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              data-stagger-item
              className="pixel-card flex flex-col items-center gap-1 px-6 py-8 text-center"
            >
              <span className="pixel-title text-3xl">{stat.value}</span>
              <span className="pixel-eyebrow">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- pillars ---------- */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 py-16">
        <h2 data-reveal className="pixel-title mb-10 text-2xl font-bold sm:text-3xl">
          How it fits together
        </h2>
        <div data-stagger className="grid gap-6 md:grid-cols-3">
          {PILLARS.map((pillar) => (
            <article
              key={pillar.title}
              data-stagger-item
              className="pixel-card pixel-card-hover flex flex-col gap-4 p-6"
            >
              <span className="flex h-16 items-center">
                {pillar.sprite === "crate" ? (
                  <PixelCrate title="" />
                ) : pillar.sprite === "bowl" ? (
                  <PixelBowl title="" />
                ) : (
                  <PixelScooter title="" />
                )}
              </span>
              <h3 className="text-lg font-bold">{pillar.title}</h3>
              <p className="pixel-body text-sm">{pillar.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- roles ---------- */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 py-16">
        <div data-reveal className="pixel-card flex flex-col items-start gap-6 p-8 sm:p-12">
          <h2 className="pixel-title text-2xl font-bold sm:text-3xl">Three doors, one system</h2>
          <p className="pixel-body max-w-2xl text-sm">
            Admins run the whole platform, merchants run their own kitchen, and
            customers track without an account. Access is decided on the server —
            signing in as one role never grants another.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/login?next=%2F" className="pixel-btn pixel-btn-primary pixel-focus">
              Admin sign in
            </Link>
            <Link href="/login?next=%2Fmerchant" className="pixel-btn pixel-btn-secondary pixel-focus">
              Merchant sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10">
        <div className="pixel-body flex flex-col items-start justify-between gap-3 text-xs sm:flex-row">
          <span>Kabankalan Food Delivery</span>
          <span>Built block by block.</span>
        </div>
      </footer>
    </div>
  );
}
