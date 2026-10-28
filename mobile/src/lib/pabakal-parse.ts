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
import { isKnownProduct } from "./spelling";

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
const LINKERS = new Set([
  "ka",
  "buok",
  "kabilog",
  "bilog",
  "na",
  "piraso",
  "pcs",
  "pc",
]);
const OPENERS = new Set([
  "pabakal",
  "mabakal",
  "magpabakal",
  "mapabakal",
  "mapabili",
  "pabili",
  "palihog",
  "please",
  "pls",
  "ko",
  "bakal",
  "pa",
]);
/**
 * Polite and filler words that come before an item, not part of it:
 * "pabakal ko TANI duwa ka biogesic", "kag PALIHOG isa ka neozep".
 */
const SOFT_WORDS = new Set([
  ...OPENERS,
  "tani",
  "sana",
  "naman",
  "po",
  "lang",
  "lng",
  "gid",
  "gd",
  "man",
  "daw",
  "bi",
  "abi",
  "ako",
  "ug",
  "bili",
  "buy",
  "order",
  "also",
  "din",
  "rin",
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
function parseItem(
  text: string
): { item: { name: string; quantity: string }; implicit: boolean } | null {
  let original = text.trim().split(/\s+/).filter(Boolean);
  // Skip "tani", "palihog" and the like, so the quantity after them is read.
  let skip = 0;
  while (skip < original.length - 1 && isChatter(original[skip])) {
    skip += 1;
  }
  original = original.slice(skip);
  // ...and "po", "lang", "tani" after it: "duwa ka sardinas po".
  while (original.length > 1 && isChatter(original[original.length - 1])) {
    original = original.slice(0, -1);
  }
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
    // Quantity after the item: "biogesic x2", "neozep 3 pcs", "biogesic duwa
    // kabilog", "neozep duha ka buok". A number over 99 there is a size
    // ("Biogesic 500"), so it stays in the name.
    let tail = end;
    while (tail > 2 && COUNT_TAIL.has(words[tail - 1])) tail -= 1;
    const found = quantityAtEnd(words, tail, 1);
    if (found) {
      qty = found.qty;
      end = found.start;
    }
  }

  while (start < end && LINKERS.has(words[start])) start += 1;
  const name = original.slice(start, end).join(" ");
  if (!name) return null;
  return {
    item: { name, quantity: qty === null ? "1" : Number.isNaN(qty) ? "" : String(qty) },
    implicit: qty === null,
  };
}

/** A quantity written on its own: "duwa", "dalawa", "2". */
function numberWord(word: string): number | null {
  const lower = word.toLowerCase();
  const n =
    digitsOf(lower) ?? unitOf(lower) ?? (lower in TENS ? TENS[lower] : undefined);
  return n !== undefined && n >= 1 && n <= 99 ? n : null;
}

/**
 * "tig duwa", "tigduwa", "tag-dalawa", "tag duwa kabilog", "2 each", "kada isa" at the end of a
 * clause: that many of EACH item, so "biogesic kag ibu tig duwa" is two of both.
 */
/**
 * A quantity of one to three words ending at `end` ("singko", "beinte
 * singko", "trenta y dos", "2", "x2"), never reaching below `min` so a name is
 * left in front of it. Over 99 is a size, not a quantity ("Biogesic 500").
 */
function quantityAtEnd(
  words: string[],
  end: number,
  min: number
): { qty: number; start: number } | null {
  for (const len of [3, 2, 1]) {
    const start = end - len;
    if (start < min) continue;
    const lead = leadingQuantity(words.slice(start, end).map((w) => w.toLowerCase()));
    if (lead && lead.used === len && !Number.isNaN(lead.qty))
      return { qty: lead.qty, start };
  }
  return null;
}

/**
 * "tig duwa", "tag-dalawa", "tig beinte singko", "kada tatlo ka buok", "2
 * each" at the end of a clause: that many of EACH item before it.
 */
function takeEach(text: string): { rest: string; each: number | null } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let end = words.length;
  while (end > 0 && COUNT_TAIL.has(words[end - 1].toLowerCase())) end -= 1;
  const eachWord = end > 0 && words[end - 1].toLowerCase() === "each";
  if (eachWord) end -= 1;
  // "tigduwa", "tig-duwa": the marker joined to the number.
  const joined = end > 0 ? /^(tig|tag)-?(.+)$/i.exec(words[end - 1]) : null;
  if (joined && !eachWord) {
    const n = numberWord(joined[2]);
    if (n !== null) return { rest: words.slice(0, end - 1).join(" "), each: n };
  }
  const found = quantityAtEnd(words, end, eachWord ? 0 : 1);
  if (!found) return { rest: text, each: null };
  if (eachWord) return { rest: words.slice(0, found.start).join(" "), each: found.qty };
  const marker = words[found.start - 1].toLowerCase();
  if (marker === "tig" || marker === "tag" || marker === "kada") {
    return { rest: words.slice(0, found.start - 1).join(" "), each: found.qty };
  }
  return { rest: text, each: null };
}

