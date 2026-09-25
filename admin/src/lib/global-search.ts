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

export function useGlobalSearch(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
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