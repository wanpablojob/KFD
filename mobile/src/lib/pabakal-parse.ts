/**
 * Read a Messenger-style pabakal message into stores and items, without AI.
 *
 *   "pabakal ko dose ka biogesic sa mercury kag duwa ka bulb sa citi"
 *     -> Mercury: 12x biogesic · Citi: 2x bulb
 *
 * The fallback when the AI is unavailable, so the box always does something.
 * It never guesses: a store it cannot find is left blank, and so is a number
 * it cannot read, for the customer to fill in before sending.
 *
 * "at" is read as Tagalog "and", never as "at the store": in "sardinas at
 * isang bigas" the second item would otherwise become a store.
 */

import type { StopDraft } from "./pabakal";

const UNITS: Record<string, number> = {
  // Hiligaynon
  isa: 1,
  duha: 2,
  duwa: 2,
  tatlo: 3,
  apat: 4,
  lima: 5,
  anom: 6,
  anim: 6,
  pito: 7,
  walo: 8,
  siyam: 9,
  syam: 9,
  napulo: 10,
  // Tagalog (the -ng forms are handled by stripping the linker)
  dalawa: 2,
  sampu: 10,
  // English
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  // Spanish-derived Filipino
  uno: 1,
  dos: 2,
  tres: 3,
  kwatro: 4,
  kuwatro: 4,
  kuatro: 4,
  singko: 5,
  sinko: 5,
  cinco: 5,
  sais: 6,
  siyete: 7,
  syete: 7,
  siete: 7,
  otso: 8,
  nuwebe: 9,
  nueve: 9,
  diyes: 10,
  dies: 10,
  onse: 11,
  dose: 12,
  trese: 13,
  katorse: 14,
  catorce: 14,
  katorsi: 14,
  kinse: 15,
  disisais: 16,
  disisiyete: 17,
  disiotso: 18,
  disinuwebe: 19,
};

const TENS: Record<string, number> = {
  beinte: 20,
  bente: 20,
  veinte: 20,
  trenta: 30,
  kwarenta: 40,
  singkwenta: 50,
  sisenta: 60,
  setenta: 70,
  otsenta: 80,
  nobenta: 90,
};

/** Spanish units that may follow a ten: "beinte singko", "trenta y dos". */
const SPANISH_UNITS = new Set([
  "uno",
  "dos",
  "tres",
  "kwatro",
  "kuwatro",
  "kuatro",
  "singko",
  "sinko",
  "cinco",
  "sais",
  "siyete",
  "syete",
  "siete",
  "otso",
  "nuwebe",
  "nueve",
]);

const DOZEN = new Set(["dosena", "dozen"]);
const LINKERS = new Set(["ka", "buok", "na", "piraso", "pcs", "pc"]);
const OPENERS = new Set([
  "pabakal",
  "pabili",
  "palihog",
  "please",
  "pls",
  "ko",
  "bakal",
  "pa",
]);
const SEPARATOR = /\s*(?:,|;|\n|\b(?:kag|at|and|tapos|saka)\b)\s*/i;
const STORE = /\s*\b(?:sa may|sa|from)\s+/i;

/** A number word, with the Tagalog -ng linker allowed: "dalawang", "isang". */
function unitOf(word: string): number | undefined {
  if (word in UNITS) return UNITS[word];
  // "dalawang", "isang", "tatlong", "sampung": the linker is a suffix.
  if (word.endsWith("ng") && word.slice(0, -2) in UNITS)
    return UNITS[word.slice(0, -2)];
  return undefined;
}

/** A digit quantity in any of the ways it is typed: 2, x2, 2x, 2pcs. */
function digitsOf(word: string): number | undefined {
  const m = /^x?(\d{1,4})(?:x|pcs?)?$/.exec(word);
  return m ? Number(m[1]) : undefined;
}

/**
 * Read a quantity from the front of the words. Returns how many words it used,
 * and NaN when a number was there but is out of range.
 */
