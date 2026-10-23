import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mayAnnouncePabakal,
  mayAnnouncePabakalStatus,
  pabakalAlertBody,
  pabakalStatusNotice,
} from "./pabakal-alert.ts";

const row = {
  customer_user_id: "u1",
  status: "open",
  store: "Mercury Drug, Citi",
  stops: [{ store: "Mercury Drug" }, { store: "Citi" }, { store: "Bakery" }],
};

test("only the customer, only while the pabakal is open", () => {
  assert.equal(mayAnnouncePabakal("u1", row), true);
  assert.equal(mayAnnouncePabakal("u2", row), false);
  assert.equal(mayAnnouncePabakal("u1", { ...row, status: "accepted" }), false);
  assert.equal(
    mayAnnouncePabakal("u1", { ...row, customer_user_id: null }),
    false,
  );
});

test("names the first store and how many more", () => {
  assert.equal(
    pabakalAlertBody(row),
    "Buy from Mercury Drug + 2 more. Open Available to take it.",
  );
  assert.equal(
    pabakalAlertBody({ ...row, stops: [], store: "Watsons" }),
    "Buy from Watsons. Open Available to take it.",
  );
});

test("the customer hears each step of their pabakal", () => {
  const base = {
    reference: "#PBK-1",
    item_cost: null,
    delivery_fee: 40,
    pabakal_fee: 10,
    cancel_reason: null,
  };
  assert.equal(
    pabakalStatusNotice({ ...base, status: "accepted" })?.title,
    "A rider took your pabakal",
  );
  assert.equal(
    pabakalStatusNotice({ ...base, status: "delivering", item_cost: 245.5 })
      ?.body,
    "Receipt ₱245.50. Pay ₱295.50 in cash when it arrives.",
  );
  assert.equal(
    pabakalStatusNotice({
      ...base,
      status: "cancelled",
      cancel_reason: "Store closed",
    })?.body,
    "#PBK-1: Store closed",
  );
  assert.equal(pabakalStatusNotice({ ...base, status: "open" }), null);
});

test("only the assigned rider or an admin announces a step", () => {
  assert.equal(
    mayAnnouncePabakalStatus({ userId: "r1", role: "rider" }, "r1"),
    true,
  );
  assert.equal(
    mayAnnouncePabakalStatus({ userId: "r2", role: "rider" }, "r1"),
    false,
  );
  assert.equal(
    mayAnnouncePabakalStatus({ userId: "c1", role: "customer" }, null),
    false,
  );
  assert.equal(
    mayAnnouncePabakalStatus({ userId: "a1", role: "admin" }, null),
    true,
  );
});
