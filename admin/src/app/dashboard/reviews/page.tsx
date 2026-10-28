"use client";

import { useMemo, useState } from "react";
import { fetchRatings } from "@/lib/supabase/feedback-queries";
import { useAsyncData } from "@/lib/use-async-data";
import {
  PageContainer,
  PageHeader,
  Section,
  Stack,
  StatGrid,
} from "@/components/layout/page";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState } from "@/components/ui/status";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Stars } from "@/components/ui/stars";
import { RangeFilter, type RangeValue } from "@/components/range-filter";
import { Toolbar, ToolbarSearch } from "@/components/toolbar";
import { downloadCsv, timestampedFilename, type CsvColumn } from "@/lib/csv";
import { endOfLocalDay, isWithinRange, parseLocalDate } from "@/lib/merchant-order-range";
import { formatShortDate } from "@/lib/format";
import { presetRange, shiftDays } from "@/lib/report-metrics";
import {
  matchesReview,
  ratingDistribution,
  summarizeReviews,
  type ReviewEntry,
} from "@/lib/review-metrics";

const PAGE_SIZE = 15;

const CSV_COLUMNS: CsvColumn<ReviewEntry>[] = [
  { key: "createdAt", header: "Rated at", format: (row) => row.createdAt.slice(0, 10) },
  { key: "reference", header: "Order" },
  { key: "customer", header: "Customer" },
  { key: "restaurant", header: "Shop" },
  { key: "restaurantRating", header: "Shop rating" },
  { key: "riderRating", header: "Rider rating" },
  { key: "comment", header: "Comment" },
];

const columns: Column<ReviewEntry>[] = [
  {
    key: "createdAt",
    header: "Date",
    cell: (row) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {formatShortDate(row.createdAt)}
      </span>
    ),
  },
  {
    key: "restaurantRating",
    header: "Shop",
    cell: (row) => <Stars value={row.restaurantRating} />,
  },
  {
    key: "riderRating",
    header: "Rider",
    cell: (row) =>
      row.riderRating === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <Stars value={row.riderRating} />
      ),
  },
  { key: "restaurant", header: "Restaurant", cell: (row) => row.restaurant },
  { key: "customer", header: "Customer", cell: (row) => row.customer },
  {
    key: "comment",
    header: "Comment",
    cell: (row) =>
      (row.comment ?? "").trim() === "" ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="block max-w-md text-card-foreground">{row.comment}</span>
      ),
  },
  {
    key: "reference",
    header: "Order",
    cell: (row) => (
      <span className="whitespace-nowrap font-medium text-card-foreground">
        {row.reference}
      </span>
    ),
  },
];

/**
 * What customers said, as a queue rather than a decoration.
 *
 * Ratings appeared only as "recent ratings" on one restaurant's page and the
 * merchant home. Both are the right place to read a review and the wrong place
 * to find one: a one-star review on a shop nobody happened to open was
 * invisible, which is exactly the row that needed a phone call.
 *
 * Defaults to 90 days and sorts newest first, because the useful unit is "what
 * has gone wrong lately", not "all time, oldest first".
 */
