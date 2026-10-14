"use client";

import { useState } from "react";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableBoundary } from "@/components/ui/table-boundary";
import { useAsyncData } from "@/lib/use-async-data";
import {
  addServiceArea,
  fetchServiceAreas,
  removeServiceArea,
} from "@/lib/supabase/service-area-queries";

/** Admins publish the barangays KFD delivers to (0077). */
export default function ServiceAreasPage() {
  const areas = useAsyncData(() => fetchServiceAreas());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = areas.data ?? [];

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

  return (
    <PageContainer>
      <PageHeader
        title="Service areas"
        description={
          rows.length === 0
            ? "No barangays listed, so customers can order to any address. Add the first barangay to start limiting deliveries."
            : `Customers must choose one of these ${rows.length} barangays; orders elsewhere are refused.`
        }
      />

      <Section>
        <form
          className="mb-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            void run(async () => {
              await addServiceArea(name);
              setName("");
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
          <Button type="submit" disabled={busy || !name.trim()} loading={busy}>
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
          skeletonColumns={2}
        >
          {rows.length > 0 ? (
            <Card>
              <ul className="divide-y divide-border">
                {rows.map((area) => (
                  <li
                    key={area.barangay}
                    className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                  >
                    <span className="text-card-foreground">{area.barangay}</span>
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