const titleCase = (s: string) =>
  s.replace(/(^|\s)(\S)/g, (_, sp, c) => sp + c.toUpperCase());

/** The message as form rows. A store applies to the items before it. */
/** "sang duwa ka itlog", "mga sardinas": grammar, never a product. */
const GRAMMAR = new Set(["sang", "sing", "ng", "nga", "mga"]);

/** "pwede po", "pls": asking words that come before an order. */
const ASKING = new Set([
  "pwede",
  "puede",
  "pwde",
  "pede",
  "pwd",
  "puwede",
  // English: "can i order", "i would like to get", "i need", "please buy"
  "can",
  "could",
  "would",
  "will",
  "want",
  "wanna",
  "need",
  "like",
  "to",
  "get",
  "buy",
  "please",
  "id",
  "i'd",
  "im",
  "i'm",
]);

/**
 * Greetings, thanks, small talk, polite and order words: never a product or
 * a quantity. "mayong gab e mapabakal ko tani biogesic" starts with five.
 */
function isChatter(word: string): boolean {
  const w = squeeze(
    word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
  );
  if (!w) return true;
  return (
    inSet(w, GREETING) ||
    inSet(w, THANKS) ||
    FILLER.has(w) ||
    SOFT_WORDS.has(w) ||
    OPENERS.has(w) ||
    ASKING.has(w) ||
    GRAMMAR.has(w)
  );
}

/** Counting words that may follow a quantity: "duwa kabilog", "duha ka buok". */
const COUNT_TAIL = new Set(["kabilog", "bilog", "buok", "piraso", "pcs", "pc", "ka"]);

/** The most words an item name keeps: the product, with a brand or size. */
export const MAX_ITEM_WORDS = 3;

/** Grammar that is never part of a product name: "sang itlog", "mga sardinas". */
const NAME_NOISE = new Set([
  "sang",
  "sing",
  "ng",
  "nga",
  "mga",
  "tig",
  "tag",
  "kada",
  "each",
]);

/**
 * An item name as a product, not a sentence: "tani duwa ka biogesic" ->
 * "biogesic", "acetylcystein tag duwa kabilog" -> "acetylcystein". Drops polite
 * and order words, number and counting words, a store phrase that slipped in,
 * and keeps at most MAX_ITEM_WORDS. Digits stay ("Biogesic 500mg") unless they
 * lead the name or are a count ("x2", "3pcs"). Every reading, the AI's or the
 * phone's, passes through this before the customer sees it.
 */
export function cleanItemName(name: string): string {
  const beforeStore = name.split(STORE)[0] ?? name;
  const words = beforeStore.trim().split(/\s+/).filter(Boolean);
  const kept = words.filter((word, i) => {
    const w = word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!w) return false;
    if (isChatter(w) || LINKERS.has(w) || NAME_NOISE.has(w)) return false;
    if (unitOf(w) !== undefined || w in TENS || DOZEN.has(w)) return false;
    const each = /^(?:tig|tag)-?(.+)$/.exec(w);
    if (each && (unitOf(each[1]) !== undefined || digitsOf(each[1]) !== undefined))
      return false;
    if (/^x\d+$|^\d+(?:x|pcs?)$/.test(w)) return false;
    if (i === 0 && /^\d+$/.test(w)) return false;
    return true;
  });
  // Nothing left means it was never a product ("hello po"): no item, not the words as typed.
  const result = kept.slice(0, MAX_ITEM_WORDS).join(" ");
  return result.trim();
}

/**
 * "kabilog!!", "mercury?", "biogesic..." -> the word itself. Commas and
 * semicolons stay: they separate items. A dot inside a word ("1.5L") stays.
 */
