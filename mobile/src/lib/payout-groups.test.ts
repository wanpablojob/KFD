import {
  BUCKET_ORDER,
  bucketTotal,
  dayBucket,
  groupPayoutsByDay,
  needsRiderAttention,
} from "./payout-groups";

const now = new Date(2026, 4, 15, 23, 30); // 15 May 2026, 11:30pm local

function at(day: number, hour: number, minute = 0): string {
  return new Date(2026, 4, day, hour, minute, 0).toISOString();
}

describe("dayBucket", () => {
  it("puts a payout from earlier today in today, even at 11pm", () => {
    expect(dayBucket(at(15, 2), now)).toBe("today");
  });

  it("puts a payout from just after midnight in today", () => {
    expect(dayBucket(at(15, 0, 5), now)).toBe("today");
  });

  it("puts yesterday's evening in yesterday", () => {
    expect(dayBucket(at(14, 23, 50), now)).toBe("yesterday");
  });

  it("puts everything older in earlier", () => {
    expect(dayBucket(at(13, 12), now)).toBe("earlier");
  });

  it("treats an unparseable timestamp as earlier rather than throwing", () => {
    expect(dayBucket("not-a-date", now)).toBe("earlier");
  });

  it("uses local calendar days, not a 24-hour window", () => {
    // A payout 30 hours ago is two calendar days ago, and under a timestamp
    // comparison it would be called "today". The rider would then see last
    // night's money under today's heading.
    const thirtyHoursAgo = new Date(now.getTime() - 30 * 3_600_000);
    expect(dayBucket(thirtyHoursAgo.toISOString(), now)).toBe("yesterday");
  });
});

describe("groupPayoutsByDay", () => {
  const rows = [
    { order_id: "a", earned_at: at(15, 9), amount: 10 },
    { order_id: "b", earned_at: at(15, 11), amount: 15 },
    { order_id: "c", earned_at: at(14, 18), amount: 20 },
    { order_id: "d", earned_at: at(10, 8), amount: 30 },
  ];

  it("returns sections in today, yesterday, earlier order", () => {
    expect(groupPayoutsByDay(rows, now).map((g) => g.bucket)).toEqual([
      "today",
      "yesterday",
      "earlier",
    ]);
  });

  it("keeps row order inside a section", () => {
    const today = groupPayoutsByDay(rows, now)[0];
    expect(today.rows.map((r) => r.order_id)).toEqual(["a", "b"]);
  });

  it("drops empty sections instead of rendering an empty heading", () => {
    const onlyToday = [{ order_id: "a", earned_at: at(15, 9), amount: 10 }];
    expect(groupPayoutsByDay(onlyToday, now).map((g) => g.bucket)).toEqual(["today"]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupPayoutsByDay([], now)).toEqual([]);
  });

  it("always covers the sections in the same order the screen renders them", () => {
    expect(BUCKET_ORDER).toEqual(["today", "yesterday", "earlier"]);
  });
});

describe("bucketTotal", () => {
  it("sums a section for its heading", () => {
    const group = {
      bucket: "today" as const,
      rows: [
        { order_id: "a", earned_at: at(15, 9), amount: 10 },
        { order_id: "b", earned_at: at(15, 11), amount: 15.5 },
      ],
    };
    expect(bucketTotal(group)).toBe(25.5);
  });

  it("is zero for an empty section", () => {
    expect(bucketTotal({ bucket: "earlier", rows: [] })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 0075: the 24-hour dispute window
// ---------------------------------------------------------------------------
// Only a disputed payout earns a badge. Marking pending_review would put a
// "under review" chip on every single row the rider ever sees, since that is the
// state all new deliveries land in -- and a badge that is always on is not
// information.

test("a disputed payout is the only state that needs the rider's attention", () => {
  expect(needsRiderAttention("disputed")).toBe(true);
});

test("every other state is ordinary money and stays unlabelled", () => {
  expect(needsRiderAttention("pending_review")).toBe(false);
  expect(needsRiderAttention("settled")).toBe(false);
  expect(needsRiderAttention("reversed")).toBe(false);
});

test("an absent state is not attention-worthy", () => {
  // Pre-0075 rows have no state at all, and this is the safe direction: missing
  // a badge costs one missed signal, showing it wrongly cries wolf on every row.
  expect(needsRiderAttention(undefined)).toBe(false);
  expect(needsRiderAttention("something_new")).toBe(false);
});
