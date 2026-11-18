import { cancelBlockedNote, cancelWarning, canCancel } from "./rider-cancellations";

jest.mock("./supabase", () => ({ supabase: {} }));

describe("rider cancellations", () => {
  it("warns on the 1st, gives a final warning on the 2nd, and blocks the 3rd", () => {
    expect(cancelWarning({ used: 0, limit: 2 })).toMatch(
      /^Warning: this is cancellation 1 of 2/
    );
    expect(cancelWarning({ used: 1, limit: 2 })).toMatch(/^Final warning/);
    expect(canCancel({ used: 1, limit: 2 })).toBe(true);
    expect(canCancel({ used: 2, limit: 2 })).toBe(false);
    expect(cancelWarning({ used: 2, limit: 2 })).toBeNull();
  });

  it("lets the server decide while the count is still loading", () => {
    expect(canCancel(undefined)).toBe(true);
    expect(cancelWarning(undefined)).toBeNull();
    expect(cancelBlockedNote(undefined)).toMatch(/2 jobs today/);
  });
});
