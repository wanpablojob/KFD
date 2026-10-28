/**
 * Fix close misspellings of common products and stores in a pabakal list:
 * "biogisic" -> "Biogesic", "mercuri drug" -> "Mercury Drug".
 *
 * Careful by design. A word is changed only when exactly one dictionary word
 * is close to it, so a real local product the dictionary does not know is
 * left as typed. The chat tells the customer every change it made.
 */

import type { StopDraft } from "./pabakal";

/** One entry per word, spelled the way it should appear. */
const DICTIONARY = [
  // Medicines sold over the counter
  "Biogesic",
  "Neozep",
  "Bioflu",
  "Decolgen",
  "Alaxan",
  "Medicol",
  "Kremil-S",
  "Diatabs",
  "Solmux",
  "Ascof",
  "Tuseran",
  "Robitussin",
  "Mefenamic",
  "Paracetamol",
  "Ibuprofen",
  "Amoxicillin",
  "Cetirizine",
  "Loperamide",
  "Loratadine",
  "Ceelin",
  "Enervon",
  "Centrum",
  "Myra",
  "Betadine",
  "Katinko",
  "Efficascent",
  "Vicks",
  "Salonpas",
  "Bandaid",
  "Acetylcysteine",
  "Carbocisteine",
  "Ambroxol",
  "Fluimucil",
  "Salbutamol",
  "Ventolin",
  "Lagundi",
  "Losartan",
  "Amlodipine",
  "Metformin",
  "Omeprazole",
  "Cotrimoxazole",
  "Cefalexin",
  "Azithromycin",
  "Antacid",
  "Oresol",
  // Groceries and household
  "Bugas",
  "Itlog",
  "Sardinas",
  "Noodles",
  "Pancit",
  "Canton",
  "Lucky",
  "Nescafe",
  "Kopiko",
  "Milo",
  "Bear",
  "Brand",
  "Alaska",
  "Asukal",
  "Mantika",
  "Toyo",
  "Suka",
  "Asin",
  "Sabon",
  "Safeguard",
  "Shampoo",
  "Sunsilk",
  "Palmolive",
  "Toothpaste",
  "Colgate",
  "Tissue",
  "Napkin",
  "Diaper",
  "Pampers",
  "Surf",
  "Ariel",
  "Tide",
  "Downy",
  "Joy",
  "Zonrox",
  "Corned",
  "Beef",
  "Spam",
  "Hotdog",
  "Tinapay",
  "Pandesal",
  "Gatas",
  "Kape",
  "Battery",
  "Bulb",
  "Kandila",
  "Posporo",
  "Coke",
  "Sprite",
  "Royal",
  "Tubig",
  "Mineral",
  "Water",
  "Cigarette",
  "Charger",
  // Stores
  "Mercury",
  "Drug",
  "Watsons",
  "Generika",
  "Southstar",
  "Rose",
  "Pharmacy",
  "Gaisano",
  "Puregold",
  "Robinsons",
  "Savemore",
  "Citimart",
  "Hardware",
  "Palengke",
  "Bakery",
  "Eleven",
];

/** Short names people text, expanded the way the chat reports a spelling fix. */
const SHORT_NAMES: Record<string, string> = {
  bio: "Biogesic",
  ibu: "Ibuprofen",
  para: "Paracetamol",
  mef: "Mefenamic",
  mefe: "Mefenamic",
  amox: "Amoxicillin",
  cetri: "Cetirizine",
  lope: "Loperamide",
};

const KNOWN = new Map(DICTIONARY.map((w) => [w.toLowerCase(), w]));

/** Letters added, dropped, changed or swapped to turn a into b, up to max+1. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, prev2[j - 2] + 1);
      }
      row.push(d);
    }
    prev2.splice(0, prev2.length, ...prev);
    prev = row;
  }
  return prev[b.length];
}

/** The corrected word, or null when it is fine or not clearly one known word. */
function correctWord(word: string): string | null {
  const lower = word.toLowerCase();
  if (lower in SHORT_NAMES) return SHORT_NAMES[lower];
  if (lower.length < 4 || KNOWN.has(lower) || !/^[a-z-]+$/.test(lower)) return null;
  // Short words allow one slip; longer words two.
  const max = lower.length <= 6 ? 1 : 2;
  let best: string | null = null;
  let bestDistance = max + 1;
  let tie = false;
  for (const [known, spelled] of KNOWN) {
    const d = distance(lower, known, max);
    if (d < bestDistance) {
      best = spelled;
      bestDistance = d;
      tie = false;
    } else if (d === bestDistance) {
      tie = true;
    }
  }
  return best && !tie && bestDistance <= max ? best : null;
}

export interface Correction {
  from: string;
  to: string;
}

/** A name with each misspelled word fixed, and what was changed. */
/** Whether a word is (or is one slip from) a product or store we know. */
export function isKnownProduct(word: string): boolean {
  const lower = word.toLowerCase();
  return KNOWN.has(lower) || lower in SHORT_NAMES || correctWord(word) !== null;
}

export function correctName(name: string): { text: string; corrections: Correction[] } {
  const corrections: Correction[] = [];
  const text = name.replace(/[\p{L}-]+/gu, (word) => {
    const fixed = correctWord(word);
    if (!fixed) return word;
    corrections.push({ from: word, to: fixed });
    return fixed;
  });
  return { text, corrections };
}

/** Every store and item name in the list, corrected, with all the changes. */
export function correctStops(stops: StopDraft[]): {
  stops: StopDraft[];
  corrections: Correction[];
} {
  const corrections: Correction[] = [];
  const fix = (s: string) => {
    const r = correctName(s);
    corrections.push(...r.corrections);
    return r.text;
  };
  return {
    stops: stops.map((stop) => ({
      store: fix(stop.store),
      items: stop.items.map((item) => ({ ...item, name: fix(item.name) })),
    })),
    corrections,
  };
}

/** "biogisic → Biogesic, mercuri → Mercury", each change once. */
export function describeCorrections(corrections: Correction[]): string {
  const seen = new Set<string>();
  return corrections
    .filter((c) => {
      const key = `${c.from.toLowerCase()}>${c.to}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((c) => `${c.from} → ${c.to}`)
    .join(", ");
}
