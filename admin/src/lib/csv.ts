export interface CsvColumn<T> {
  key: keyof T;
  header: string;
  format?: (row: T) => unknown;
}

/**
 * Characters a spreadsheet treats as the start of a formula.
 *
 * `=`, `+`, `-` and `@` are the documented ones. Tab and CR are included because
 * they lead too and are the easiest to miss -- the cell renders as empty in a
 * narrow column, and the payload only appears when someone widens it.
 */
const FORMULA_LEADERS = ["=", "+", "-", "@", "\t", "\r"];

export function escapeCsvCell(value: unknown): string {
  const text = value == null ? "" : String(value);

  // Prefix before quoting, never the other way round. Quoting alone does not
  // help: Excel evaluates a quoted "=1+1" as a formula too, whereas the leading
  // apostrophe is dropped on read and the cell shows as text. Wrapping a
  // prefixed cell in quotes keeps a comma or newline from splitting it.
  // Numbers are exempt. A real number can never be a formula, and prefixing
  // would silently turn a negative amount in an export into "'-15.50". Only text
  // can carry a payload, so only text is prefixed.
  const isNumber = typeof value === "number" && Number.isFinite(value);
  const safe = !isNumber && FORMULA_LEADERS.includes(text.charAt(0)) ? `'${text}` : text;

  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * The CSV body, exported for tests.
 *
 * toCsv was private; the tests need the rendered text rather than a Blob, and
 * asserting on the string is what actually proves the quoting is right.
 */
export function toCsvText<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvCell(c.header));
  const lines = rows.map((row) =>
    columns
      .map((c) => escapeCsvCell(c.format ? c.format(row) : row[c.key]))
      .join(","),
  );
  return [header, ...lines].join("\n");
}

export function downloadCsv<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
): void {
  // The BOM so Excel reads UTF-8; unchanged.
  const csv = "﻿" + toCsvText(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? `${filename}` : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function timestampedFilename(base: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base}-${stamp}.csv`;
}