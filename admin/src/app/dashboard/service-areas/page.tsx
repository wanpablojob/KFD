"use client";

import { useState } from "react";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableBoundary } from "@/components/ui/table-boundary";
import { parseBarangayNames } from "@/lib/barangay-names";
import { formatCurrency } from "@/lib/format";
import { useAsyncData } from "@/lib/use-async-data";
import {
  fetchServiceAreas,
  removeServiceArea,
  setServiceArea,
  type ServiceArea,
} from "@/lib/supabase/service-area-queries";

/** The fee the platform charged everywhere before zonal fees (0080). */
const DEFAULT_FEE = "45";

/** A fee as typed: a non-negative peso amount, or null when it is not one. */
function parseFee(text: string): number | null {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function feeLabel(area: ServiceArea): string {
  if (area.delivery_fee !== null) return formatCurrency(area.delivery_fee);
  return area.fee_agreed_in_person
    ? "Agreed at the door"
    : "No fee set — orders refused";
}

/** Admins publish the barangays Meriendash delivers to (0077) and their fees (0080). */
export default function ServiceAreasPage() {
  const areas = useAsyncData(() => fetchServiceAreas());
  const [name, setName] = useState("");
  const [fee, setFee] = useState(DEFAULT_FEE);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = areas.data ?? [];
  const feeValue = parseFee(fee);
  const names = parseBarangayNames(name);
  const canAdd = names.length > 0 && (agreed || feeValue !== null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      areas.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  // The barangays whose fee the modal is changing: one row, or all of them.
  const [editing, setEditing] = useState<ServiceArea[] | null>(null);
  const [editFee, setEditFee] = useState(DEFAULT_FEE);
  const [editAgreed, setEditAgreed] = useState(false);
  const editValue = parseFee(editFee);
  const canSaveFee = editAgreed || editValue !== null;

  function openFee(targets: ServiceArea[]) {
    const first = targets[0];
    setError(null);
    setEditing(targets);
    setEditFee(
      targets.length === 1 && first.delivery_fee !== null
        ? String(first.delivery_fee)
        : DEFAULT_FEE,
    );
    setEditAgreed(targets.length === 1 && first.fee_agreed_in_person);
  }

  function saveFee() {
    const targets = editing;
    if (!targets || !canSaveFee) return;
    void run(async () => {
      for (const area of targets) {
        await setServiceArea(area.barangay, editValue, editAgreed);
      }
      setEditing(null);
    });
  }

  return (
    <PageContainer>
      <PageHeader
        title="Service areas"
        description={
          rows.length === 0
            ? "No barangays listed, so customers can order to any address at the flat fee. Add the first barangay to start limiting deliveries."
            : `Customers must choose one of these ${rows.length} barangays and pay its delivery fee; orders elsewhere are refused.`
        }
      />

      <Section>
        <form
          className="mb-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canAdd) return;
            void run(async () => {
              for (const n of names) await setServiceArea(n, feeValue, agreed);
              setName("");
              setFee(DEFAULT_FEE);
              setAgreed(false);
            });
          }}
        >
          <Input
            aria-label="Barangay name"
            placeholder="e.g. Poblacion, or Barangay 1-9"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-72"
          />
          <Input
            aria-label="Delivery fee in pesos"
            inputMode="decimal"
            placeholder="Fee, e.g. 45"
            value={agreed ? "" : fee}
            disabled={agreed}
            onChange={(e) => setFee(e.target.value)}
            className="w-28"
          />
          <label className="flex items-center gap-2 pb-2 text-sm text-muted-foreground">
            <Checkbox
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            Agree the fee at the door
          </label>
          <Button type="submit" disabled={busy || !canAdd} loading={busy}>
            {names.length > 1 ? `Add ${names.length} barangays` : "Add barangay"}
          </Button>
          {rows.length > 1 ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => openFee(rows)}
            >
              Change all fees
            </Button>
          ) : null}
        </form>
        <p className="-mt-2 mb-4 text-xs text-muted-foreground">
          Add several at once with commas, or a range like Barangay 1-9. Adding
          one that is already listed updates its fee.
        </p>
        {error ? (
          <p className="mb-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <TableBoundary
          loading={areas.loading}
          error={areas.error}
          onRetry={areas.refetch}
          errorTitle="Could not load service areas"
          skeletonRows={4}
          skeletonColumns={3}
        >
          {rows.length > 0 ? (
            <Card>
              <ul className="divide-y divide-border">
                {rows.map((area) => (
                  <li
                    key={area.barangay}
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 text-sm"
                  >
                    <span className="text-card-foreground">
                      {area.barangay}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      <span
                        className={
                          area.delivery_fee === null &&
                          !area.fee_agreed_in_person
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }
                      >
                        {feeLabel(area)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => openFee([area])}
                      >
                        Change fee
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          if (
                            rows.length === 1 &&
                            !window.confirm(
                              "Removing the last barangay lets customers order to any address again. Continue?",
                            )
                          ) {
                            return;
                          }
                          void run(() => removeServiceArea(area.barangay));
                        }}
                      >
                        Remove
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </TableBoundary>
      </Section>

      <Dialog
        open={editing !== null}
        onClose={() => !busy && setEditing(null)}
        title={
          editing?.length === 1
            ? `Delivery fee for ${editing[0].barangay}`
            : `Delivery fee for all ${editing?.length ?? 0} barangays`
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveFee();
          }}
        >
          <Input
            aria-label="Delivery fee in pesos"
            inputMode="decimal"
            placeholder="Fee, e.g. 45"
            value={editAgreed ? "" : editFee}
            disabled={editAgreed}
            onChange={(e) => setEditFee(e.target.value)}
            autoFocus
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={editAgreed}
              onChange={(e) => setEditAgreed(e.target.checked)}
            />
            Agree the fee at the door
          </label>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !canSaveFee} loading={busy}>
              Save fee
            </Button>
          </div>
        </form>
      </Dialog>
    </PageContainer>
  );
}
