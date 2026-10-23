import { test } from "node:test";
import assert from "node:assert/strict";
import { mayAnnouncePabakal, pabakalAlertBody } from "./pabakal-alert.ts";

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
