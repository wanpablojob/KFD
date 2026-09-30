import test from "node:test";
import assert from "node:assert/strict";

// Relative with an explicit extension, not the "@/" alias: this runs under
// `node --test`, which resolves neither the tsconfig paths mapping nor an
// extensionless specifier.
import {
  BOWL_SPRITE,
  CRATE_SPRITE,
  DELIVERY_SPRITE,
  RIDER_CONTACT_ROW,
  RIDER_SPRITE,
  type PixelSprite,
} from "../components/pixel/sprites.ts";

const ALL: Array<[string, PixelSprite]> = [
  ["RIDER", RIDER_SPRITE],
  ["DELIVERY", DELIVERY_SPRITE],
  ["CRATE", CRATE_SPRITE],
  ["BOWL", BOWL_SPRITE],
];

/**
 * A ragged row shifts every cell after it by one column, which reads as a
 * subtly broken sprite and is miserable to debug from a screenshot. Two ragged
 * rows were written and caught only because the module asserts at load; this
 * pins the invariant so an edit to the art cannot reintroduce it.
 */
test("every sprite row is exactly the declared width", () => {
  for (const [name, sprite] of ALL) {
    sprite.cells.forEach((row, i) => {
      assert.equal(
        row.length,
        sprite.cols,
        `${name} row ${i} is ${row.length} chars, expected ${sprite.cols}`,
      );
    });
  }
});

test("every sprite has exactly the declared number of rows", () => {
  for (const [name, sprite] of ALL) {
    assert.equal(sprite.cells.length, sprite.rows, `${name} row count`);
  }
});

test("sprite grids only use characters the renderer can resolve", () => {
  // The renderer maps a char to a palette colour and drops anything missing, so
  // an unknown character would silently punch a hole in the art.
  const allowed = new Set("XOGIFWCD.");
  for (const [name, sprite] of ALL) {
    for (const row of sprite.cells) {
      for (const char of row) {
        assert.ok(allowed.has(char), `${name} contains unknown sprite char "${char}"`);
      }
    }
  }
});

test("no sprite has a fully transparent row inside its body", () => {
  // A blank row in the middle is almost always a typo rather than intent.
  for (const [name, sprite] of ALL) {
    sprite.cells.forEach((row, i) => {
      const isEdge = i === 0 || i === sprite.cells.length - 1;
      const isContactTail =
        name === "RIDER" && i >= RIDER_CONTACT_ROW + 1;
      if (!isEdge && !isContactTail) {
        assert.ok(row.includes("X") || /[OGIFWCD]/.test(row), `${name} row ${i} is blank`);
      }
    });
  }
});

test("the rider's contact row has wheels touching the bar", () => {
  const row = RIDER_SPRITE.cells[RIDER_CONTACT_ROW];
  assert.ok(row, "contact row must exist");
  assert.ok(row.includes("O"), "contact row must carry wheel pixels");
});
