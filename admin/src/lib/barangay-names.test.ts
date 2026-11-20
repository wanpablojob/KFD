import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBarangayNames } from "./barangay-names.ts";

test("a range expands to one barangay per number", () => {
  assert.deepEqual(parseBarangayNames("Barangay 1-3"), ["Barangay 1", "Barangay 2", "Barangay 3"]);
  assert.deepEqual(parseBarangayNames("Barangay 8 to 9"), ["Barangay 8", "Barangay 9"]);
});

test("commas and new lines separate names; repeats are dropped", () => {
  assert.deepEqual(parseBarangayNames(" Poblacion ,\nTabugon, poblacion,, "), ["Poblacion", "Tabugon"]);
});

test("a single name with a number stays as typed", () => {
  assert.deepEqual(parseBarangayNames("Barangay 4"), ["Barangay 4"]);
});
