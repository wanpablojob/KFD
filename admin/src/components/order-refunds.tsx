"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAsyncData } from "@/lib/use-async-data";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { fetchOrderRefunds, recordRefund, type Refund } from "@/lib/supabase/feedback-queries";

/** Refunds recorded against an order, and a form to record one (admins, 0078). */
export function OrderRefunds({ orderId, total }: { orderId: string; total: number }) {
  const refunds = useAsyncData(() => fetchOrderRefunds(orderId), orderId);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Refund["method"]>("cash");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = refunds.data ?? [];
  const refunded = rows.reduce((sum, r) => sum + r.amount, 0);
  const value = Number(amount);
  const valid = value > 0 && value <= total - refunded && reason.trim() !== "";

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await recordRefund(orderId, value, method, reason.trim());
      setAmount("");
      setReason("");
      refunds.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record the refund.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-card-foreground">
        Refunds{" "}
        {refunded > 0 ? `· ${formatCurrency(refunded)} of ${formatCurrency(total)}` : null}
      </p>
      {rows.length > 0 ? (
        <ul className="mb-3 space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex justify-between gap-3">
              <span className="text-card-foreground">
                {formatCurrency(r.amount)} by {r.method === "gcash" ? "GCash" : "cash"}: {r.reason}
              </span>
              <span className="shrink-0 text-muted-foreground">{formatDateTime(r.created_at)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {refunded < total ? (
        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="Amount"
            aria-label="Refund amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28"
          />
          <Select
            aria-label="Refund method"
            value={method}
            onChange={(e) => setMethod(e.target.value as Refund["method"])}
            className="w-28"
          >
            <option value="cash">Cash</option>
            <option value="gcash">GCash</option>
          </Select>
          <Input
            placeholder="Reason"
            aria-label="Refund reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-w-40 flex-1"
          />
          <Button
            size="sm"
            disabled={!valid || saving}
            loading={saving}
            onClick={() => void submit()}
          >
            Record refund
          </Button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
