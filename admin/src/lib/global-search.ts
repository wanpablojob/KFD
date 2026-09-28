import { useSyncExternalStore } from "react";

let query = "";
const listeners = new Set<() => void>();

export function setGlobalSearch(value: string): void {
  query = value;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string {
  return query;
}

/**
 * The module-level `query` outlives any one render, so it must never be the
 * server snapshot. `query` is whatever the last visitor on this long-lived
 * process typed, and `getServerSnapshot` is called while rendering to HTML --
 * which is exactly where another user's filter would be baked into the
 * response and cached. The server has no search of its own, so "" is the
 * honest value.
 */
function getServerSnapshot(): string {
  return "";
}

export function useGlobalSearch(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function matchesQuery(
  row: Record<string, unknown>,
  queryToMatch: string,
  fields: string[],
): boolean {
  const q = queryToMatch.trim().toLowerCase();
  if (!q) return true;
  return fields.some((field) => {
    const value = row[field];
    if (value == null) return false;
    return String(value).toLowerCase().includes(q);
  });
}