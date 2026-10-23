import { dueToReport, OFF_JOB_MS, ON_JOB_MS, updatedAgo } from "./rider-location";

jest.mock("expo-location", () => ({}));
jest.mock("./supabase", () => ({ supabase: {} }));

describe("dueToReport", () => {
  it("sends at once, then every 30 s on a job and every 2 min off one", () => {
    expect(dueToReport(null, true, 0)).toBe(true);
    expect(dueToReport(0, true, ON_JOB_MS - 1)).toBe(false);
    expect(dueToReport(0, true, ON_JOB_MS)).toBe(true);
    expect(dueToReport(0, false, ON_JOB_MS)).toBe(false);
    expect(dueToReport(0, false, OFF_JOB_MS)).toBe(true);
  });
});

describe("updatedAgo", () => {
  it("rounds down to whole minutes", () => {
    const now = new Date("2026-10-23T10:05:30Z").getTime();
    expect(updatedAgo("2026-10-23T10:05:10Z", now)).toBe("just now");
    expect(updatedAgo("2026-10-23T10:02:00Z", now)).toBe("3 min ago");
  });
});
