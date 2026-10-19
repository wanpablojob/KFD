import { resetFormError } from "./password-reset";

describe("resetFormError", () => {
  it("accepts a 6-digit code and a matching password", () => {
    expect(resetFormError(" 123456 ", "secret1", "secret1")).toBeNull();
  });

  it("refuses a code that is not exactly 6 digits", () => {
    expect(resetFormError("12345", "secret1", "secret1")).toMatch(/6-digit/);
    expect(resetFormError("12a456", "secret1", "secret1")).toMatch(/6-digit/);
  });

  it("applies the sign-up password rules", () => {
    expect(resetFormError("123456", "short", "short")).toMatch(/at least 6/);
    expect(resetFormError("123456", "secret1", "secret2")).toMatch(/do not match/);
  });
});
