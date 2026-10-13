"use client";

import { Card, CardHeader } from "@/components/ui/card";
import { useAsyncData } from "@/lib/use-async-data";
import { formatDateTime } from "@/lib/format";
import { fetchRecentRatings } from "@/lib/supabase/feedback-queries";

/**
 * The ten newest customer ratings. Pass restaurantId on admin pages; merchants
 * omit it and RLS returns their own restaurant's (0078).
 */
export function RecentRatings({ restaurantId }: { restaurantId?: string }) {
  const ratings = useAsyncData(() => fetchRecentRatings(restaurantId), restaurantId ?? "own");
  const rows = ratings.data ?? [];
  if (ratings.loading || ratings.error) return null;

  return (
    <Card className="mb-6">
      <CardHeader
        title="Recent ratings"
        subtitle={rows.length === 0 ? "No customer has rated an order yet." : undefined}
      />
      {rows.length > 0 ? (
        <ul className="divide-y divide-border px-5 pb-4 text-sm">
          {rows.map((r) => (
            <li key={r.order_id} className="flex items-start justify-between gap-4 py-2">
              <div className="min-w-0">
                <p className="text-card-foreground">
                  <span aria-label={`${r.restaurant_rating} out of 5`}>
                    {"★".repeat(r.restaurant_rating)}
                    <span className="text-muted-foreground">
                      {"★".repeat(5 - r.restaurant_rating)}
                    </span>
                  </span>
                  {r.rider_rating ? (
                    <span className="ml-2 text-muted-foreground">Rider {r.rider_rating}/5</span>
                  ) : null}
                </p>
                {r.comment ? <p className="text-muted-foreground">{r.comment}</p> : null}
              </div>
              <span className="shrink-0 text-muted-foreground">{formatDateTime(r.created_at)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
