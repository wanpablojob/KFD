import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeEvent, sortActivity } from "./rider-activity.ts";
import type { RiderActivityEvent } from "./types.ts";

function event(
  overrides: Partial<RiderActivityEvent> & { id: number; event: string },
): RiderActivityEvent {
  return {
    detail: null,
    actorEmail: null,
    changedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("describeEvent", () => {
  it("renders a status change as before to after", () => {
    const described = describeEvent(
      event({
        id: 1,
        event: "rider.status_changed",
        detail: { from: "offline", to: "online" },
      }),
    );
    assert.equal(described.label, "Status changed to online");
    assert.equal(described.detail, "offline → online");
    assert.equal(described.tone, "normal");
  });

  it("shows the suspension reason", () => {
    const described = describeEvent(
      event({
        id: 2,
        event: "rider.suspended",
        detail: { reason: "Two failed deliveries" },
      }),
    );
    assert.equal(described.label, "Suspended");
    assert.equal(described.detail, "Two failed deliveries");
    assert.equal(described.tone, "warning");
  });

  it("reports a missing suspension reason rather than rendering empty", () => {
    const described = describeEvent(
      event({ id: 3, event: "rider.suspended", detail: { reason: "  " } }),
    );
    assert.equal(described.detail, null);
  });

  it("tolerates a null detail", () => {
    assert.equal(describeEvent(event({ id: 4, event: "rider.unsuspended" })).detail, null);
  });

  it("marks revocation as a warning and attach as normal", () => {
    assert.equal(
      describeEvent(event({ id: 5, event: "rider.access_revoked" })).tone,
      "warning",
    );
    assert.equal(
      describeEvent(event({ id: 6, event: "rider.access_attached" })).tone,
      "normal",
    );
  });

  it("shows the application approval note when there is one", () => {
    const described = describeEvent(
      event({
        id: 7,
        event: "rider.application_approved",
        detail: { note: "Documents verified by phone" },
      }),
    );
    assert.equal(described.label, "Application approved");
    assert.equal(described.detail, "Documents verified by phone");
  });

  it("does not repeat the note id in the note_added label", () => {
    const described = describeEvent(
      event({ id: 8, event: "rider.note_added", detail: { note_id: 42 } }),
    );
    assert.equal(described.label, "Note added");
    assert.equal(described.detail, null);
  });

  it("renders an unknown event instead of dropping it", () => {
    const described = describeEvent(event({ id: 9, event: "rider.some_new_thing" }));
    assert.equal(described.label, "rider some new thing");
  });

  it("ignores non-string detail values", () => {
    const described = describeEvent(
      event({ id: 10, event: "rider.suspended", detail: { reason: 7 } }),
    );
    assert.equal(described.detail, null);
  });
});

describe("sortActivity", () => {
  it("orders newest first", () => {
    const sorted = sortActivity([
      event({ id: 1, event: "rider.unsuspended", changedAt: "2026-01-01T00:00:00Z" }),
      event({ id: 2, event: "rider.suspended", changedAt: "2026-01-03T00:00:00Z" }),
      event({ id: 3, event: "rider.note_added", changedAt: "2026-01-02T00:00:00Z" }),
    ]);
    assert.deepEqual(
      sorted.map((entry) => entry.id),
      [2, 3, 1],
    );
  });

  it("breaks ties on id so same-millisecond events stay stable", () => {
    const sorted = sortActivity([
      event({ id: 4, event: "rider.note_added" }),
      event({ id: 9, event: "rider.note_added" }),
    ]);
    assert.deepEqual(
      sorted.map((entry) => entry.id),
      [9, 4],
    );
  });

  it("does not mutate its input", () => {
    const input = [
      event({ id: 1, event: "rider.note_added", changedAt: "2026-01-01T00:00:00Z" }),
      event({ id: 2, event: "rider.note_added", changedAt: "2026-01-02T00:00:00Z" }),
    ];
    sortActivity(input);
    assert.equal(input[0].id, 1);
  });

  it("falls back to id order when a timestamp is unparseable", () => {
    const sorted = sortActivity([
      event({ id: 1, event: "rider.note_added", changedAt: "not-a-date" }),
      event({ id: 2, event: "rider.note_added", changedAt: "also-not-a-date" }),
    ]);
    assert.deepEqual(
      sorted.map((entry) => entry.id),
      [2, 1],
    );
  });
});