export default function ReviewsPage() {
  const [range, setRange] = useState<RangeValue>(() => presetRange(90, new Date()));
  const [query, setQuery] = useState("");
  const [stars, setStars] = useState<"all" | "low" | 3 | 4 | 5>("all");
  const [restaurant, setRestaurant] = useState("all");
  const [page, setPage] = useState(1);

  const reviews = useAsyncData(
    // A day either side: the SQL bound is UTC and would drop the first eight
    // local hours of the range. `inRange` below decides membership by local day.
    () => fetchRatings({ from: shiftDays(range.from, -1), to: shiftDays(range.to, 1) }),
    `${range.from}:${range.to}`,
  );
  // Stable identity: `reviews.data ?? []` would be a new array every render and
  // re-run every memo below it.
  const rows = useMemo(() => reviews.data ?? [], [reviews.data]);

  // The query's SQL range is UTC-bounded; decide membership again on local-day
  // instants so a late-evening review is not filed under the next day.
  const bounds = useMemo(
    () => ({
      from: parseLocalDate(range.from),
      to: endOfLocalDay(range.to),
    }),
    [range.from, range.to],
  );

  const inRange = useMemo(
    () => rows.filter((row) => isWithinRange(row.createdAt, bounds)),
    [rows, bounds],
  );

  const summary = useMemo(() => summarizeReviews(inRange), [inRange]);
  const distribution = useMemo(() => ratingDistribution(inRange), [inRange]);

  // Only shops that actually have a review in the period: a dropdown listing
  // every restaurant the platform has ever had is a filter nobody can use.
  const restaurants = useMemo(
    () => [...new Set(inRange.map((row) => row.restaurant))].sort(),
    [inRange],
  );

  const filtered = useMemo(
    () => inRange.filter((row) => matchesReview(row, { query, stars, restaurant })),
    [inRange, query, stars, restaurant],
  );

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  return (
    <PageContainer>
      <PageHeader
        title="Reviews"
        description="Every rating a customer left, with the shop, the rider and what they said."
      />

      <Stack gap={6}>
        <Section aria-label="Filters">
          <Toolbar className="mb-0">
            <RangeFilter
              value={range}
              onChange={(next) => {
                setRange(next);
                setPage(1);
              }}
            />
          </Toolbar>
        </Section>

        {reviews.error ? (
          <EmptyState
            title="Could not load the reviews"
            description={reviews.error}
            action={
              <Button variant="outline" onClick={reviews.refetch}>
                Retry
              </Button>
            }
          />
        ) : !reviews.data ? (
          <LoadingState label="Loading reviews…" />
        ) : (
          <>
            <Section aria-label="Totals">
              <StatGrid>
                <StatCard
                  kpi={{
                    label: "Shop rating",
                    value: summary.averageRestaurant.toFixed(1),
                    hint: `out of 5 · ${summary.count} ${
                      summary.count === 1 ? "review" : "reviews"
                    }`,
                  }}
                />
                <StatCard
                  kpi={{
                    label: "Rider rating",
                    value: summary.averageRider === 0 ? "—" : summary.averageRider.toFixed(1),
                    hint: "out of 5 · reviews that scored a rider",
                  }}
                />
                <StatCard
                  kpi={{
                    label: "Low ratings",
                    value: String(summary.low),
                    hint: `${Math.round(summary.lowShare * 100)}% of reviews are 1-2 stars`,
                  }}
                />
                <StatCard
                  kpi={{
                    label: "With a comment",
                    value: String(summary.withComment),
                    hint: "said something, not only tapped stars",
                  }}
                />
              </StatGrid>
            </Section>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Section aria-label="Rating list" className="xl:col-span-2">
                <Card>
                  <CardHeader
                    title="Ratings"
                    subtitle={
                      filtered.length === inRange.length
                        ? `${inRange.length} ${inRange.length === 1 ? "review" : "reviews"}`
                        : `${filtered.length} of ${inRange.length} shown`
                    }
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={filtered.length === 0}
                        onClick={() =>
                          downloadCsv(
                            timestampedFilename("kfd-reviews"),
                            filtered,
                            CSV_COLUMNS,
                          )
                        }
                      >
                        Download CSV
                      </Button>
                    }
                  />

                  <div className="flex flex-wrap items-center gap-3 px-5 pb-4">
                    <ToolbarSearch
                      value={query}
                      onChange={(value) => {
                        setQuery(value);
                        setPage(1);
                      }}
                      placeholder="Order, customer, shop or comment"
                      ariaLabel="Search reviews"
                    />
                    <Select
                      value={String(stars)}
                      onChange={(event) => {
                        const value = event.target.value;
                        setStars(
                          value === "all" || value === "low"
                            ? value
                            : (Number(value) as 3 | 4 | 5),
                        );
                        setPage(1);
                      }}
                      className="w-full sm:w-44"
                    >
                      <option value="all">All ratings</option>
                      <option value="low">1-2 stars (low)</option>
                      <option value="3">3 stars</option>
                      <option value="4">4 stars</option>
                      <option value="5">5 stars</option>
                    </Select>
                    <Select
                      value={restaurant}
                      onChange={(event) => {
                        setRestaurant(event.target.value);
                        setPage(1);
                      }}
                      className="w-full sm:w-52"
                    >
                      <option value="all">All shops</option>
                      {restaurants.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {filtered.length === 0 ? (
                    <EmptyState
                      title={inRange.length === 0 ? "No reviews in this period" : "No match"}
                      description={
                        inRange.length === 0
                          ? "Nobody rated an order in the dates chosen."
                          : "Try a different search, rating or shop."
                      }
                      className="m-5"
                    />
                  ) : (
                    <>
                      <DataTable columns={columns} rows={pageRows} />
                      <Pagination
                        page={currentPage}
                        pageSize={PAGE_SIZE}
                        total={filtered.length}
                        onPageChange={setPage}
                      />
                    </>
                  )}
                </Card>
              </Section>

              <Section aria-label="Rating distribution">
                <Card className="h-full">
                  <CardHeader
                    title="Distribution"
                    subtitle="Shop ratings, 5 down to 1"
                  />
                  <ul className="space-y-3 px-5 pb-5">
                    {distribution.map((row) => (
                      <li key={row.stars} className="flex items-center gap-3 text-sm">
                        <span className="w-10 shrink-0 text-muted-foreground">
                          {row.stars} star
                        </span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-2 rounded-full bg-amber-500"
                            style={{ width: `${Math.round(row.share * 100)}%` }}
                          />
                        </span>
                        <span className="w-10 shrink-0 text-right tabular-nums text-card-foreground">
                          {row.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </Section>
            </div>
          </>
        )}
      </Stack>
    </PageContainer>
  );
}
