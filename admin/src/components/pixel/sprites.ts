/**
 * Pixel art primitives for the marketing surface.
 *
 * Sprites are stored as text grids and rendered as one absolutely-positioned
 * div per opaque cell. The alternative -- a single scaled-up bitmap -- blurs,
 * because the browser resamples the image and fractional edges land between
 * pixels. Discrete divs stay razor sharp at any multiple of CELL.
 *
 * Grid rules (learned the hard way in the mobile app):
 *   * every row MUST be exactly COLS characters. A hand-drawn grid with rows
 *     of 23/24/25 chars is what made the rider art look misaligned;
 *     `assertGrid` below turns that into a build-time error instead;
 *   * CELL must be an integer, or the edges rasterize into blur;
 *   * the rider faces right, so anything mirrored is mirrored deliberately.
 */

/** Rider on a scooter, 24x16, facing right. X = body, O = wheels. */
const RIDER: readonly string[] = [
  "........................",
  "..........XXXX..........",
  ".........XXXXXX.........",
  "........XXXXXXXX........",
  "........XX....XX........",
  ".......XXX...XXX........",
  "......XXXXX..XXXXXXX....",
  ".....XXXXXX..XXXXXXXX...",
  "......XXXXX...XXXXX.....",
  ".......XXXX....XXXX.....",
  "....XXXXXXXXXXXXXXXX....",
  "..OOOOOXXXXXXXXXXOOOOO..",
  "..OOOOO..........OOOOO..",
  "...OOO............OOO...",
  "........................",
  "........................",
];

/** Delivery scooter + rider, 32x14, facing right. Used as the hero sprite. */
const DELIVERY: readonly string[] = [
  "................................",
  "..........XXXXX.................",
  ".........XXXXXXX................",
  "........XXXXXXXXX...............",
  ".......XXX...XXXX...............",
  "......XXXX...XXXXX..............",
  "....XXXXXXXXXXXXXXXX............",
  "...XXXXXXXXXXXXXXXXXX...........",
  "..XXX..........XXXXXXXXX........",
  ".OOOO..........XXXXXXXXXX.......",
  ".OOOO.............OOOOOOO.......",
  "OOOO...............OOOOOOO......",
  "OOOOO..............OOOOOOO......",
  ".OOO...............OOOOOOO......",
];

/** Crate of food, 16x14. */
const CRATE: readonly string[] = [
  "................",
  "..GGGGGGGGGGGG..",
  ".G............G.",
  ".G.GGGGGGGGGG.G.",
  ".G.G........G.G.",
  ".G.G.IIIIII.G.G.",
  ".G.G.I....I.G.G.",
  ".G.G.I.FF.I.G.G.",
  ".G.G.I.FF.I.G.G.",
  ".G.G.I....I.G.G.",
  ".G.G.IIIIII.G.G.",
  ".G.GGGGGGGGGG.G.",
  ".G............G.",
  "..GGGGGGGGGGGG..",
];

/** Momo/palayok bowl, 14x10. */
const BOWL: readonly string[] = [
  "..............",
  "....FFFFFF....",
  "..FFCCCCCCFF..",
  ".FCCCCCCCCCCF.",
  ".FCCCDDDDCCCF.",
  "..CCCDDDDCCC..",
  "..WWWWWWWWWW..",
  ".WWWWWWWWWWWW.",
  "WWWWWWWWWWWWWW",
  "WWWWWWWWWWWWWW",
];

export type PixelSprite = {
  cols: number;
  rows: number;
  /** One string per row, each exactly `cols` characters. */
  cells: readonly string[];
};

export const RIDER_SPRITE: PixelSprite = {
  cols: 24,
  rows: 16,
  cells: RIDER,
};

export const DELIVERY_SPRITE: PixelSprite = {
  cols: 32,
  rows: 14,
  cells: DELIVERY,
};

export const CRATE_SPRITE: PixelSprite = {
  cols: 16,
  rows: 14,
  cells: CRATE,
};

export const BOWL_SPRITE: PixelSprite = {
  cols: 14,
  rows: 10,
  cells: BOWL,
};

/**
 * The rider's wheel contact row. The loading bar's top edge is pinned to this
 * row so the wheels never appear to float above the track.
 */
export const RIDER_CONTACT_ROW = 13;

/**
 * Rejects ragged sprite grids at module load. A mistyped row would otherwise
 * render as a subtly shifted sprite that is painful to debug from a screenshot.
 */
function assertGrid(name: string, sprite: PixelSprite): void {
  sprite.cells.forEach((row, i) => {
    if (row.length !== sprite.cols) {
      throw new Error(
        `Pixel sprite "${name}" row ${i} is ${row.length} chars, expected ${sprite.cols}`,
      );
    }
  });
  if (sprite.cells.length !== sprite.rows) {
    throw new Error(
      `Pixel sprite "${name}" has ${sprite.cells.length} rows, expected ${sprite.rows}`,
    );
  }
}

for (const [name, sprite] of [
  ["RIDER", RIDER_SPRITE],
  ["DELIVERY", DELIVERY_SPRITE],
  ["CRATE", CRATE_SPRITE],
  ["BOWL", BOWL_SPRITE],
] as const) {
  assertGrid(name, sprite);
}