function leadingQuantity(words: string[]): { qty: number; used: number } | null {
  const [w0, w1, w2] = words;
  if (w0 === undefined) return null;
  let qty: number | undefined;
  let used = 1;
  const d = digitsOf(w0);
  if (d !== undefined) qty = d;
  else if (w0 in TENS) {
    qty = TENS[w0];
    if (w1 === "y" && w2 && SPANISH_UNITS.has(w2)) {
      qty += UNITS[w2];
      used = 3;
    } else if (w1 && SPANISH_UNITS.has(w1)) {
      qty += UNITS[w1];
      used = 2;
    }
  } else if (DOZEN.has(w0)) qty = 12;
  else if ((w0 === "a" || w0 === "an") && words.length > 1) qty = 1;
  else qty = unitOf(w0);
  if (qty === undefined) return null;
  // "isa ka dosena itlog", "isang dosena": a number of dozens.
  const rest = words.slice(used).filter((w) => !LINKERS.has(w));
  if (rest[0] && DOZEN.has(rest[0]) && !DOZEN.has(w0)) {
    qty *= 12;
    used = words.indexOf(rest[0], used) + 1;
  }
  return { qty: qty >= 1 && qty <= 99 ? qty : NaN, used };
}

/** "dose ka biogesic", "biogesic x2", "neozep 3 pcs", "bulb". */
function parseItem(text: string): { name: string; quantity: string } | null {
  const original = text.trim().split(/\s+/).filter(Boolean);
  const words = original.map((w) => w.toLowerCase());
  if (words.length === 0) return null;

  let qty: number | null = null;
  let start = 0;
  let end = words.length;

  const lead = leadingQuantity(words);
  if (lead) {
    qty = lead.qty;
    start = lead.used;
  } else {
    // Quantity at the end: "biogesic x2", "neozep 3pcs", "neozep 3 pcs".
    const last = words[end - 1];
    if (
      end >= 2 &&
      (last === "pcs" || last === "pc") &&
      digitsOf(words[end - 2]) !== undefined
    ) {
      qty = digitsOf(words[end - 2]) as number;
      end -= 2;
    } else if (end >= 2 && digitsOf(last) !== undefined) {
      qty = digitsOf(last) as number;
      end -= 1;
    }
    if (qty !== null && !(qty >= 1 && qty <= 99)) qty = NaN;
  }

  while (start < end && LINKERS.has(words[start])) start += 1;
  const name = original.slice(start, end).join(" ");
  if (!name) return null;
  return {
    name,
    quantity: qty === null ? "1" : Number.isNaN(qty) ? "" : String(qty),
  };
}

const titleCase = (s: string) =>
  s.replace(/(^|\s)(\S)/g, (_, sp, c) => sp + c.toUpperCase());

/** The message as form rows. A store applies to the items before it. */
export function parsePabakalMessage(message: string): StopDraft[] {
  let text = message.trim();
  // Drop "pabakal ko", "palihog pabili" and the like from the start, keeping
  // the newlines that separate items.
  let opener: RegExpExecArray | null;
  while (
    (opener = /^(\S+)[^\S\n]*/.exec(text)) &&
    OPENERS.has(opener[1].toLowerCase())
  ) {
    text = text.slice(opener[0].length);
  }

  const stops: StopDraft[] = [];
  let pending: StopDraft["items"] = [];

  for (const clause of text.split(SEPARATOR)) {
    if (!clause || !clause.trim()) continue;
    const [itemPart, ...storeParts] = clause.split(STORE);
    const item = parseItem(itemPart ?? "");
    if (item) pending.push(item);
    const store = storeParts.join(" ").trim();
    if (store) {
      if (pending.length > 0) stops.push({ store: titleCase(store), items: pending });
      pending = [];
    }
  }
  if (pending.length > 0) stops.push({ store: "", items: pending });
  return stops;
}
