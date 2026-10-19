import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAll, PAGE_SIZE } from "./fetch-all.ts";

/** A fake table of `total` rows served in the requested ranges. */
function table(total: number) {
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    const data = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i);
    return { data, error: null };
  };
  return { page, calls };
}

test("reads past the first page instead of stopping at the cap", async () => {
  const { page, calls } = table(PAGE_SIZE * 2 + 5);
  const rows = await fetchAll(page);
  assert.equal(rows.length, PAGE_SIZE * 2 + 5);
  assert.equal(rows.at(-1), PAGE_SIZE * 2 + 4);
  assert.equal(calls.length, 3);
});

test("asks once more when the last page is exactly full", async () => {
  const { page, calls } = table(PAGE_SIZE);
  assert.equal((await fetchAll(page)).length, PAGE_SIZE);
  assert.equal(calls.length, 2);
});

test("passes a query error through rather than returning a partial list", async () => {
  await assert.rejects(
    fetchAll(async () => ({ data: null, error: { message: "boom" } })),
    /boom/,
  );
});
