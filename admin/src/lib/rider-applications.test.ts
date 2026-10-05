import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPLICATION_WAITING_WARNING_DAYS,
  classifyDocumentRef,
  formatWaiting,
  isWaitingTooLong,
  waitingDays,
} from "./rider-applications.ts";

const NOW = new Date("2026-10-05T12:00:00Z");

test("waiting days counts whole days elapsed", () => {
  assert.equal(waitingDays("2026-10-02T12:00:00Z", NOW), 3);
  assert.equal(waitingDays("2026-10-04T12:00:00Z", NOW), 1);
  assert.equal(waitingDays("2026-10-05T11:00:00Z", NOW), 0);
});

test("a partial day is not a day", () => {
  // 23 hours is not "1 day". Rounding up would make everything overdue.
  assert.equal(waitingDays("2026-10-04T13:00:00Z", NOW), 0);
});

test("an unparseable date reads as today rather than NaN", () => {
  assert.equal(waitingDays("not a date", NOW), 0);
  assert.equal(waitingDays("2026-10-06T00:00:00Z", NOW), 0);
});

test("the overdue threshold is inclusive and matches the constant", () => {
  assert.equal(isWaitingTooLong(APPLICATION_WAITING_WARNING_DAYS), true);
  assert.equal(isWaitingTooLong(APPLICATION_WAITING_WARNING_DAYS - 1), false);
  assert.equal(waitingDays("2026-09-30T12:00:00Z", NOW) >= APPLICATION_WAITING_WARNING_DAYS, true);
});

test("waiting copy spells the number out", () => {
  assert.equal(formatWaiting("2026-10-05T06:00:00Z", NOW), "Today");
  assert.equal(formatWaiting("2026-10-04T12:00:00Z", NOW), "Waiting 1 day");
  assert.equal(formatWaiting("2026-10-01T12:00:00Z", NOW), "Waiting 4 days");
});

test("an http link is linkified", () => {
  const result = classifyDocumentRef("https://example.com/licence.pdf", "Licence");
  assert.equal(result.kind, "link");
  assert.equal(result.kind === "link" && result.href, "https://example.com/licence.pdf");
});

test("dangerous schemes are not linkified", () => {
  // new URL() accepts all three of these, so parsing alone is not a filter.
  for (const ref of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
  ]) {
    const result = classifyDocumentRef(ref, "Licence");
    assert.equal(result.kind, "text", `${ref} was treated as a link`);
  }
});

test("an opaque identifier stays copyable text", () => {
  const result = classifyDocumentRef("LIC-2024-8891", "Licence");
  assert.equal(result.kind, "text");
  assert.equal(result.kind === "text" && result.label, "LIC-2024-8891");
});

test("an empty reference is reported as missing, not as an empty link", () => {
  assert.equal(classifyDocumentRef(null, "Licence").kind, "missing");
  assert.equal(classifyDocumentRef("   ", "Licence").kind, "missing");
});