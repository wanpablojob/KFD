/**
 * "Picked for you" on the customer Home tab.
 *
 * The phone builds a small taste profile from the customer's own delivered
 * orders and what is open right now, and asks the server for AI picks
 * (/api/home/picks). When the AI is unavailable the same profile is scored by
 * rules here, so Home is personal either way.
 *
 * The profile carries restaurants, cuisines, item names and when orders were
 * placed -- no name, phone, address or money.
 */

import { postApiJson } from "./admin-api";

export interface TasteOrder {
  restaurant_id: string | null;
  status: string;
  placed_at: string;
  items: { name: string }[];
}

export interface TasteRestaurant {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  is_open: boolean;
}

export interface TasteProfile {
  now: { weekday: number; hour: number };
  history: { restaurant_id: string; weekday: number; hour: number; items: string[] }[];
  favorites: string[];
  open: { id: string; name: string; cuisine: string; rating: number }[];
}

export interface Pick {
  restaurant_id: string;
  reason: string;
}

export interface HomePicks {
  greeting: string;
  picks: Pick[];
  source: "ai" | "rules";
}

const MAX_HISTORY = 20;
const MAX_OPEN = 40;
export const MAX_PICKS = 4;

export function buildTasteProfile(
  orders: TasteOrder[],
  restaurants: TasteRestaurant[],
  favoriteIds: string[],
  now: Date
): TasteProfile {
  return {
    now: { weekday: now.getDay(), hour: now.getHours() },
    history: orders
      .filter((o) => o.status === "delivered" && o.restaurant_id)
      .sort((a, b) => b.placed_at.localeCompare(a.placed_at))
      .slice(0, MAX_HISTORY)
      .map((o) => {
        const at = new Date(o.placed_at);
        return {
          restaurant_id: o.restaurant_id as string,
          weekday: at.getDay(),
          hour: at.getHours(),
          items: o.items.map((i) => i.name).slice(0, 5),
        };
      }),
    favorites: favoriteIds,
    open: restaurants
      .filter((r) => r.is_open)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, MAX_OPEN)
      .map(({ id, name, cuisine, rating }) => ({ id, name, cuisine, rating })),
  };
}

/** Hiligaynon, for the time of day. */
export function greetingFor(hour: number): string {
  if (hour < 11) return "Maayong aga! Breakfast time?";
  if (hour < 14) return "Maayong udto! Ready for lunch?";
  if (hour < 18) return "Maayong hapon! Merienda?";
  return "Maayong gab-i! What's for dinner?";
}

/** Within two hours of now, wrapping past midnight. */
const nearHour = (a: number, b: number) =>
  Math.min(Math.abs(a - b), 24 - Math.abs(a - b)) <= 2;

/**
 * The rule-based picks: places the customer goes back to at this time of day,
 * favourites, the cuisines they order, then well-rated places to try.
 */
export function rulePicks(profile: TasteProfile): HomePicks {
  const visits = new Map<string, { total: number; nearNow: number }>();
  const cuisineCount = new Map<string, number>();
  const cuisineOf = new Map(profile.open.map((r) => [r.id, r.cuisine]));
  for (const h of profile.history) {
    const v = visits.get(h.restaurant_id) ?? { total: 0, nearNow: 0 };
    v.total += 1;
    if (nearHour(h.hour, profile.now.hour)) v.nearNow += 1;
    visits.set(h.restaurant_id, v);
    const cuisine = cuisineOf.get(h.restaurant_id);
    if (cuisine) cuisineCount.set(cuisine, (cuisineCount.get(cuisine) ?? 0) + 1);
  }
  const favorites = new Set(profile.favorites);

  const scored = profile.open.map((r) => {
    const v = visits.get(r.id);
    const cuisine = cuisineCount.get(r.cuisine) ?? 0;
    const score =
      (v?.nearNow ?? 0) * 3 +
      (v?.total ?? 0) +
      (favorites.has(r.id) ? 2 : 0) +
      (v ? 0 : cuisine) +
      r.rating / 5;
    const reason = v?.nearNow
      ? "You often order here around this time"
      : favorites.has(r.id)
        ? "One of your favourites"
        : v
          ? "You've ordered here before"
          : cuisine > 0
            ? `Because you like ${r.cuisine}`
            : r.rating >= 4
              ? "Top rated and open now"
              : "Open now";
    return { restaurant_id: r.id, reason, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return {
    greeting: greetingFor(profile.now.hour),
    picks: scored.slice(0, MAX_PICKS).map(({ restaurant_id, reason }) => ({
      restaurant_id,
      reason,
    })),
    source: "rules",
  };
}

/**
 * Keep only what the server may say: open restaurants from the profile, each
 * once, short text. Anything else and the rules answer instead.
 */
export function picksFromReply(reply: unknown, profile: TasteProfile): HomePicks {
  const fallback = rulePicks(profile);
  if (typeof reply !== "object" || reply === null) return fallback;
  const { greeting, picks } = reply as { greeting?: unknown; picks?: unknown };
  if (!Array.isArray(picks)) return fallback;
  const open = new Set(profile.open.map((r) => r.id));
  const seen = new Set<string>();
  const clean: Pick[] = [];
  for (const p of picks) {
    if (typeof p !== "object" || p === null) continue;
    const { restaurant_id, reason } = p as {
      restaurant_id?: unknown;
      reason?: unknown;
    };
    if (typeof restaurant_id !== "string" || !open.has(restaurant_id)) continue;
    if (seen.has(restaurant_id) || typeof reason !== "string" || !reason.trim())
      continue;
    seen.add(restaurant_id);
    clean.push({ restaurant_id, reason: reason.trim().slice(0, 80) });
    if (clean.length === MAX_PICKS) break;
  }
  if (clean.length === 0) return fallback;
  return {
    greeting:
      typeof greeting === "string" && greeting.trim()
        ? greeting.trim().slice(0, 80)
        : fallback.greeting,
    picks: clean,
    source: "ai",
  };
}

/** Ask the server, then fall back to the rules on the phone. */
export async function fetchHomePicks(profile: TasteProfile): Promise<HomePicks> {
  if (profile.open.length === 0) return rulePicks(profile);
  const reply = await postApiJson<unknown>("/api/home/picks", { profile });
  return picksFromReply(reply, profile);
}
