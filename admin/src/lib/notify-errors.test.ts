import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyNotifyStatus,
  notifyTransportFailure,
} from "./notify-errors.ts";

/**
 * Every distinct failure must get its own code, because each needs a different
 * person to act. Before this mapping existed the UI matched on prose, so
 * "you lack permission" and "email is not configured" rendered identically.
 */

test("401 and 403 mean a permission problem, not a broken email service", () => {
  for (const status of [401, 403]) {
    const f = classifyNotifyStatus(status);
    assert.equal(f.code, "unauthorized");
    assert.equal(f.retryable, false);
    assert.match(f.detail, /not allowed to send notifications/i);
  }
});

test("404 is a stale order id and is worth retrying after a refresh", () => {
  const f = classifyNotifyStatus(404);
  assert.equal(f.code, "not_found");
  assert.equal(f.retryable, true);
});

test("429 is a rate limit and is retryable", () => {
  const f = classifyNotifyStatus(429);
  assert.equal(f.code, "rate_limited");
  assert.equal(f.retryable, true);
});

test("5xx is a server fault and is retryable", () => {
  for (const status of [500, 502, 503]) {
    const f = classifyNotifyStatus(status);
    assert.equal(f.code, "service_error");
    assert.equal(f.retryable, true);
  }
});

test("other 4xx statuses fall back without claiming retryability", () => {
  const f = classifyNotifyStatus(400);
  assert.equal(f.code, "unknown");
  assert.equal(f.retryable, false);
});

test("a thrown request is a transport failure, distinct from any HTTP status", () => {
  const f = notifyTransportFailure();
  assert.equal(f.code, "unreachable");
  assert.equal(f.retryable, true);
});

test("no message leaks a provider name or raw response body", () => {
  const all = [
    classifyNotifyStatus(400),
    classifyNotifyStatus(401),
    classifyNotifyStatus(403),
    classifyNotifyStatus(404),
    classifyNotifyStatus(429),
    classifyNotifyStatus(500),
    notifyTransportFailure(),
  ];
  for (const f of all) {
    assert.doesNotMatch(f.detail, /resend|supabase|api[_-]?key|token|\{|\}/i);
    // Every message must make clear the order itself was saved.
    assert.match(f.detail, /^Order saved, but /);
  }
});
