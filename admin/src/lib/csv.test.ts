import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeCsvCell, toCsvText } from "./csv.ts";

/**
 * Formula injection.
 *
 * A CSV cell whose first character is =, +, -, @, tab or CR is a formula to
 * Excel, LibreOffice and Google Sheets, and they run it when the file is
 * opened. Nothing here validates the data, so the values are customer- and
 * rider-supplied: a delivery address, a restaurant name or an applicant name
 * can carry one. =HYPERLINK("http://x","click") is the classic payload, and
 * exfiltration via a DDE link works the same way.
 *
 * Quoting is not the defence, which is the part that surprises people: Excel
 * evaluates a *quoted* "=1+1" too. The leading apostrophe is what neutralises
 * it -- Excel and Sheets both drop the apostrophe and show the rest as text.
 */

test("neutralises a formula payload", () => {
  // Also quoted, because the payload contains commas and quotes -- the prefix
  // and the quoting are independent and both apply.
  assert.equal(
    escapeCsvCell('=HYPERLINK("http://evil","click me")'),
    '"\'=HYPERLINK(""http://evil"",""click me"")"',
  );
  // The unquoted case, so the prefix is visible on its own.
  assert.equal(escapeCsvCell("=1+1"), "'=1+1");
});

test("neutralises every leading character a spreadsheet treats as a formula", () => {
  for (const prefix of ["=", "+", "-", "@"]) {
    assert.equal(escapeCsvCell(`${prefix}cmd|' /C calc'!A0`), `'${prefix}cmd|' /C calc'!A0`);
  }
  // Tab and carriage return lead too, and they are the sneaky ones because the
  // cell looks blank until you widen it.
  assert.equal(escapeCsvCell("\t=1+1"), "'\t=1+1");
  // CR is also a quote-triggering character, so this one gets wrapped as well.
  assert.equal(escapeCsvCell("\r=1+1"), '"\'\r=1+1"');
});

test("leaves ordinary values alone", () => {
  assert.equal(escapeCsvCell("Ana Reyes"), "Ana Reyes");
  assert.equal(escapeCsvCell("rider@example.com"), "rider@example.com");
  assert.equal(escapeCsvCell(42), "42");
  // A hyphen inside a value is not a formula. Only the leading character matters,
  // or every negative number and every hyphenated email would be mangled.
  assert.equal(escapeCsvCell("0917-123-4567"), "0917-123-4567");
  assert.equal(escapeCsvCell(-15.5), "-15.5");
  // A number is never a formula, and prefixing it would corrupt the amount.
  assert.equal(escapeCsvCell(0), "0");
  assert.equal(escapeCsvCell(-0.5), "-0.5");
});

test("still quotes cells that need it", () => {
  assert.equal(escapeCsvCell('a,b'), '"a,b"');
  assert.equal(escapeCsvCell('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCsvCell("line1\nline2"), '"line1\nline2"');
});

test("a neutralised formula is still correctly quoted if it contains a comma", () => {
  // Order matters: prefix first, then quote. Doing it the other way round puts
  // the apostrophe inside the quotes, where a spreadsheet still evaluates.
  assert.equal(
    escapeCsvCell('=SUM(1,2)'),
    '"\'=SUM(1,2)"',
  );
});

test("null and undefined become empty cells, not the words", () => {
  assert.equal(escapeCsvCell(null), "");
  assert.equal(escapeCsvCell(undefined), "");
});

test("a header row is escaped too", () => {
  // A header is a constant in our code today, but it costs nothing and the
  // function is shared by every export in the app.
  const out = toCsvText(
    [{ name: "Ana" }],
    [{ key: "name", header: "Rider" }],
  );
  assert.equal(out, "Rider\nAna");
});