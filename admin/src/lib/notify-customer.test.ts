import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCustomerEmail, type CustomerLookup } from "./notify-customer.ts";

type Row = { user_id?: string; name?: string; email?: string | null };

/**
 * A stand-in that records every `.eq()` so a test can assert not just the answer
 * but which column the lookup asked for. The column is the whole bug: the same
 * query returns the right email here and the wrong one when it filters on name.
 */
function fakeLookup(rows: Row[]) {
  const asked: { column: string; value: string }[] = [];
  const client: CustomerLookup = {
    from: () => ({
      select: () => ({
        eq: (column: string, value: string) => {
          asked.push({ column, value });
          const match = rows.find(
            (r) => r[column as "user_id" | "name"] === value,
          );
          return {
            maybeSingle: async () => ({
              data: match ? { email: match.email ?? null } : null,
            }),
          };
        },
      }),
    }),
  };
  return { client, asked };
}

const order = {
  customer: "Maria Santos",
  customer_user_id: "auth-uuid-1",
};

test("joins on the auth account id, not the name", async () => {
  const { client, asked } = fakeLookup([
    {
      user_id: "auth-uuid-1",
      name: "Maria Santos",
      email: "maria@example.com",
    },
  ]);

  assert.equal(await resolveCustomerEmail(client, order), "maria@example.com");
  assert.deepEqual(asked[0], { column: "user_id", value: "auth-uuid-1" });
  assert.equal(
    asked.some((q) => q.column === "name"),
    false,
  );
});

test("still delivers after the customer is renamed", async () => {
  // The regression, stated as a test: the name on the order is stale, the
  // account id is not, and the lookup must not consult the name at all.
  const { client, asked } = fakeLookup([
    {
      user_id: "auth-uuid-1",
      name: "Maria Santos-Cruz",
      email: "maria@example.com",
    },
  ]);

  assert.equal(
    await resolveCustomerEmail(client, {
      customer: "Maria Santos",
      customer_user_id: "auth-uuid-1",
    }),
    "maria@example.com",
  );
  assert.equal(
    asked.some((q) => q.column === "name"),
    false,
  );
});

test("does not hand one customer's mail to another with the same name", async () => {
  const { client, asked } = fakeLookup([
    {
      user_id: "auth-uuid-1",
      name: "Maria Santos",
      email: "maria1@example.com",
    },
    {
      user_id: "auth-uuid-2",
      name: "Maria Santos",
      email: "maria2@example.com",
    },
  ]);

  assert.equal(await resolveCustomerEmail(client, order), "maria1@example.com");
  assert.equal(
    asked.some((q) => q.column === "name"),
    false,
  );
});

test("falls back to the name for orders predating the account link", async () => {
  const { client, asked } = fakeLookup([
    { name: "Maria Santos", email: "maria@example.com" },
  ]);

  assert.equal(
    await resolveCustomerEmail(client, {
      customer: "Maria Santos",
      customer_user_id: null,
    }),
    "maria@example.com",
  );
  assert.deepEqual(asked, [{ column: "name", value: "Maria Santos" }]);
});

test("falls back when the account id matches no customer row", async () => {
  // The deleted-auth-account case: the order kept a uuid that
  // customers.user_id no longer holds, so the primary lookup finds nothing.
  const { client } = fakeLookup([
    { name: "Maria Santos", email: "legacy@example.com" },
  ]);

  assert.equal(await resolveCustomerEmail(client, order), "legacy@example.com");
});

test("returns null when no customer can be identified", async () => {
  const { client } = fakeLookup([
    { user_id: "someone-else", name: "Other", email: "o@e.com" },
  ]);

  assert.equal(await resolveCustomerEmail(client, order), null);
  assert.equal(
    await resolveCustomerEmail(client, {
      customer: null,
      customer_user_id: null,
    }),
    null,
  );
});
