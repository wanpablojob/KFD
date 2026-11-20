"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  fetchMerchantAccess,
  revokeMerchantAccess,
  setRestaurantArchived,
  type MerchantAccess,
} from "@/lib/supabase/queries";

/**
 * Cut a restaurant off: every merchant account linked to it loses the console,
 * then the shop is archived so customers stop seeing it. Admin accounts linked
 * to the shop are left alone. Sign-ins, orders and the menu survive, so it is
 * undone by restoring the shop and attaching an account in Merchant access.
 *
 * Stops click propagation: the whole row opens the restaurant.
 */
export function RevokeRestaurantAccess({
  restaurantId,
  name,
  onDone,
}: {
  restaurantId: string;
  name: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<MerchantAccess[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setOpen(true);
    setAccounts(null);
    setError(null);
    try {
      const all = await fetchMerchantAccess();
      setAccounts(
        all.filter(
          (a) => a.role === "merchant" && a.restaurantId === restaurantId,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load accounts.",
      );
    }
  }

  async function confirm() {
    if (!accounts) return;
    setBusy(true);
    setError(null);
    try {
      for (const a of accounts) await revokeMerchantAccess(a.email);
      await setRestaurantArchived(restaurantId, true);
      setOpen(false);
      onDone();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not revoke. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Button variant="destructive" size="sm" onClick={() => void start()}>
        Revoke access
      </Button>
      <Dialog
        open={open}
        onClose={busy ? () => {} : () => setOpen(false)}
        title={`Revoke ${name}?`}
      >
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            {name} is archived, so customers can no longer order from it, and
            these accounts lose the shop console:
          </p>
          {accounts === null && !error ? (
            <p>Loading linked accounts…</p>
          ) : accounts && accounts.length === 0 ? (
            <p>No merchant account is linked to this shop.</p>
          ) : (
            <ul className="list-disc pl-5 text-card-foreground">
              {accounts?.map((a) => <li key={a.userId}>{a.email}</li>)}
            </ul>
          )}
          <p>
            Orders, the menu and the sign-ins themselves are kept. To undo,
            restore the shop and attach an account again in Merchant access.
          </p>
          {error ? (
            <p className="text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirm()}
              disabled={busy || accounts === null}
              loading={busy}
            >
              Revoke access
            </Button>
          </div>
        </div>
      </Dialog>
    </span>
  );
}
