import { test } from "node:test";
import assert from "node:assert/strict";
import { riderProfilePatch } from "./rider-profile.ts";

/**
 * The edit form used to send deliveries, rating and earnings back to the server.
 *
 * That is a lost-update bug with money in it: the form reads those three off the
 * row as it was when the page loaded, so a rider who completed two deliveries
 * while an admin had the dialog open had their counter rolled back to the older
 * value on save. Editing a phone number must not touch a payout.
 *
 * These are the tests that pin that shut. They assert on the *absence* of keys,
 * which is the only way to catch it: a type that made the fields optional would
 * still compile if a future caller passed them.
 */

test("sends only the five profile fields", () => {
  const patch = riderProfilePatch({
    name: "Ana Reyes",
    email: "ana@example.com",
    phone: "09171234567",
    city: "Kabankalan City",
    vehicle: "motorcycle",
  });
  assert.deepEqual(Object.keys(patch).sort(), [
    "city",
    "email",
    "name",
    "phone",
    "vehicle",
  ]);
});

test("cannot carry deliveries, rating or earnings, even if the caller has them", () => {
  const patch = riderProfilePatch({
    name: "Ana Reyes",
    email: "ana@example.com",
    phone: "09171234567",
    city: "Kabankalan City",
    vehicle: "motorcycle",
    deliveries: 10,
    rating: 4.5,
    earnings: 4820.5,
  } as never);

  // The three columns the payout ledger owns. If this ever fails, an edit is
  // about to overwrite earned money with a stale read.
  assert.equal("deliveries" in patch, false);
  assert.equal("rating" in patch, false);
  assert.equal("earnings" in patch, false);
});

test("cannot carry status, which has its own control and its own audit row", () => {
  // Status decides whether dispatch offers this rider work, and 0050/0051 record
  // a change to it. Editing a name must not silently take a rider offline.
  const patch = riderProfilePatch({
    name: "Ana Reyes",
    email: "ana@example.com",
    phone: "09171234567",
    city: "Kabankalan City",
    vehicle: "motorcycle",
    status: "offline",
  } as never);
  assert.equal("status" in patch, false);
});

test("normalises a missing phone to an empty string", () => {
  // riders.phone is nullable, but sending undefined leaves the column
  // untouched, which would make an emptied field look like it failed to save.
  assert.equal(
    riderProfilePatch({
      name: "Ana",
      email: "a@example.com",
      vehicle: "bicycle",
    }).phone,
    "",
  );
});

test("trims the text fields", () => {
  const patch = riderProfilePatch({
    name: "  Ana Reyes  ",
    email: "  ana@example.com ",
    phone: " 09171234567 ",
    city: " Kabankalan City ",
    vehicle: "motorcycle",
  });
  assert.equal(patch.name, "Ana Reyes");
  assert.equal(patch.email, "ana@example.com");
  assert.equal(patch.phone, "09171234567");
  assert.equal(patch.city, "Kabankalan City");
});

test("defaults a missing city the same way creation does", () => {
  assert.equal(
    riderProfilePatch({ name: "Ana", email: "a@example.com", vehicle: "bicycle" })
      .city,
    "Kabankalan City Proper",
  );
});