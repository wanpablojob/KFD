export interface CsvColumn<T> {
  key: keyof T;
  header: string;
  format?: (row: T) => unknown;
}

function escapeCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.header));
  const lines = rows.map((row) =>
    columns
      .map((c) => escapeCell(c.format ? c.format(row) : row[c.key]))
      .join(","),
  );
  return [header, ...lines].join("\n");
}

export function downloadCsv<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
): void {
  const csv = "\uFEFF" + toCsv(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function timestampedFilename(base: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base}-${stamp}.csv`;
}
