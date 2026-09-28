"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ArchiveIcon } from "@/components/ui/icons";

/**
 * Archive / restore control, shared by the Restaurants and Riders tables
 * (Prompt 3.2).
 *
 * There is no hard delete for either entity. For restaurants it is not merely
 * discouraged but impossible to do safely -- `orders.restaurant_id` and
 * `menu_items.restaurant_id` are ON DELETE SET NULL (and RLS hides a NULL
 * restaurant_id from its merchant) while `app_users.restaurant_id` is ON DELETE
 * CASCADE, so a delete would null the order history, empty the menu and remove
 * the merchant's own login. Migration 0010 spells this out.
 *
 * Archiving confirms before it writes; restoring does not, because a restore
 * destroys nothing. Both are reversible, which is the point.
 *
 * The button stops click propagation because the whole row is a click target
 * that opens the edit dialog, matching the existing status `Select` on the
 * Riders table.
 */
export function ArchiveButton({
  name,
  archived,
  onChange,
}: {
  /** Entity name, so the confirmation names a human rather than an id. */
  name: string;
  archived: boolean;
  onChange: (archived: boolean) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setConfirming(false);
    setError(null);
  };

  const run = async (next: boolean) => {
    setPending(true);
    setError(null);
    try {
      await onChange(next);
      setConfirming(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save. Try again.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        // The row itself opens the edit dialog; without this, every archive
        // click also opened the editor on top of the confirmation.
        onClick={(e) => {
          e.stopPropagation();
          if (archived) void run(false);
          else setConfirming(true);
        }}
        disabled={pending}
        aria-label={archived ? `Restore ${name}` : `Archive ${name}`}
      >
        <ArchiveIcon className="h-4 w-4" />
        {archived ? "Restore" : "Archive"}
      </Button>

      {/* The button stops propagation because the row opens the edit dialog --
      but that is not enough on its own. This component lives inside a table
      cell, so the Dialog's markup is nested inside that same clickable row, and
      clicking "Archive" or "Cancel" inside it bubbled up to the row handler and
      opened the edit dialog underneath. Verified in the browser sweep: Cancel
      closed the archive dialog and the edit dialog took its place, so the
      count never dropped. Stopping propagation on the wrapper covers every
      click inside the dialog, wherever it is rendered from. */}
      <span onClick={(e) => e.stopPropagation()}>
        <Dialog
          open={confirming}
          onClose={pending ? () => {} : close}
          title={`Archive ${name}?`}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {name} will be hidden from the list and from anything that offers
              a choice of restaurants. Its orders, menu and history stay exactly
              as they are, and the merchant keeps access to them.
            </p>
            <p className="text-sm text-muted-foreground">
              Nothing is deleted, so you can bring it back at any time.
            </p>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={close}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void run(true)}
                disabled={pending}
              >
                {pending ? "Archiving…" : "Archive"}
              </Button>
            </div>
          </div>
        </Dialog>
      </span>
    </>
  );
}
