"use client";

import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText, Draggable);

const EASE = "power3.out";

/**
 * The landing page's motion, in one place.
 *
 * Every tween starts after mount, so the server HTML and the no-JS page show
 * everything. Reduced motion never enters the matchMedia blocks, so nothing is
 * hidden or moved for those visitors; pointer effects also need a mouse. The
 * hero's own entrance stays in CSS (landing.css) because it must not flash
 * before hydration, so the hero motion here only ever adds to it.
 *
 * Hooks in the markup:
 *   data-reveal         a section that rises in; its [data-stagger] children follow
 *   data-tile           a gallery photo that wipes up, then tilts under the mouse
 *   data-glare          the light that follows the mouse across a tile
 *   data-line           the how-it-works progress line, drawn by scroll
 *   data-step           a step number that pops when the line reaches it
 *   data-chat           the Pabakal chat, played as a conversation
 *   data-chat-replay    plays the chat again (hidden until this runs)
 *   data-words          a heading whose words light up with the scroll
 *   data-marquee-track  the dish names, sped up and skewed by scroll speed
 *   data-rider          the pixel rider riding the edge of the tracking band
 *   data-float          a dish orbiting the hero photo, with depth to the mouse
 *   data-tilt           the hero photo, which leans toward the pointer
 *   data-spin           the hero seal: turned by the scroll, and draggable
 *   data-magnet         a button that leans toward the mouse
 *   data-pop            a badge that springs in with its section
 *   data-zoom           a photo that settles from a zoom as it scrolls through
 */
