import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right";
};

/**
 * Responsive data table. On small screens the table scrolls horizontally;
 * sticky column headers keep the header visible on wide tables.
 */
export function DataTable<T>({
  columns,
  rows,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                  col.align === "right" ? "text-right" : "text-left",
                )}
              >
                {col.header}
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