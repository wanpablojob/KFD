"use client";

import { useMemo, useState } from "react";
import type { Column } from "./data-table";
import { DataTable } from "./data-table";
import { Button } from "./button";
import { DownloadIcon } from "./icons";
import { Pagination } from "./pagination";
import { EmptyState } from "./status";
import { downloadCsv, timestampedFilename } from "@/lib/csv";
import type { CsvColumn } from "@/lib/csv";
import { matchesQuery, useGlobalSearch } from "@/lib/global-search";

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
}: {
  columns: Column<T>[];
  rows: T[];
  searchFields: (keyof T)[];
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  exportName?: string;
  exportColumns?: CsvColumn<T>[];
}) {
  const query = useGlobalSearch();
  const [page, setPage] = useState(1);
  const [previousQuery, setPreviousQuery] = useState(query);

  if (previousQuery !== query) {
    setPreviousQuery(query);
    setPage(1);
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
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (page > totalPages) {
    setPage(totalPages);
  }

  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
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

      <div className="overflow-hidden">
        <DataTable columns={columns} rows={pageRows} onRowClick={onRowClick} />
      </div>
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
        page={page}
        pageSize={PAGE_SIZE}
        total={filtered.length}
        onPageChange={(next) => setPage(next)}
      />
    </>
  );
}
