import { collapseAuthError, isCredentialFailure } from "./auth-errors";

describe("collapseAuthError", () => {
  it("collapses wrong-credential replies into one generic message", () => {
    expect(collapseAuthError("Invalid login credentials")).toBe(
      "Incorrect email or password."
    );
  });

  it("collapses email-not-confirmed into the same generic message", () => {
    expect(collapseAuthError("Email not confirmed")).toBe(
      "Incorrect email or password."
    );
  });

  it("is case-insensitive about the failure text", () => {
    expect(collapseAuthError("INVALID LOGIN CREDENTIALS")).toBe(
      "Incorrect email or password."
    );
  });

  it("passes unrelated messages through unchanged", () => {
    expect(collapseAuthError("Rate limit exceeded.")).toBe("Rate limit exceeded.");
  });
});

describe("isCredentialFailure", () => {
  it("matches credential failure wording", () => {
    expect(isCredentialFailure("Email not confirmed")).toBe(true);
    expect(isCredentialFailure("boom")).toBe(false);
  });
});
