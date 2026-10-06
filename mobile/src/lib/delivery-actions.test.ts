import { deliveryActions } from "./delivery-actions";

describe("deliveryActions", () => {
  it("offers a pending order nothing the server would refuse", () => {
    // The regression. "Not finished" was treated as "can act on", so a pending
    // order rendered Mark delivered and the server rejected it every time.
    expect(deliveryActions("pending")).toEqual({
      canPickUp: false,
      canDeliver: false,
      canReportFailed: false,
    });
  });

  it("offers both pickup and completion once confirmed", () => {
    expect(deliveryActions("confirmed")).toEqual({
      canPickUp: true,
      canDeliver: true,
      canReportFailed: true,
    });
  });

  it("still offers pickup while preparing, since the kitchen may be cooking", () => {
    expect(deliveryActions("preparing")).toEqual({
      canPickUp: true,
      canDeliver: true,
      canReportFailed: true,
    });
  });

  it("drops pickup once out for delivery: the food is already collected", () => {
    // Marking it picked up again is a no-op the server quietly absorbs, so
    // offering it is noise on the card.
    expect(deliveryActions("out_for_delivery")).toEqual({
      canPickUp: false,
      canDeliver: true,
      canReportFailed: true,
    });
  });

  it("offers nothing on a terminal status", () => {
    for (const status of ["delivered", "cancelled"]) {
      expect(deliveryActions(status)).toEqual({
        canPickUp: false,
        canDeliver: false,
        canReportFailed: false,
      });
    }
  });

  it("offers nothing for an unknown status rather than everything", () => {
    // A status this build does not know is not a licence to show every button:
    // the server would refuse them one by one.
    expect(deliveryActions("some_new_status")).toEqual({
      canPickUp: false,
      canDeliver: false,
      canReportFailed: false,
    });
  });

  it("always lets a rider hand a delivery back", () => {
    // If deliver and report-failed diverge, some order becomes impossible to
    // resolve.
    for (const status of ["confirmed", "preparing", "out_for_delivery"]) {
      const actions = deliveryActions(status);
      expect(actions.canDeliver).toBe(actions.canReportFailed);
    }
  });
});
