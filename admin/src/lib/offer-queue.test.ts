import { test } from "node:test";
import assert from "node:assert/strict";
import { offerQueueFilter } from "./offer-queue.ts";

test("claims the order's rows, the trip's rows, or both", () => {
  assert.equal(offerQueueFilter({ orderId: "ORD-1" }), "order_id.eq.ORD-1");
  assert.equal(offerQueueFilter({ deliveryId: "d_9" }), "delivery_id.eq.d_9");
  assert.equal(
    offerQueueFilter({ orderId: "ORD-1", deliveryId: "d_9" }),
    "order_id.eq.ORD-1,delivery_id.eq.d_9",
  );
});

test("never builds an empty or injectable filter", () => {
  assert.equal(offerQueueFilter({}), null);
  assert.equal(offerQueueFilter({ orderId: null, deliveryId: "" }), null);
  assert.equal(offerQueueFilter({ orderId: "a,rider_id.neq.x" }), null);
  assert.equal(
    offerQueueFilter({ orderId: "a)", deliveryId: "d1" }),
    "delivery_id.eq.d1",
  );
});
