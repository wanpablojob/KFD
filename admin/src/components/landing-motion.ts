"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const EASE = "power3.out";

/**
 * The landing page's scroll motion, in one place.
 *
 * Every tween starts after mount, so the server HTML and the no-JS page show
 * everything. Reduced motion never enters the matchMedia block, so nothing is
 * hidden or moved for those visitors. The hero's own entrance stays in CSS
 * (landing.css) because it must not flash before hydration.
 *
 * Hooks in the markup:
 *   data-reveal   a section that rises in; its [data-stagger] children follow
 *   data-tile     a gallery photo that wipes up into view
 *   data-line     the how-it-works progress line, drawn by scroll
 *   data-step     a step number that pops when the line reaches it
 *   data-chat     the Pabakal chat, played as a conversation
 *   data-tilt     the hero photo, which leans toward the pointer
 *   data-spin     the hero seal, turned by the scroll
 *   data-pop      a badge that springs in with its section
 *   data-zoom     a photo that settles from a zoom as it scrolls through
 */
export function useLandingMotion(
  scope: React.RefObject<HTMLDivElement | null>,
) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const q = gsap.utils.selector(scope);

        // Sections rise in, then their items follow one another.
        for (const section of q("[data-reveal]")) {
          const tl = gsap.timeline({
            defaults: { ease: EASE },
            scrollTrigger: { trigger: section, start: "top 85%", once: true },
          });
          tl.from(section, { autoAlpha: 0, y: 40, duration: 0.8 });
          const items = section.querySelectorAll("[data-stagger]");
          if (items.length)
            tl.from(
              items,
              { autoAlpha: 0, y: 28, duration: 0.7, stagger: 0.09 },
              "-=0.5",
            );
          const tiles = section.querySelectorAll("[data-tile]");
          if (tiles.length)
            tl.from(
              tiles,
              {
                clipPath: "inset(100% 0% 0% 0%)",
                y: 30,
                duration: 1,
                ease: "expo.out",
                stagger: 0.12,
                clearProps: "clipPath",
              },
              "-=0.5",
            );
          const pops = section.querySelectorAll("[data-pop]");
          if (pops.length)
            tl.from(
              pops,
              {
                scale: 0.4,
                rotate: -25,
                autoAlpha: 0,
                duration: 0.9,
                ease: "back.out(2)",
              },
              "-=0.6",
            );
        }

        // How it works: the line draws with the scroll, each number pops as
        // the line reaches it, so the order of the steps is the motion.
        const line = q("[data-line]")[0];
        if (line) {
          gsap.to(line, {
            scaleY: 1,
            ease: "none",
            scrollTrigger: {
              trigger: line.parentElement,
              start: "top 70%",
              end: "bottom 60%",
              scrub: 0.6,
            },
          });
          for (const step of q("[data-step]")) {
            gsap.from(step, {
              scale: 0,
              duration: 0.6,
              ease: "back.out(2.4)",
              scrollTrigger: { trigger: step, start: "top 72%", once: true },
            });
          }
        }

        // Pabakal: the customer types, KFD reads it back as a shopping list.
        const chat = q("[data-chat]")[0];
        if (chat) {
          const part = (name: string) =>
            chat.querySelectorAll(`[data-chat-part="${name}"]`);
          const typing = part("typing");
          const dots = chat.querySelectorAll("[data-dot]");
          const tl = gsap.timeline({
            defaults: { ease: EASE },
            scrollTrigger: { trigger: chat, start: "top 70%", once: true },
          });
          tl.from(part("ask"), {
            autoAlpha: 0,
            x: 40,
            scale: 0.92,
            transformOrigin: "100% 100%",
            duration: 0.6,
          })
            .to(typing, { autoAlpha: 1, duration: 0.2 }, "+=0.25")
            .to(
              dots,
              {
                y: -4,
                duration: 0.25,
                stagger: 0.12,
                yoyo: true,
                repeat: 3,
                ease: "sine.inOut",
              },
              "<",
            )
            .to(typing, { autoAlpha: 0, duration: 0.15 })
            .from(part("reply"), {
              autoAlpha: 0,
              x: -40,
              scale: 0.92,
              transformOrigin: "0% 100%",
              duration: 0.6,
            })
            .from(
              part("row"),
              { autoAlpha: 0, y: 12, duration: 0.45, stagger: 0.14 },
              "-=0.25",
            )
            .from(part("fee"), { autoAlpha: 0, y: 8, duration: 0.4 });
        }

        // Photos settle from a zoom as they pass through the viewport.
        for (const img of q("[data-zoom]")) {
          gsap.fromTo(
            img,
            { scale: 1.15 },
            {
              scale: 1,
              ease: "none",
              scrollTrigger: {
                trigger: img,
                start: "top bottom",
                end: "center center",
                scrub: true,
              },
            },
          );
        }

        // The hero seal turns a little as the page leaves the hero.
        for (const seal of q("[data-spin]")) {
          gsap.to(seal, {
            rotate: 40,
            ease: "none",
            scrollTrigger: {
              trigger: seal,
              start: "top 20%",
              end: "+=500",
              scrub: true,
            },
          });
        }
      });

      // The hero photo leans toward a mouse; touch screens keep it still.
      mm.add(
        "(prefers-reduced-motion: no-preference) and (pointer: fine)",
        () => {
          const card = gsap.utils.selector(scope)("[data-tilt]")[0] as
            HTMLElement | undefined;
          if (!card) return;
          gsap.set(card, { transformPerspective: 900 });
          const rx = gsap.quickTo(card, "rotationX", {
            duration: 0.6,
            ease: EASE,
          });
          const ry = gsap.quickTo(card, "rotationY", {
            duration: 0.6,
            ease: EASE,
          });
          const onMove = (e: PointerEvent) => {
            const r = card.getBoundingClientRect();
            ry(((e.clientX - r.left) / r.width - 0.5) * 8);
            rx(((e.clientY - r.top) / r.height - 0.5) * -8);
          };
          const onLeave = () => {
            rx(0);
            ry(0);
          };
          card.addEventListener("pointermove", onMove);
          card.addEventListener("pointerleave", onLeave);
          return () => {
            card.removeEventListener("pointermove", onMove);
            card.removeEventListener("pointerleave", onLeave);
          };
        },
      );

      return () => mm.revert();
    },
    { scope },
  );
}
