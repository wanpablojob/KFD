"use client";

import Link from "next/link";
import type { Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { isDisputable, type RiderPayout } from "@/lib/rider-ledger";

/**
 * What this rider earned, per delivery.
 *
 * The ledger's own rows, not orders.total. The delivery history table further
 * down still shows total because there it means "what the customer paid", which
 * is a legitimate column of an order; here the column is money the rider
 * earned and the two were never the same number.
 *
 * A builder rather than a constant because a disputed row needs an action, and
 * an action needs the page's callback. Everything else is still just a column.
 */
export function buildPayoutColumns({
  onResolve,
}: {
  onResolve: (payout: RiderPayout) => void;
}): Column<RiderPayout>[] {
  return [
    {
      key: "earnedAt",
      header: "Earned",
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {new Date(row.earnedAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: "restaurant",
      header: "Restaurant",
      cell: (row) => (
        <span className="font-medium text-card-foreground">{row.restaurant}</span>
      ),
    },
    {
      key: "reference",
      header: "Order",
      cell: (row) => (
        <Link
          href={`/dashboard/orders?order=${row.reference}`}
          className="text-card-foreground underline underline-offset-2"
        >
          {row.reference}
        </Link>
      ),
    },
    {
      key: "amount",
      header: "Earned",
      align: "right",
      cell: (row) => (
        <span className="font-medium text-card-foreground">
          {formatCurrency(row.amount)}
        </span>
      ),
    },
    {
      // The column that makes 0075 usable rather than merely present. Without it a
      // disputed delivery is a normal-looking row and nobody opens it, which would
      // leave the recovery path built and unreachable.
      key: "settlementState",
      header: "Status",
      cell: (row) => <SettlementBadge payout={row} />,
    },
    {
      // The control the badge above needed. It only appears on a disputed row,
      // so the column costs nothing on the ordinary ones and puts the decision
      // where the money is, rather than only in the fleet-wide queue.
      key: "actions",
      header: "",
      align: "right",
      cell: (row) =>
        row.settlementState === "disputed" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onResolve(row)}
          >
            Resolve
          </Button>
        ) : null,
    },
  ];
}

/**
 * One word, chosen to answer "does this need me?".
 *
 * pending_review deliberately says "reviewable until <time>" rather than just
 * "under review": the window is the whole feature, and an operator deciding
 * whether to worry needs to know it will close on its own.
 */
function SettlementBadge({ payout }: { payout: RiderPayout }) {
  if (payout.settlementState === "disputed") {
    // The customer's own words, as the tooltip. They are the reason this row is
    // flagged, and hiding them behind a click would make the queue unactionable.
    return (
      <span title={payout.disputeReason ?? undefined}>
        <Badge variant="destructive">Disputed</Badge>
      </span>
    );
  }
  if (payout.settlementState === "reversed") {
    // Rare and serious: the rider was paid for a delivery that did not stand up.
    return <Badge variant="destructive">Reversed</Badge>;
  }
  if (payout.settlementState === "settled" || !isDisputable(payout)) {
    // Pending with no window left reads as settled on purpose: nobody swept the
    // row, but an operator needs to act on neither case.
    return <Badge variant="neutral">Settled</Badge>;
  }
  return (
    <Badge variant="outline" className="whitespace-nowrap">
      Reviewable until{" "}
      {new Date(payout.reviewExpiresAt as string).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}
    </Badge>
  );
}
