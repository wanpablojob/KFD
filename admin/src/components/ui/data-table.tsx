import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right";
};

export type SortState = { key: string; dir: "asc" | "desc" };

/**
 * Responsive data table. On small screens the table scrolls horizontally;
 * sticky column headers keep the header visible on wide tables.
 *
 * Sorting is opt-in: pass `sort` and `onSortChange` and only columns whose key
 * appears in `sortableKeys` become buttons. Every existing caller passes neither,
 * so no other page changes behaviour.
 */
export function DataTable<T>({
  columns,
  rows,
  onRowClick,
  sort,
  onSortChange,
  sortableKeys,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  sort?: SortState;
  onSortChange?: (next: SortState) => void;
  sortableKeys?: readonly string[];
}) {
  const canSort = (col: Column<T>) =>
    Boolean(onSortChange) && (sortableKeys ?? []).includes(col.key);

  const ariaSort = (col: Column<T>) => {
    if (!canSort(col) || !sort) return undefined;
    if (sort.key !== col.key) return "none" as const;
    return sort.dir === "asc" ? ("ascending" as const) : ("descending" as const);
  };

  const onHeaderClick = (col: Column<T>) => {
    if (!onSortChange || !canSort(col)) return;
    // First click on a new column sorts ascending; re-clicking the active
    // column flips it, which is the behaviour a table header implies.
    onSortChange({
      key: col.key,
      dir: sort && sort.key === col.key && sort.dir === "asc" ? "desc" : "asc",
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                aria-sort={ariaSort(col)}
                className={cn(
                  "px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                  col.align === "right" ? "text-right" : "text-left",
                )}
              >
                {canSort(col) ? (
                  <button
                    type="button"
                    onClick={() => onHeaderClick(col)}
                    aria-label={`Sort by ${col.header}`}
                    className={cn(
                      "inline-flex items-center gap-1 rounded uppercase tracking-wide",
                      "hover:text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      sort?.key === col.key && "text-card-foreground",
                    )}
                  >
                    {col.header}
                    <span aria-hidden="true" className="text-[10px]">
                      {sort?.key === col.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70 bg-card">
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "transition-colors hover:bg-muted/50",
                onRowClick && "cursor-pointer",
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-5 py-3.5 text-card-foreground",
                    col.align === "right" ? "text-right" : "text-left",
                    col.className,
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}