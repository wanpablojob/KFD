import { test } from "node:test";
import assert from "node:assert/strict";
import { applicationError, EMPTY_APPLICATION } from "./rider-apply.ts";

const ok = {
  ...EMPTY_APPLICATION,
  fullName: "Juan Dela Cruz",
  phone: "0917 123 4567",
  licenceRef: "G01-23-456789",
  orcrRef: "1234-5678",
};

test("a complete motorcycle application can be sent", () => {
  assert.equal(applicationError(ok), null);
  assert.equal(applicationError({ ...ok, phone: "+63 917-123-4567" }), null);
});

test("asks for the name, a mobile number, and the vehicle papers", () => {
  assert.equal(
    applicationError({ ...ok, fullName: " " }),
    "Enter your full name.",
  );
  assert.match(
    applicationError({ ...ok, phone: "123" }) ?? "",
    /mobile number/,
  );
  assert.match(applicationError({ ...ok, licenceRef: "" }) ?? "", /licence/);
  assert.match(applicationError({ ...ok, orcrRef: "" }) ?? "", /OR\/CR/);
});

test("a bicycle needs no licence or OR/CR", () => {
  assert.equal(
    applicationError({
      ...ok,
      vehicle: "bicycle",
      licenceRef: "",
      orcrRef: "",
    }),
    null,
  );
});
