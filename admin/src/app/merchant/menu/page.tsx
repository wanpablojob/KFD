"use client";

import { useState } from "react";
import {
  deleteMenuItem,
  fetchMerchantMenu,
  saveMenuItem,
  setMenuAvailability,
} from "@/lib/supabase/merchant-queries";
import { useAsyncData } from "@/lib/use-async-data";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/status";
import { TableBoundary } from "@/components/ui/table-boundary";
import { PlusIcon, PencilIcon, DownloadIcon } from "@/components/ui/icons";
import { formatCurrency } from "@/lib/format";
import type { MenuItem } from "@/lib/types";

interface Draft {
  id: string | null;
  name: string;
  category: string;
  price: string;
  available: boolean;
}

const EMPTY: Draft = { id: null, name: "", category: "", price: "", available: true };

export default function MerchantMenuPage() {
  const menu = useAsyncData(() => fetchMerchantMenu());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<MenuItem | null>(null);

  const rows = menu.data ?? [];

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;

    const price = Number(draft.price);
    if (!Number.isFinite(price) || price < 0) {
      setError("Enter a valid price.");
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await saveMenuItem(draft.id, {
        name: draft.name.trim(),
        category: draft.category.trim(),
        price,
        available: draft.available,
      });
      setDraft(null);
      menu.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save item.");
    } finally {
      setBusy(false);
    }
  }

  async function onToggle(item: MenuItem, available: boolean) {
    setError(null);
    try {
      await setMenuAvailability(item.id, available);
      menu.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update item.");
    }
  }

  async function onDelete() {
    if (!confirmDelete) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMenuItem(confirmDelete.id);
      setConfirmDelete(null);
      menu.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete item.");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const header = "name,category,price,available";
    const body = rows
      .map((m) =>
        [m.name, m.category, m.price, m.available].join(",")
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "menu.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Menu"
        description="Your items and what customers can currently order."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <DownloadIcon className="h-4 w-4" />
              Export
            </Button>
            <Button size="sm" onClick={() => setDraft({ ...EMPTY })}>
              <PlusIcon className="h-4 w-4" />
              Add item
            </Button>
          </>
        }
      />

      {error && !draft ? (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* `error` below is the local form/save error and is unrelated. The fetch
          failure is menu.error, and it must reach TableBoundary: previously the
          page fell through to EmptyState, so an outage looked like an empty
          menu. */}
      <TableBoundary
        loading={menu.loading}
        error={menu.error}
        onRetry={menu.refetch}
        errorTitle="Could not load your menu"
        skeletonRows={4}
        skeletonColumns={2}
      >
        {rows.length === 0 ? (
          <EmptyState
            title="No menu items yet"
            description="Add your first dish so customers can order it."
            action={
              <Button size="sm" onClick={() => setDraft({ ...EMPTY })}>
                <PlusIcon className="h-4 w-4" />
                Add item
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((item) => (
              <li key={item.id}>
                <Card>
                  <div className="px-5 pb-5">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-card-foreground">
                          {item.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.category} · {formatCurrency(item.price)}
                        </p>
                      </div>

                      <Switch
                        checked={item.available}
                        onCheckedChange={(checked) => onToggle(item, checked)}
                        aria-label={`${item.name} availability`}
                      />

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${item.name}`}
                        onClick={() =>
                          setDraft({
                            id: item.id,
                            name: item.name,
                            category: item.category,
                            price: String(item.price),
                            available: item.available,
                          })
                        }
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${item.name}`}
                        onClick={() => setConfirmDelete(item)}
                      >
                        <span aria-hidden className="text-xs">
                          ✕
                        </span>
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </TableBoundary>

      <Dialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit item" : "Add menu item"}
      >
        <form onSubmit={onSave} className="space-y-4">
          <div>
            <Label htmlFor="item-name">Name</Label>
            <Input
              id="item-name"
              required
              value={draft?.name ?? ""}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, name: e.target.value } : d))
              }
              placeholder="Inihaw na Liempo"
            />
          </div>

          <div>
            <Label htmlFor="item-category">Category</Label>
            <Input
              id="item-category"
              required
              value={draft?.category ?? ""}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, category: e.target.value } : d))
              }
              placeholder="Grill"
            />
          </div>

          <div>
            <Label htmlFor="item-price">Price (₱)</Label>
            <Input
              id="item-price"
              type="number"
              min="0"
              step="0.01"
              required
              value={draft?.price ?? ""}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, price: e.target.value } : d))
              }
              placeholder="8.50"
            />
          </div>

          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDraft(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save item"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete menu item?"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {confirmDelete?.name}
            </span>{" "}
            will be removed from your menu. Customers will no longer be able to
            order it.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(null)}
              disabled={busy}
            >
              Keep item
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      </Dialog>
    </PageContainer>
  );
}
