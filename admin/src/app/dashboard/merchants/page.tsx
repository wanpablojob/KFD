"use client";

import { useState } from "react";
import {
  fetchMerchantAccess,
  fetchRestaurants,
  revokeMerchantAccess,
  setMerchantAccess,
  type MerchantAccess,
} from "@/lib/supabase/queries";
import { formatDateTime } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/status";
import { EntityDialog } from "@/components/ui/entity-dialog";
import { TableBoundary } from "@/components/ui/table-boundary";
import { useAsyncData } from "@/lib/use-async-data";
import type { Column } from "@/components/ui/data-table";
import type { Restaurant } from "@/lib/types";

/**
 * Merchant access (Prompt 3.3).
 *
 * Attach an existing auth account to a restaurant, move it, or remove it.
 * Accounts are never created here: signing someone up is a Supabase Auth
 * operation, and an auth user with no app_users row signs in to a page that
 * says they are not provisioned, which looks like a broken login rather than a
 * missing step.
 *
 * Every write goes through the SECURITY DEFINER functions in
 * 0011_merchant_provisioning.sql, so the rules -- admin only, never an
 * archived restaurant, never silently demote an admin -- are enforced in the
 * database. This page reports those errors rather than pre-empting them.
 */

type Mode =
  | { kind: "attach" }
  | { kind: "reassign"; row: MerchantAccess }
  | { kind: "revoke"; row: MerchantAccess };

export default function MerchantsPage() {
  const access = useAsyncData(() => fetchMerchantAccess());
  const restaurants = useAsyncData(() => fetchRestaurants());
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Archived restaurants are excluded, and this is not cosmetic. The archive
   * dialog promises a restaurant is hidden "from anything that offers a choice
   * of restaurants", and this is that picker -- offering an archived
   * restaurant here would quietly break that promise. The database refuses the
   * write too; this just means the option is never offered.
   */
  const options = (restaurants.data ?? [])
    .filter((r: Restaurant) => r.archivedAt === null)
    .map((r: Restaurant) => ({ value: r.id, label: r.name }));

  const rows = access.data ?? [];

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setMode(null);
      setNotice(success);
      await access.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<MerchantAccess>[] = [
    {
      key: "email",
      header: "Account",
      cell: (row) => (
        <span className="block font-medium text-card-foreground">
          {row.email}
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (row) => (
        <Badge variant={row.role === "admin" ? "info" : "secondary"} size="sm">
          {row.role === "admin" ? "Platform admin" : "Merchant"}
        </Badge>
      ),
    },
    {
      key: "restaurantName",
      header: "Restaurant",
      cell: (row) => (
        <span className="text-card-foreground">
          {row.restaurantName ?? "—"}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Provisioned",
      cell: (row) => (
        <span className="text-muted-foreground">
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <span className="flex justify-end gap-2">
          {row.role === "merchant" ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMode({ kind: "reassign", row })}
              >
                Reassign
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMode({ kind: "revoke", row })}
              >
                Revoke
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              Admins are not attached to a restaurant
            </span>
          )}
        </span>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Merchant access"
        description="Attach an existing account to a restaurant, or take access away."
        actions={
          <Button onClick={() => setMode({ kind: "attach" })}>
            Attach merchant
          </Button>
        }
      />

      {notice ? (
        <p className="mb-3 text-sm text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}
      {error && !mode ? (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Section>
        <TableBoundary
          loading={access.loading}
          error={access.error}
          onRetry={() => void access.refetch()}
          skeletonRows={4}
        >
          {rows.length === 0 ? (
            <EmptyState
              title="No accounts provisioned"
              description="Attach an existing account to a restaurant to give it access to that restaurant's orders and menu."
            />
          ) : (
            <DataTable columns={columns} rows={rows} />
          )}
        </TableBoundary>
      </Section>

      {mode?.kind === "attach" ? (
        <EntityDialog
          open
          title="Attach merchant"
          description="Attaches an account that already exists in Supabase Auth. This page does not create accounts -- a new login has to be created there first, or it will sign in to nothing."
          onClose={() => setMode(null)}
          fields={[
            {
              key: "email",
              label: "Account email",
              type: "text",
              required: true,
              placeholder: "owner@example.com",
            },
            {
              key: "restaurantId",
              label: "Restaurant",
              options,
              required: true,
            },
          ]}
          onSave={(values) =>
            run(
              async () => {
                await setMerchantAccess(
                  values.email.trim(),
                  values.restaurantId,
                );
              },
              `${values.email.trim()} can now see that restaurant.`,
            )
          }
        />
      ) : null}

      {mode?.kind === "reassign" && mode.row ? (
        <EntityDialog
          open
          key={mode.row.userId}
          title={`Reassign ${mode.row.email}`}
          description="The account loses access to its current restaurant and gains access to the one you pick."
          onClose={() => setMode(null)}
          initial={{ restaurantId: mode.row.restaurantId ?? "" }}
          fields={[
            { key: "restaurantId", label: "Restaurant", options, required: true },
          ]}
          onSave={(values) =>
            run(
              async () => {
                await setMerchantAccess(mode.row.email, values.restaurantId);
              },
              `${mode.row.email} now has access to the selected restaurant.`,
            )
          }
        />
      ) : null}

      {mode?.kind === "revoke" && mode.row ? (
        <RevokeDialog
          email={mode.row.email}
          restaurantName={mode.row.restaurantName}
          busy={busy}
          onClose={() => setMode(null)}
          onConfirm={() =>
            run(
              async () => {
                await revokeMerchantAccess(mode.row.email);
              },
              `${mode.row.email} no longer has access. The login itself still exists.`,
            )
          }
        />
      ) : null}
    </PageContainer>
  );
}

/**
 * Not an EntityDialog: revoking is destructive and irreversible from the UI, so
 * it needs copy that says what survives. EntityDialog has no description slot.
 */
function RevokeDialog({
  email,
  restaurantName,
  busy,
  onClose,
  onConfirm,
}: {
  email: string;
  restaurantName: string | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open onClose={busy ? () => {} : onClose} title="Revoke access?">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {email} will immediately lose access to{" "}
          {restaurantName ? `the ${restaurantName} console` : "the console"}.
          Their orders and menu are untouched.
        </p>
        <p className="text-sm text-muted-foreground">
          The sign-in itself is not deleted, so this can be undone by attaching
          the account again.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? "Revoking…" : "Revoke access"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
