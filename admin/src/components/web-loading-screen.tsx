"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { PixelRider, PIXEL_CELL, RIDER_CONTACT_ROW } from "@/components/pixel/sprites-render";

gsap.registerPlugin(useGSAP);

/**
 * Web port of the mobile loading screen (mobile/src/screens/loading-screen.tsx).
 *
 * The same 24x16 rider sprite, the same bar-under-the-wheels geometry, and the
 * same DVD-style bounce -- only the animation engine differs, because React
 * Native's Animated has no web equivalent worth emulating.
 *
 * Geometry is carried over from mobile so the two loaders read as one product:
 *   bar width 232, cell size 5, so the track is 232 + rider width and the
 *   rider's top edge starts at the left end of the track.
 */
const BAR_W = 232;
const BAR_H = 5;
const RIDER_W = 24 * PIXEL_CELL;
const RIDER_H = 16 * PIXEL_CELL;
const TRACK = BAR_W + RIDER_W;
const CYCLE = 2.6;

export function WebLoadingScreen({
  message,
  onDone,
}: {
  message?: string;
  /** Fires once the rider has crossed the track. Drives the auth handoff. */
  onDone?: () => void;
}) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const tl = gsap.timeline({ defaults: { ease: "none" } });

      if (reduced) {
        // No travel: show the rider parked at the start and finish promptly.
        gsap.set("[data-load-rider]", { x: 0, y: 0 });
        gsap.set("[data-load-bar]", { x: 0, y: RIDER_CONTACT_ROW * PIXEL_CELL + PIXEL_CELL });
        if (onDone) gsap.delayedCall(0.4, onDone);
        return;
      }

      // Rider crosses the bar, bar follows, and both bounce on the same clock.
      // A single repeating timeline keeps the bar welded to the wheels instead
      // of two independent loops drifting apart after a few cycles.
      tl.to("[data-load-group]", { x: TRACK, duration: CYCLE }, 0)
        .to("[data-load-hop]", { y: -PIXEL_CELL * 2, duration: CYCLE / 4, ease: "power2.out" }, 0)
        .to("[data-load-hop]", { y: 0, duration: (CYCLE / 4) * 3, ease: "bounce.out" }, CYCLE / 4)
        .to("[data-load-group]", { x: 0, duration: CYCLE }, CYCLE)
        .to("[data-load-hop]", { y: -PIXEL_CELL * 2, duration: CYCLE / 4, ease: "power2.out" }, CYCLE)
        .to("[data-load-hop]", { y: 0, duration: (CYCLE / 4) * 3, ease: "bounce.out" }, CYCLE + CYCLE / 4)
        .repeat(-1);

      // onDone is a handoff to the caller (sign-in), not part of the loop, so
      // it gets its own one-shot call rather than an onComplete on a timeline
      // that never completes.
      if (onDone) {
        const fire = gsap.delayedCall(1, onDone);
        return () => {
          fire.kill();
        };
      }

      gsap.fromTo(
        "[data-load-wordmark]",
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: 0.6, ease: "power3.out" },
      );
    },
    { scope, dependencies: [] },
  );

  return (
    <div
      ref={scope}
      className="pixel-page flex min-h-dvh w-full flex-col items-center justify-center gap-8 px-6"
    >
      <div className="flex flex-col items-center gap-3">
        <span
          data-load-wordmark
          className="pixel-title text-5xl font-bold text-foreground sm:text-6xl"
        >
          KFD
        </span>
        <span className="pixel-eyebrow">Kabankalan Food Delivery</span>
      </div>

      <div
        className="relative"
        style={{ width: TRACK, height: RIDER_H, maxWidth: "100%" }}
        role="status"
        aria-live="polite"
        aria-label={message ?? "Loading"}
      >
        {/* The bar sits under the wheels and shares the rider's transform via
            the parent group, so it can never separate mid-bounce. */}
        <div
          data-load-group
          className="absolute left-0 top-0 h-full w-full"
          style={{ willChange: "transform" }}
        >
          <div
            data-load-bar
            className="absolute left-0 bg-primary"
            style={{ width: BAR_W, height: BAR_H, top: RIDER_CONTACT_ROW * PIXEL_CELL + PIXEL_CELL }}
          />
          <div data-load-rider className="absolute left-0 top-0">
            <div data-load-hop>
              <PixelRider title="Delivery rider" />
            </div>
          </div>
        </div>
      </div>

      {message ? (
        <p className="pixel-body text-sm tracking-widest text-muted-foreground uppercase">
          {message}
        </p>
      ) : null}
    </div>
  );
}
