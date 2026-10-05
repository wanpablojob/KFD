/**
 * The progress a live order moves through, and which states mean "stop asking".
 *
 * The tracking screen used to render a single status badge, so a customer could
 * see "Being prepared" but not what came before or what happens next, and it
 * never refreshed -- a badge that was wrong the moment the status moved. Both
 * the progression and the terminal check are pure so the polling logic and the
 * UI agree on what "finished" means.
 *
 * `cancelled` is deliberately not a step on the line: it is not a later stage of
 * a successful order, it is a different outcome, so the screen renders it on its
 * own instead of pretending it is step five.
 */
export const ORDER_PROGRESS = [
  { status: "pending", label: "Order placed" },
  { status: "confirmed", label: "Confirmed" },
  { status: "preparing", label: "Being prepared" },
  { status: "out_for_delivery", label: "Out for delivery" },
  { status: "delivered", label: "Delivered" },
] as const;

export type OrderProgressStatus = (typeof ORDER_PROGRESS)[number]["status"];

export type StepState = "done" | "current" | "upcoming";

export interface ProgressStep {
  status: OrderProgressStatus;
  label: string;
  state: StepState;
}

/** Terminal statuses: nothing further will happen, so polling must stop. */
export function isTerminalStatus(status: string): boolean {
  return status === "delivered" || status === "cancelled";
}

/**
 * Every step with its state for an order at `status`. Cancelled orders have no
 * progression, so this returns an empty list and the screen shows the cancelled
 * outcome on its own.
 */
export function orderProgress(status: string): ProgressStep[] {
  if (status === "cancelled") return [];

  const found = ORDER_PROGRESS.findIndex((step) => step.status === status);
  // An unrecognised status is treated as the first step rather than throwing:
  // the screen still has to render something, and "placed" is the safe claim.
  const currentIndex = found === -1 ? 0 : found;

  return ORDER_PROGRESS.map((step, index) => ({
    status: step.status,
    label: step.label,
    state:
      index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming",
  }));
}
