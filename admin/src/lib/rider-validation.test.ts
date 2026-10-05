import { test } from "node:test";
import assert from "node:assert/strict";
import {
  friendlyRiderSaveError,
  isValidEmail,
  isValidPhMobile,
  normalisePhone,
  validateRiderFields,
} from "./rider-validation.ts";

test("accepts both Philippine mobile formats", () => {
  assert.equal(isValidPhMobile("09171234567"), true);
  assert.equal(isValidPhMobile("+639171234567"), true);
});

test("strips the separators people actually type", () => {
  assert.equal(normalisePhone("+63 (917) 123-4567"), "+639171234567");
  assert.equal(normalisePhone("0917 123 4567"), "09171234567");
  assert.equal(isValidPhMobile("+63 (917) 123-4567"), true);
});

test("rejects the shapes that are not PH mobiles", () => {
  // Landline, too short, too long, and a Singapore number.
  assert.equal(isValidPhMobile("0917123456"), false);
  assert.equal(isValidPhMobile("091712345678"), false);
  assert.equal(isValidPhMobile("(02) 8123 4567"), false);
  assert.equal(isValidPhMobile("+65917123456"), false);
  assert.equal(isValidPhMobile(""), false);
});

test("email check is about the obvious mistakes, not exotic valid ones", () => {
  assert.equal(isValidEmail("rider@kfd.com"), true);
  assert.equal(isValidEmail("a.b+c@sub.example.co"), true);
  assert.equal(isValidEmail("rider@kfd"), false);
  assert.equal(isValidEmail("rider @kfd.com"), false);
  assert.equal(isValidEmail("@kfd.com"), false);
  assert.equal(isValidEmail("rider@kfd.com "), true);
});

test("a blank phone is reported even though the column is optional", () => {
  // dispatch and the customer both read this number, so a rider with no phone
  // is a rider nobody can reach. Required in practice.
  const errors = validateRiderFields(
    { name: "R", email: "r@kfd.com", phone: "", city: "C" },
    [],
  );
  assert.deepEqual(
    errors.map((e) => e.field),
    ["phone"],
  );
});

test("city is required", () => {
  const errors = validateRiderFields(
    { name: "R", email: "r@kfd.com", phone: "09171234567", city: "  " },
    [],
  );
  assert.deepEqual(
    errors.map((e) => e.field),
    ["city"],
  );
});

test("a duplicate email is caught before the request", () => {
  const errors = validateRiderFields(
    { name: "R", email: "taken@kfd.com", phone: "09171234567", city: "C" },
    ["taken@kfd.com", "other@kfd.com"],
  );
  assert.equal(errors.length, 1);
  assert.equal(errors[0].field, "email");
  assert.match(errors[0].message, /already uses/i);
});

test("duplicate detection ignores case and surrounding space", () => {
  const errors = validateRiderFields(
    { name: "R", email: " TAKEN@KFD.com ", phone: "09171234567", city: "C" },
    ["taken@kfd.com"],
  );
  assert.equal(errors[0].field, "email");
});

test("editing a rider without changing their email is not a duplicate", () => {
  const errors = validateRiderFields(
    { name: "R", email: "taken@kfd.com", phone: "09171234567", city: "C" },
    ["taken@kfd.com"],
    "taken@kfd.com",
  );
  assert.deepEqual(errors, []);
});

test("a unique-violation error is replaced with a sentence an admin can act on", () => {
  const raw =
    'duplicate key value violates unique constraint "riders_email_key" (23505)';
  const friendly = friendlyRiderSaveError(new Error(raw));
  assert.equal(friendly, "Another rider already uses this email address.");
  // The constraint name must not survive into the UI.
  assert.doesNotMatch(String(friendly), /riders_email_key|23505/);
});

test("an unrecognised failure is not swallowed by the duplicate handler", () => {
  // Returning null lets the caller show the real message; returning a generic
  // duplicate would send an admin hunting for an email clash that isn't there.
  assert.equal(friendlyRiderSaveError(new Error("network request failed")), null);
  assert.equal(friendlyRiderSaveError(new Error("permission denied")), null);
});