import { setPendingIntent, takePendingIntent } from "./pending-intent";

describe("pending intent", () => {
  it("is handed over once, then cleared", () => {
    expect(takePendingIntent()).toBeNull();
    setPendingIntent("rider-apply");
    expect(takePendingIntent()).toBe("rider-apply");
    expect(takePendingIntent()).toBeNull();
  });
});
