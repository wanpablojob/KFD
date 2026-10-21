"use client";

import { PageContainer, PageHeader, Section } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TableBoundary } from "@/components/ui/table-boundary";
import { formatDateTime } from "@/lib/format";
import { useAsyncData } from "@/lib/use-async-data";
import { fetchLeads, type Lead } from "@/lib/supabase/lead-queries";

const KIND_LABEL: Record<string, string> = {
  waitlist: "Waitlist",
  restaurant: "Restaurant",
  rider: "Rider",
};

/** The contact as typed on the website: an email or a phone number. */
function contactHref(contact: string): string {
  return contact.includes("@") ? `mailto:${contact}` : `tel:${contact.replace(/[^\d+]/g, "")}`;
}

/** Website sign-ups, newest first, so somebody actually gets back to them. */
export default function LeadsPage() {
  const leads = useAsyncData(() => fetchLeads());
  const rows: Lead[] = leads.data ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Website sign-ups"
        description="People who joined the waitlist or asked to sell or ride from the website. Contact them to follow up."
      />
      <Section>
        <TableBoundary
          loading={leads.loading}
          error={leads.error}
          onRetry={leads.refetch}
          errorTitle="Could not load sign-ups"
          skeletonRows={4}
          skeletonColumns={3}
        >
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sign-ups yet.</p>
          ) : (
            <Card>
              <ul className="divide-y divide-border">
                {rows.map((lead) => (
                  <li key={lead.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-card-foreground">
                        {lead.name}
                        <Badge variant="secondary" size="sm">
                          {KIND_LABEL[lead.kind] ?? lead.kind}
                        </Badge>
                      </p>
                      <a href={contactHref(lead.contact)} className="text-primary underline-offset-2 hover:underline">
                        {lead.contact}
                      </a>
                      {lead.note ? <p className="text-muted-foreground">{lead.note}</p> : null}
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDateTime(lead.created_at)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </TableBoundary>
      </Section>
    </PageContainer>
  );
}
