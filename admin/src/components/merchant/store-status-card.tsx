"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAsyncData } from "@/lib/use-async-data";
import { fetchStoreStatus, setStoreStatus } from "@/lib/supabase/merchant-queries";

/**
 * Open/closed and prep time for the merchant's own restaurant (0077).
 * Closed stops new orders in the customer app; prep time feeds the customer's
 * delivery estimate.
 */
export function StoreStatusCard() {
  const status = useAsyncData(() => fetchStoreStatus());
  const [prep, setPrep] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = status.data;
  if (status.loading || !current) return null;

  const prepValue = prep ?? String(current.prep_minutes);
  const prepNumber = Number(prepValue);
  const prepValid = Number.isInteger(prepNumber) && prepNumber >= 5 && prepNumber <= 120;

  async function save(isOpen: boolean, prepMinutes?: number) {
    setSaving(true);
    setError(null);
    try {
      await setStoreStatus(isOpen, prepMinutes);
      setPrep(null);
      status.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title={current.is_open ? "Taking orders" : "Closed"}
        subtitle={
          current.is_open
            ? "Customers can order from you now."
            : "Customers see you as closed and cannot order."
        }
        action={
          <Switch
            checked={current.is_open}
            onCheckedChange={(next) => void save(next)}
            disabled={saving}
            label={current.is_open ? "Open" : "Closed"}
          />
        }
      />
      <div className="flex flex-wrap items-end gap-3 px-5 pb-5">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Prep time (minutes)</span>
          <Input
            type="number"
            min={5}
            max={120}
            value={prepValue}
            onChange={(e) => setPrep(e.target.value)}
            error={!prepValid}
            className="w-28"
          />
        </label>
        <Button
          size="sm"
          disabled={saving || !prepValid || prep === null}
          loading={saving}
          onClick={() => void save(current.is_open, prepNumber)}
        >
          Save prep time
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </Card>
  );
}