function stripPunctuation(text: string): string {
  return text
    .replace(/[!?…"“”'‘’()[\]{}*~_]+/g, " ")
    .replace(/\.+(?=\s|$|,|;)/g, " ")
    .replace(/[^\S\n]+/g, " ");
}

export function parsePabakalMessage(message: string): StopDraft[] {
  let text = stripPunctuation(message).trim();
  // Drop "pabakal ko", "palihog pabili" and the like from the start, keeping
  // the newlines that separate items.
  let opener: RegExpExecArray | null;
  while (
    (opener = /^(\S+)[^\S\n]*/.exec(text)) &&
    isChatter(opener[1]) &&
    // Never eat the quantity: "a dozen" and "isa ka" start real orders.
    leadingQuantity([opener[1].toLowerCase()]) === null
  ) {
    text = text.slice(opener[0].length);
  }

  const stops: StopDraft[] = [];
  let pending: StopDraft["items"] = [];
  // Items that got no number of their own, so a later "tig duwa" applies.
  const implicit = new Set<StopDraft["items"][number]>();

  for (const clause of text.split(SEPARATOR)) {
    if (!clause || !clause.trim()) continue;
    const [itemPart, ...storeParts] = clause.split(STORE);
    const { rest, each } = takeEach(itemPart ?? "");
    const parsed = parseItem(rest);
    if (parsed) {
      pending.push(parsed.item);
      if (parsed.implicit) implicit.add(parsed.item);
    }
    if (each !== null) {
      for (const item of pending) {
        if (implicit.has(item)) {
          item.quantity = String(each);
          implicit.delete(item);
        }
      }
    }
    // "sa earth duwa kabilog": a quantity after the store belongs to the item
    // before it, and the store's name is only the store.
    let storeText = storeParts.join(" ").trim();
    {
      const sw = storeText.split(/\s+/).filter(Boolean);
      while (sw.length > 1 && isChatter(sw[sw.length - 1])) sw.pop();
      storeText = sw.join(" ");
    }
    const storeEach = takeEach(storeText);
    const lastItem = pending[pending.length - 1];
    if (storeEach.each !== null) {
      for (const item of pending) {
        if (implicit.has(item)) {
          item.quantity = String(storeEach.each);
          implicit.delete(item);
        }
      }
      storeText = storeEach.rest.trim();
    } else if (storeText) {
      const sw = storeText.split(/\s+/);
      while (sw.length > 1 && isChatter(sw[sw.length - 1])) sw.pop();
      let t = sw.length;
      while (t > 1 && COUNT_TAIL.has(sw[t - 1].toLowerCase())) t -= 1;
      const found = quantityAtEnd(sw, t, 1);
      if (found) {
        if (lastItem && implicit.has(lastItem)) {
          lastItem.quantity = String(found.qty);
          implicit.delete(lastItem);
        }
        sw.length = found.start;
      }
      storeText = sw.join(" ");
    }
    const store = storeText;
    if (store) {
      if (pending.length > 0) stops.push({ store: titleCase(store), items: pending });
      pending = [];
    }
  }
  if (pending.length > 0) stops.push({ store: "", items: pending });
  return stops;
}

/**
 * Small-talk words, as people actually text them in Kabankalan: Hiligaynon,
 * Tagalog, English and text-speak. Matching is forgiving (see smallTalkKind),
 * so this does not need every spelling.
 */
const GREETING_WORDS = [
  // Hiligaynon / Ilonggo
  "maayong",
  "mayong",
  "mayung",
  "maayung",
  "maayo",
  "aga",
  "agahon",
  "udto",
  "hapon",
  "hapun",
  "gabi",
  "gabe",
  "gbi",
  "gab",
  "kamusta",
  "kumusta",
  "musta",
  "kmsta",
  "kmusta",
  "uy",
  "oy",
  "huy",
  "hoy",
  "ayo",
  // Tagalog
  "magandang",
  "umaga",
  "tanghali",
  "hapon",
  "gabi",
  // English and text-speak
  "hello",
  "helo",
  "hallo",
  "hellu",
  "hai",
  "hi",
  "hey",
  "heya",
  "yo",
  "yow",
  "sup",
  "wassup",
  "good",
  "gud",
  "morning",
  "afternoon",
  "evening",
  "noon",
  "gm",
  "ga",
  "ge",
  "gn",
  "gnyt",
  "night",
  "nyt",
  "am",
  "pm",
  "eve",
  "eb",
  "aft",
];
const THANKS_WORDS = [
  "salamat",
  "slmt",
  "salamuch",
  "salamt",
  "daghang",
  "damo",
  "madamo",
  "maraming",
  "thanks",
  "thank",
  "thnx",
  "thnks",
  "thx",
  "tnx",
  "tnks",
  "ty",
  "tysm",
  "tq",
  "tenkyu",
  "tenks",
];
/** Words that carry no order on their own: "ok po", "sige bai", "hehe". */
const FILLER_WORDS = [
  "po",
  "sa",
  "inyo",
  "ninyo",
  "nyo",
  "kamo",
  "ikaw",
  "kaayo",
  "lang",
  "lng",
  "man",
  "ha",
  "ba",
  "bah",
  "bala",
  "gani",
  "abi",
  "kay",
  "ni",
  "na",
  "pa",
  "gid",
  "gd",
  "din",
  "rin",
  "man",
  "ta",
  "kita",
  "mo",
  "you",
  "i",
  "e",
  "a",
  "ok",
  "okay",
  "okey",
  "oki",
  "okie",
  "oks",
  "k",
  "kk",
  "sige",
  "sge",
  "sigi",
  "yes",
  "yep",
  "no",
  "oo",
  "huo",
  "hu",
  "ow",
  "ou",
  "indi",
  "hindi",
  "di",
  "dili",
  "wala",
  "ambot",
  "ay",
  "ah",
  "eh",
  "oh",
  "hehe",
  "haha",
  "hihi",
  "lol",
  "sir",
  "maam",
  "mam",
  "madam",
  "bai",
  "day",
  "inday",
  "dong",
  "nong",
  "manong",
  "manang",
  "te",
  "tol",
  "pre",
  "pare",
  "mare",
  "bro",
  "brad",
  "sis",
  "boss",
  "idol",
  "guys",
  "everyone",
  "there",
  "kfd",
  "admin",
];

/** "hellooo" -> "helo", "salamaaat" -> "salamat": stretched letters count once. */
const squeeze = (w: string) => w.replace(/(.)\1+/g, "$1");

const squeezed = (words: string[]) => new Set(words.map(squeeze));
const GREETING = squeezed(GREETING_WORDS);
const THANKS = squeezed(THANKS_WORDS);
const FILLER = squeezed(FILLER_WORDS);

/** One letter added, dropped or changed. */
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** In the set, or (for words of 5+ letters) one typo from a word in it. */
function inSet(word: string, set: Set<string>): boolean {
  if (set.has(word)) return true;
  if (word.length < 5) return false;
  for (const known of set)
    if (known.length >= 5 && oneEditApart(word, known)) return true;
  return false;
}

const SHOPPING = squeezed([
  "mabakal",
  "magpabakal",
  "mapabili",
  "pabakal",
  "pabili",
  "bakal",
  "bili",
  "order",
  "bakalan",
  "bilhan",
  "palihog",
]);
const SHOPPING_WORD =
  /\b(?:pabakal|pabili|bakal|bili|buy|order|bakalan|bilhan|palihog)\b/i;

export type ChatIntent = "shopping" | "greeting" | "thanks" | "other";

/**
 * Whether a chat message is a pabakal at all, before anything reads it into
 * items -- so "hello" gets a hello back instead of becoming an item called
 * "hello". Shopping needs a sign of an order: a number, a "sa <store>", or a
 * word like pabakal / bili / buy.
 */
export function chatIntent(message: string): ChatIntent {
  const words = message
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "other";

  const plain = words.map(squeeze);
  const kinds = plain.map((w) =>
    inSet(w, THANKS)
      ? "thanks"
      : inSet(w, GREETING)
        ? "greeting"
        : FILLER.has(w)
          ? "filler"
          : null
  );
  if (kinds.every((k) => k !== null)) {
    if (kinds.includes("thanks")) return "thanks";
    if (kinds.includes("greeting")) return "greeting";
    return "other";
  }

  const numbered = words.some(
    (w) =>
      digitsOf(w) !== undefined || w in TENS || DOZEN.has(w) || unitOf(w) !== undefined
  );
  const store = /\b(?:sa|from)\s+\S/i.test(message);
  // "pabakl", "pbili": a misspelled order word is still an order word.
  const asked = SHOPPING_WORD.test(message) || plain.some((w) => inSet(w, SHOPPING));
  // "biogesic po": a product we know is an order even with no number or store.
  const product = plain.some((w) => w.length >= 3 && isKnownProduct(w));
  return numbered || store || asked || product ? "shopping" : "other";
}
