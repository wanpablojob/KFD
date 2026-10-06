import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CUSTOMER_LIST_PARAMS,
  customerListParamsToSearch,
  customerViewChangeResetsPage,
  parseCustomerListParams,
} from "./customer-list-params.ts";

test("an empty URL is the default view", () => {
  assert.deepEqual(parseCustomerListParams(""), DEFAULT_CUSTOMER_LIST_PARAMS);
});

test("round-trips every facet", () => {
  const params = parseCustomerListParams(
    "?tier=gold&city=Kabankalan%20City%20Proper&state=blocked&q=maria&sort=totalSpend&dir=desc&page=3",
  );
  assert.equal(params.tier, "gold");
  assert.equal(params.city, "Kabankalan City Proper");
  assert.equal(params.state, "blocked");
  assert.equal(params.query, "maria");
  assert.equal(params.sort, "totalSpend");
  assert.equal(params.dir, "desc");
  assert.equal(params.page, 3);
});

test("defaults are omitted so the common URL stays clean", () => {
  assert.equal(customerListParamsToSearch(DEFAULT_CUSTOMER_LIST_PARAMS), "");
  assert.equal(
    customerListParamsToSearch({ ...DEFAULT_CUSTOMER_LIST_PARAMS, tier: "gold" }),
    "?tier=gold",
  );
});

test("a hand-edited URL cannot put the page in an unrenderable state", () => {
  const params = parseCustomerListParams(
    "?tier=platinum&state=vip&sort=dropped&dir=sideways&page=-4&page=nonsense",
  );
  assert.equal(params.tier, "all");
  assert.equal(params.state, "all");
  assert.equal(params.sort, "name");
  assert.equal(params.dir, "asc");
  assert.equal(params.page, 1);
});

test("a tier facet and a state facet are independent", () => {
  // The row an operator most wants is a Gold customer who is blocked. A single
  // enum filter could not express that.
  const params = parseCustomerListParams("?tier=gold&state=blocked");
  assert.equal(params.tier, "gold");
  assert.equal(params.state, "blocked");
});

test("changing any view resets the page, so page 3 does not stay on page 3", () => {
  const base = parseCustomerListParams("?page=3");

  for (const next of [
    { tier: "gold" },
    { city: "Somewhere" },
    { state: "blocked" },
    { query: "x" },
    { sort: "totalSpend" },
    { dir: "desc" },
  ] as const) {
    const candidate = { ...base, ...next };
    assert.equal(
      customerViewChangeResetsPage(base, candidate),
      true,
      `expected a reset for ${JSON.stringify(next)}`,
    );
  }

  // Re-rendering the same view must not bounce the operator back to page 1.
  assert.equal(customerViewChangeResetsPage(base, { ...base }), false);
});