"use client";

import { useState } from "react";
import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableBoundary } from "@/components/ui/table-boundary";
import { formatDateTime } from "@/lib/format";
import { useAsyncData } from "@/lib/use-async-data";
import { describeAudit } from "@/lib/audit";
import { fetchAuditLog, type AuditEntry } from "@/lib/supabase/audit-queries";

/** Who did what in admin (0141), newest first. */
export default function AuditPage() {
  const first = useAsyncData(() => fetchAuditLog());
  const [older, setOlder] = useState<AuditEntry[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const rows = [...(first.data ?? []), ...older];

  async function loadOlder() {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const more = await fetchAuditLog(last.id);
      setOlder((o) => [...o, ...more]);
      if (more.length === 0) setDone(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Activity log"
        description="Admin actions on riders and accounts: suspensions, payouts, access and roles."
      />
      <Section>
        <TableBoundary
          loading={first.loading}
          error={first.error}
          onRetry={first.refetch}
          errorTitle="Could not load the activity log"
          skeletonRows={6}
          skeletonColumns={2}
        >
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing recorded yet.
            </p>
          ) : (
            <Card>
              <ul className="divide-y divide-border">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="text-card-foreground">{describeAudit(r)}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.actor_email ?? "System"}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(r.changed_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {rows.length > 0 && !done ? (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                loading={loadingMore}
                onClick={() => void loadOlder()}
              >
                Load older
              </Button>
            </div>
          ) : null}
        </TableBoundary>
      </Section>
    </PageContainer>
  );
}
