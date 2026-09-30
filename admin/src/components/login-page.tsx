"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { LoginForm } from "@/components/login-form";
import { DirectionsIcon } from "@/components/ui/icons";

gsap.registerPlugin(useGSAP);

export function LoginPage({
  next,
  message,
}: {
  next: string | null;
  message: string | null;
}) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.fromTo(
        "[data-curtain='top']",
        { yPercent: 0 },
        { yPercent: -100, duration: 1.05, ease: "power4.inOut" },
        0,
      )
        .fromTo(
          "[data-curtain='bottom']",
          { yPercent: 0 },
          { yPercent: 100, duration: 1.05, ease: "power4.inOut" },
          0,
        )
        .fromTo(
          "[data-reveal='backdrop']",
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 1 },
          0.5,
        )
        .fromTo(
          "[data-reveal='card']",
          { y: 46, autoAlpha: 0, filter: "blur(8px)" },
          {
            y: 0,
            autoAlpha: 1,
            filter: "blur(0px)",
            duration: 0.9,
            stagger: 0.09,
          },
          0.7,
        )
        .fromTo(
          "[data-reveal='footer']",
          { autoAlpha: 0, y: 12 },
          { autoAlpha: 1, y: 0, duration: 0.7 },
          1.15,
        );

      if (reduced) return;

      gsap.to("[data-grid]", {
        yPercent: 35,
        duration: 26,
        ease: "none",
        repeat: -1,
      });

      gsap.to("[data-radar]", {
        scale: 1.9,
        autoAlpha: 0,
        duration: 3,
        ease: "power1.out",
        repeat: -1,
        transformOrigin: "center",
      });

      gsap.to("[data-orb='a']", {
        x: 46,
        y: -34,
        duration: 11,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });

      gsap.to("[data-orb='b']", {
        x: -52,
        y: 40,
        duration: 13,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });

      if (window.matchMedia("(pointer: fine)").matches) {
        const toX = gsap.quickTo("[data-orb='c']", "x", { duration: 0.9, ease: "power3.out" });
        const toY = gsap.quickTo("[data-orb='c']", "y", { duration: 0.9, ease: "power3.out" });
        scope.current?.addEventListener("mousemove", (e) => {
          const r = scope.current!.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width - 0.5) * 36;
          const y = ((e.clientY - r.top) / r.height - 0.5) * 36;
          toX(x);
          toY(y);
        });
      }
    },
    { scope },
  );

  return (
    <div ref={scope} className="relative min-h-screen overflow-hidden bg-background">
      {/* Curtain entrance */}
      <div data-curtain="top" className="fixed inset-x-0 top-0 z-50 h-1/2 bg-muted" />
      <div data-curtain="bottom" className="fixed inset-x-0 bottom-0 z-50 h-1/2 bg-muted" />

      {/* ---- Full-page live backdrop ---- */}
      <div data-reveal="backdrop" className="absolute inset-0">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 15% 0%, color-mix(in srgb, var(--primary) 30%, transparent) 0%, transparent 55%), radial-gradient(90% 70% at 90% 100%, rgba(242,160,7,0.28) 0%, transparent 60%), radial-gradient(60% 50% at 60% 50%, rgba(249,115,22,0.14) 0%, transparent 70%)",
          }}
        />

        <div
          data-grid
          className="pointer-events-none absolute inset-x-0 top-0 h-[200%] opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(rgba(var(--ring) / 0.22) 1px, transparent 1.4px)",
            backgroundSize: "28px 28px",
          }}
        />

        <div data-orb="a" className="pointer-events-none absolute -left-16 top-1/3 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
        <div data-orb="b" className="pointer-events-none absolute -right-10 bottom-1/4 h-80 w-80 rounded-full bg-orange-500/10 blur-3xl" />
        <div data-orb="c" className="pointer-events-none absolute right-1/4 top-1/5 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />

        <div className="pointer-events-none absolute right-[12%] top-[14%] h-14 w-14">
          <div data-radar className="absolute inset-0 rounded-full border border-primary/50" />
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-primary/10">
            <span className="block h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_16px_var(--primary)]" />
          </div>
        </div>

        {/* Dim for card contrast */}
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* ---- Centered sign-in ---- */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-12 sm:px-12">
        <div className="flex items-center gap-3">
          <Image
            src="/images/kabankalan/logo.jpg"
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 rounded-xl bg-white/90 object-contain p-1 shadow-lg shadow-black/50"
          />
          <span className="text-xl font-bold tracking-tight text-white">
            KFD <span className="font-medium text-amber-300">Portal</span>
          </span>
        </div>

        <div data-reveal="card" className="mt-8 w-full max-w-sm">
          <div className="rounded-2xl border border-border/80 bg-white/95 p-8 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.5)] backdrop-blur-xl xl:p-9">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <DirectionsIcon className="h-3 w-3 text-[#b90e1f]" />
              Admin &amp; merchant
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to the Kabankalan Food Delivery console. You will land on
              the dashboard that matches your account.
            </p>

            <div className="mt-8">
              <LoginForm next={next} message={message} />
            </div>

            <div className="mt-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Secured by Supabase Auth
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        </div>

        <p data-reveal="footer" className="mt-6 text-center text-xs text-white/60">
          © {new Date().getFullYear()} KFD — Kabankalan City Proper, Negros
          Occidental
        </p>
        <p data-reveal="footer" className="mt-3 text-center text-xs">
          <Link
            href="/welcome"
            className="text-white/60 underline underline-offset-4 transition-colors hover:text-white"
          >
            New here? See what KFD does
          </Link>
        </p>
      </div>
    </div>
  );
}