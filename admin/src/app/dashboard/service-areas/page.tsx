"use client";

import { useState } from "react";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableBoundary } from "@/components/ui/table-boundary";
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
  return text.trim() !== "" && Number.isFinite(value) && value >= 0 ? value : null;
}

function feeLabel(area: ServiceArea): string {
  if (area.delivery_fee !== null) return formatCurrency(area.delivery_fee);
  return area.fee_agreed_in_person ? "Agreed at the door" : "No fee set — orders refused";
}

/** Admins publish the barangays KFD delivers to (0077) and their fees (0080). */
export default function ServiceAreasPage() {
  const areas = useAsyncData(() => fetchServiceAreas());
  const [name, setName] = useState("");
  const [fee, setFee] = useState(DEFAULT_FEE);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = areas.data ?? [];
  const feeValue = parseFee(fee);
  const canAdd = !!name.trim() && (agreed || feeValue !== null);

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

  function changeFee(area: ServiceArea) {
    const answer = window.prompt(
      `Delivery fee for ${area.barangay} in pesos. Leave empty to agree it at the door.`,
      area.delivery_fee === null ? "" : String(area.delivery_fee)
    );
    if (answer === null) return;
    const atDoor = answer.trim() === "";
    const next = parseFee(answer);
    if (!atDoor && next === null) {
      setError("Enter the fee as a number of pesos, or leave it empty.");
      return;
    }
    void run(() => setServiceArea(area.barangay, next, atDoor));
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
              await setServiceArea(name, feeValue, agreed);
              setName("");
              setFee(DEFAULT_FEE);
              setAgreed(false);
            });
          }}
        >
          <Input
            aria-label="Barangay name"
            placeholder="Barangay name, e.g. Poblacion"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-64"
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
            <Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            Agree the fee at the door
          </label>
          <Button type="submit" disabled={busy || !canAdd} loading={busy}>
            Add barangay
          </Button>
        </form>
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
                    <span className="text-card-foreground">{area.barangay}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <span
                        className={
                          area.delivery_fee === null && !area.fee_agreed_in_person
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
                        onClick={() => changeFee(area)}
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
                              "Removing the last barangay lets customers order to any address again. Continue?"
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
    </PageContainer>
  );
}
