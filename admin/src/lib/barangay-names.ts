/**
 * Names typed into the Service areas box, for adding several at once:
 * separated by commas or new lines, and "Barangay 1-9" (or "1 to 9") expands
 * to Barangay 1 … Barangay 9. Duplicates, ignoring case, are dropped.
 */
export function parseBarangayNames(text: string): string[] {
  const names: string[] = [];
  for (const part of text.split(/[,\n]/)) {
    const item = part.trim().replace(/\s+/g, " ");
    if (!item) continue;
    const range = item.match(/^(.*?)\s*(\d+)\s*(?:-|–|to)\s*(\d+)$/i);
    const from = range ? Number(range[2]) : 0;
    const to = range ? Number(range[3]) : 0;
    if (range && from <= to && to - from < 100) {
      const prefix = range[1].trim();
      for (let n = from; n <= to; n++) names.push(prefix ? `${prefix} ${n}` : String(n));
    } else {
      names.push(item);
    }
  }
  const seen = new Set<string>();
  return names.filter((n) => !seen.has(n.toLowerCase()) && !!seen.add(n.toLowerCase()));
}