export function useLandingMotion(
  scope: React.RefObject<HTMLDivElement | null>,
) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const q = gsap.utils.selector(scope);
        const off: (() => void)[] = [];
        const on = (el: Element, type: string, fn: EventListener) => {
          el.addEventListener(type, fn);
          off.push(() => el.removeEventListener(type, fn));
        };

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

        // The hero headline does a wave once the CSS entrance has landed.
        const h1 = q("h1")[0];
        if (h1) {
          const split = SplitText.create(h1, {
            type: "words",
            wordsClass: "landing-word",
          });
          gsap.to(split.words, {
            y: -10,
            duration: 0.3,
            ease: "power2.out",
            stagger: 0.06,
            yoyo: true,
            repeat: 1,
            delay: 1.1,
          });
        }

        // Section headings light up word by word as they scroll in.
        for (const heading of q("[data-words]")) {
          const split = SplitText.create(heading, { type: "words" });
          gsap.from(split.words, {
            opacity: 0.15,
            stagger: 0.12,
            ease: "none",
            scrollTrigger: {
              trigger: heading,
              start: "top 85%",
              end: "top 50%",
              scrub: true,
            },
          });
        }

        // Dishes orbit the hero photo: they pop in after it, then bob.
        const floats = q("[data-float]");
        if (floats.length) {
          gsap.from(floats, {
            scale: 0,
            autoAlpha: 0,
            duration: 0.8,
            ease: "back.out(2)",
            stagger: 0.12,
            delay: 0.9,
          });
          floats.forEach((f, i) =>
            gsap.to(f.firstElementChild, {
              y: i % 2 ? 10 : -10,
              rotate: i % 2 ? -6 : 6,
              duration: 2.4 + i * 0.4,
              ease: "sine.inOut",
              yoyo: true,
              repeat: -1,
            }),
          );
        }

        // The dish names run sideways; scrolling speeds them up, turns them
        // around when you scroll back, and leans them with the speed.
        const track = q("[data-marquee-track]")[0];
        if (track) {
          const loop = gsap.to(track, {
            xPercent: -50,
            ease: "none",
            duration: 30,
            repeat: -1,
          });
          // Start far into the repeats, so running backwards never hits 0.
          loop.totalTime(loop.duration() * 100);
          const skew = gsap.quickTo(track, "skewX", {
            duration: 0.4,
            ease: EASE,
          });
          const lean = gsap.utils.clamp(-12, 12);
          ScrollTrigger.create({
            start: 0,
            end: "max",
            onUpdate: (self) => {
              const v = self.getVelocity();
              loop.timeScale(
                self.direction * (1 + Math.min(Math.abs(v) / 300, 5)),
              );
              gsap.to(loop, {
                timeScale: self.direction,
                duration: 0.8,
                ease: "power1.out",
                overwrite: true,
              });
              skew(lean(v / -250));
            },
          });
          const settle = () => skew(0);
          ScrollTrigger.addEventListener("scrollEnd", settle);
          off.push(() =>
            ScrollTrigger.removeEventListener("scrollEnd", settle),
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

        // A rider rides the top edge of the tracking band as it scrolls by,
        // facing the way you scroll.
        const rider = q("[data-rider]")[0];
        if (rider?.parentElement) {
          const lane = rider.parentElement;
          const face = rider.firstElementChild;
          gsap.to(rider, {
            x: () => lane.offsetWidth - rider.offsetWidth,
            ease: "none",
            scrollTrigger: {
              trigger: lane,
              start: "top bottom",
              end: "bottom top",
              scrub: 0.5,
              invalidateOnRefresh: true,
              onUpdate: (self) => gsap.set(face, { scaleX: self.direction }),
            },
          });
          gsap.to(face, {
            y: -2,
            duration: 0.18,
            yoyo: true,
            repeat: -1,
            ease: "sine.inOut",
          });
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

          const replay =
            chat.querySelector<HTMLButtonElement>("[data-chat-replay]");
          if (replay) {
            replay.hidden = false;
            on(replay, "click", () => tl.restart());
            off.push(() => (replay.hidden = true));
          }
        }

        // FAQ answers slide open and shut instead of jumping.
        for (const details of q("details") as HTMLDetailsElement[]) {
          const summary = details.querySelector("summary");
          const body = details.querySelector("p");
          if (!summary || !body) continue;
          on(summary, "click", (e) => {
            e.preventDefault();
            if (!details.open) {
              details.open = true;
              gsap.fromTo(
                body,
                { height: 0, marginTop: 0, autoAlpha: 0, overflow: "hidden" },
                {
                  height: "auto",
                  marginTop: 12,
                  autoAlpha: 1,
                  duration: 0.45,
                  ease: EASE,
                  clearProps: "all",
                },
              );
            } else {
              gsap.to(body, {
                height: 0,
                marginTop: 0,
                autoAlpha: 0,
                overflow: "hidden",
                duration: 0.3,
                ease: "power2.in",
                onComplete: () => {
                  details.open = false;
                  gsap.set(body, { clearProps: "all" });
                },
              });
            }
          });
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

        return () => off.forEach((fn) => fn());
      });

      // Mouse only: touch screens keep these still, and dragging the seal
      // would fight the scroll.
      mm.add(
        "(prefers-reduced-motion: no-preference) and (pointer: fine)",
        () => {
          const q = gsap.utils.selector(scope);
          const off: (() => void)[] = [];
          const on = (
            el: Element,
            type: string,
            fn: (e: PointerEvent) => void,
          ) => {
            el.addEventListener(type, fn as EventListener);
            off.push(() => el.removeEventListener(type, fn as EventListener));
          };

          // Lean an element toward the pointer, with an optional glare.
          const tilt = (
            el: HTMLElement,
            max: number,
            glare?: Element | null,
          ) => {
            gsap.set(el, { transformPerspective: 900 });
            const rx = gsap.quickTo(el, "rotationX", {
              duration: 0.6,
              ease: EASE,
            });
            const ry = gsap.quickTo(el, "rotationY", {
              duration: 0.6,
              ease: EASE,
            });
            on(el, "pointermove", (e) => {
              const r = el.getBoundingClientRect();
              const px = (e.clientX - r.left) / r.width;
              const py = (e.clientY - r.top) / r.height;
              ry((px - 0.5) * max);
              rx((py - 0.5) * -max);
              if (glare)
                gsap.to(glare, {
                  "--gx": `${px * 100}%`,
                  "--gy": `${py * 100}%`,
                  opacity: 1,
                  duration: 0.3,
                });
            });
            on(el, "pointerleave", () => {
              rx(0);
              ry(0);
              if (glare) gsap.to(glare, { opacity: 0, duration: 0.4 });
            });
          };

          const card = q("[data-tilt]")[0] as HTMLElement | undefined;
          if (card) tilt(card, 8);
          for (const tile of q("[data-tile]") as HTMLElement[])
            tilt(tile, 12, tile.querySelector("[data-glare]"));

          // Buttons lean toward the mouse and spring back when it leaves.
          for (const btn of q("[data-magnet]") as HTMLElement[]) {
            const x = gsap.quickTo(btn, "x", { duration: 0.4, ease: EASE });
            const y = gsap.quickTo(btn, "y", { duration: 0.4, ease: EASE });
            on(btn, "pointermove", (e) => {
              const r = btn.getBoundingClientRect();
              x((e.clientX - r.left - r.width / 2) * 0.35);
              y((e.clientY - r.top - r.height / 2) * 0.35);
            });
            on(btn, "pointerleave", () => {
              gsap.to(btn, {
                x: 0,
                y: 0,
                duration: 0.8,
                ease: "elastic.out(1, 0.4)",
              });
            });
          }

          // The orbiting dishes drift against the mouse, the nearer ones more.
          const hero = q("#top")[0];
          const floats = q("[data-float]") as HTMLElement[];
          if (hero && floats.length) {
            const movers = floats.map((f) => ({
              depth: Number(f.dataset.float) || 20,
              x: gsap.quickTo(f, "x", { duration: 0.9, ease: EASE }),
              y: gsap.quickTo(f, "y", { duration: 0.9, ease: EASE }),
            }));
            on(hero, "pointermove", (e) => {
              const nx = e.clientX / window.innerWidth - 0.5;
              const ny = e.clientY / window.innerHeight - 0.5;
              for (const m of movers) {
                m.x(nx * -m.depth);
                m.y(ny * -m.depth);
              }
            });
          }

          // Each headline word hops when the mouse touches it.
          for (const word of q(".landing-word")) {
            on(word, "pointerenter", () => {
              if (gsap.isTweening(word)) return;
              gsap.to(word, {
                y: -14,
                rotate: gsap.utils.random(-8, 8),
                duration: 0.22,
                ease: "power2.out",
                yoyo: true,
                repeat: 1,
              });
            });
          }

          // The seal can be pulled off the photo; it springs back on release.
          const drags = q("[data-spin]").flatMap((seal) =>
            Draggable.create(seal, {
              onRelease() {
                gsap.to(this.target, {
                  x: 0,
                  y: 0,
                  duration: 1.2,
                  ease: "elastic.out(1, 0.35)",
                });
              },
            }),
          );

          return () => {
            off.forEach((fn) => fn());
            drags.forEach((d) => d.kill());
          };
        },
      );

      return () => mm.revert();
    },
    { scope },
  );
}
