import type { CSSProperties } from "react";
import {
  BOWL_SPRITE,
  CRATE_SPRITE,
  DELIVERY_SPRITE,
  RIDER_CONTACT_ROW,
  RIDER_SPRITE,
  type PixelSprite,
} from "./sprites";

/**
 * Renders a sprite as one div per opaque cell.
 *
 * Cells are memoized into React elements rather than re-derived on each render,
 * because a 32x18 sprite is ~200 nodes and GSAP re-renders its targets on every
 * tick. `data-pixel-cell` is also the hook ScrollReveal and the loading screen
 * use to target the sprite without adding layout-thrashing transforms to the
 * parent.
 */
function useCells(sprite: PixelSprite, palette: Record<string, string>) {
  return sprite.cells.flatMap((row, y) =>
    row.split("").map((char, x) => {
      if (char === ".") return null;
      const color = palette[char];
      if (!color) return null;
      return (
        <span
          key={`${x}-${y}`}
          data-pixel-cell=""
          aria-hidden="true"
          style={{
            position: "absolute",
            left: x * CELL,
            top: y * CELL,
            width: CELL,
            height: CELL,
            backgroundColor: color,
          }}
        />
      );
    }),
  );
}

/** Integer cell size. A fractional value rasterizes the sprite into blur. */
const CELL = 4;

const RIDER_PALETTE = {
  X: "var(--primary)",
  O: "var(--primary-hover)",
};

const DELIVERY_PALETTE = {
  X: "var(--primary)",
  O: "var(--primary-hover)",
};

const CRATE_PALETTE = {
  G: "var(--secondary)",
  I: "var(--card)",
  F: "var(--primary)",
};

const BOWL_PALETTE = {
  W: "var(--secondary)",
  C: "var(--gold)",
  D: "var(--primary)",
  F: "var(--card)",
};

type SpriteProps = {
  className?: string;
  style?: CSSProperties;
  title?: string;
};

/** Pixel rider, 24x16 grid, facing right. */
export function PixelRider({ className, style, title }: SpriteProps) {
  const cells = useCells(RIDER_SPRITE, RIDER_PALETTE);
  return (
    <span
      className={className}
      style={{
        position: "relative",
        display: "block",
        width: RIDER_SPRITE.cols * CELL,
        height: RIDER_SPRITE.rows * CELL,
        imageRendering: "pixelated",
        ...style,
      }}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      {cells}
    </span>
  );
}

/** Delivery scooter, 32x18 grid, facing right. */
export function PixelScooter({ className, style, title }: SpriteProps) {
  const cells = useCells(DELIVERY_SPRITE, DELIVERY_PALETTE);
  return (
    <span
      className={className}
      style={{
        position: "relative",
        display: "block",
        width: DELIVERY_SPRITE.cols * CELL,
        height: DELIVERY_SPRITE.rows * CELL,
        imageRendering: "pixelated",
        ...style,
      }}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      {cells}
    </span>
  );
}

/** Crate of food, 16x14 grid. */
export function PixelCrate({ className, style, title }: SpriteProps) {
  const cells = useCells(CRATE_SPRITE, CRATE_PALETTE);
  return (
    <span
      className={className}
      style={{
        position: "relative",
        display: "block",
        width: CRATE_SPRITE.cols * CELL,
        height: CRATE_SPRITE.rows * CELL,
        imageRendering: "pixelated",
        ...style,
      }}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      {cells}
    </span>
  );
}

/** Bowl, 14x10 grid. */
export function PixelBowl({ className, style, title }: SpriteProps) {
  const cells = useCells(BOWL_SPRITE, BOWL_PALETTE);
  return (
    <span
      className={className}
      style={{
        position: "relative",
        display: "block",
        width: BOWL_SPRITE.cols * CELL,
        height: BOWL_SPRITE.rows * CELL,
        imageRendering: "pixelated",
        ...style,
      }}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      {cells}
    </span>
  );
}

export { CELL as PIXEL_CELL, RIDER_CONTACT_ROW };
