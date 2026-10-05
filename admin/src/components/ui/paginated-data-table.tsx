"use client";

import { useMemo, useState } from "react";
import type { Column, SortState } from "./data-table";
import { DataTable } from "./data-table";
import { Button } from "./button";
import { DownloadIcon } from "./icons";
import { Pagination } from "./pagination";
import { EmptyState } from "./status";
import { downloadCsv, timestampedFilename } from "@/lib/csv";
import type { CsvColumn } from "@/lib/csv";
import { matchesQuery, useGlobalSearch } from "@/lib/global-search";
import { MD_AND_UP, useMediaQuery } from "@/lib/use-media-query";

const PAGE_SIZE = 8;

export function PaginatedDataTable<T>({
  columns,
  rows,
  searchFields,
  onRowClick,
  emptyTitle,
  emptyDescription,
  exportName,
  exportColumns,
  sort,
  onSortChange,
  sortableKeys,
  searchQuery,
  page,
  onPageChange,
  pageSize = PAGE_SIZE,
  mobileCard,
}: {
  columns: Column<T>[];
  rows: T[];
  searchFields: (keyof T)[];
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  exportName?: string;
  exportColumns?: CsvColumn<T>[];

  /** Pass all three to make headers sortable. Omit and behaviour is unchanged. */
  sort?: SortState;
  onSortChange?: (next: SortState) => void;
  sortableKeys?: readonly string[];

  /**
   * Overrides the global search store. The riders page owns its search term in
   * the URL, so it passes the parsed value here rather than letting two
   * sources of truth filter the same rows.
   */
  searchQuery?: string;

  /** Pass `page` and `onPageChange` to keep paging in the URL. */
  page?: number;
  onPageChange?: (next: number) => void;
  pageSize?: number;

  /**
   * Renders each row as a card below the `md` breakpoint instead of a
   * horizontally scrolling table. One branch, not both rendered and hidden.
   */
  mobileCard?: (row: T) => React.ReactNode;
}) {
  const globalQuery = useGlobalSearch();
  const query = searchQuery ?? globalQuery;
  const isControlledPage = page !== undefined;
  const [internalPage, setInternalPage] = useState(1);
  const [previousQuery, setPreviousQuery] = useState(query);
  const isWide = useMediaQuery(MD_AND_UP);
  const showCards = Boolean(mobileCard) && !isWide;

  const activePage = isControlledPage ? page : internalPage;

  function setPage(next: number) {
    if (!isControlledPage) setInternalPage(next);
    onPageChange?.(next);
  }

  // Only for the uncontrolled case. A controlled page is reset by whoever owns
  // the URL, and calling setPage here would fight their state.
  if (!isControlledPage && previousQuery !== query) {
    setPreviousQuery(query);
    setInternalPage(1);
  }

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesQuery(
          row as unknown as Record<string, unknown>,
          query,
          searchFields as string[],
        ),
      ),
    [rows, query, searchFields],
  );

  // `page` is only reset when the *query* changes, so anything else that
  // shrinks `filtered` can strand it past the end: delete the only row on the
  // last page, or refetch a smaller result set. `pageRows` then comes back
  // empty while `filtered.length` is still non-zero, so EmptyState does not
  // render either and the user gets a bare table header above a footer reading
  // "17-17 of 17". <Pagination> hides this by disabling Next, but it never
  // corrects an out-of-range page.
  //
  // Adjusting state during render when a value is derived from props is the
  // sanctioned React pattern, and this file already uses it for the query
  // reset above. React discards this render pass and immediately re-runs it
  // with the corrected page, so no empty frame is ever painted. A
  // useEffect would be wrong here: it would paint the bad frame first and
  // flash the empty table.
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(activePage, totalPages);
  if (!isControlledPage && activePage > totalPages) {
    setInternalPage(totalPages);
  }

  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" role="status">
          {filtered.length} {filtered.length === 1 ? "record" : "records"}
        </p>
        {exportName && exportColumns ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              downloadCsv(
                timestampedFilename(exportName),
                filtered,
                exportColumns,
              )
            }
            disabled={filtered.length === 0}
            aria-label={`Export ${filtered.length} records as CSV`}
          >
            <DownloadIcon className="h-4 w-4" />
            Export CSV
          </Button>
        ) : null}
      </div>

      {showCards ? (
        <ul className="flex flex-col gap-3">
          {pageRows.map((row, index) => (
            <li key={index} className="rounded-(--radius-card) border border-border bg-card p-4">
              {mobileCard!(row)}
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden">
          <DataTable
            columns={columns}
            rows={pageRows}
            onRowClick={onRowClick}
            sort={sort}
            onSortChange={onSortChange}
            sortableKeys={sortableKeys}
          />
        </div>
      )}
      {filtered.length === 0 ? (
        <EmptyState
          title={emptyTitle ?? "No matching records"}
          description={
            emptyDescription ??
            (query
              ? `Nothing matched "${query.trim()}".`
              : "There are no records yet.")
          }
          className="rounded-t-none border-t-0"
        />
      ) : null}
      <Pagination
        page={safePage}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
      />
    </>
  );
}