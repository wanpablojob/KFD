/**
 * URL-backed view state for the riders list.
 *
 * Filters, sort and page live in the query string so a view can be linked,
 * bookmarked and survived by a refresh -- "the online riders, worst rating
 * first, page 2" is a thing an admin sends to a colleague in chat.
 *
 * Search is deliberately NOT parsed here. `?q=` is owned by GlobalSearchSeed
 * and the module-level store in lib/global-search.ts, which every list page
 * already reads; taking a second copy of it in this module would give the same
 * filter two sources of truth. This module round-trips `q` unchanged so a
 * shareable link still carries it.
 */

export const RIDER_FILTERS = [
  "all",
  "online",
  "busy",
  "offline",
  "archived",
  "suspended",
] as const;

export type RiderFilter = (typeof RIDER_FILTERS)[number];

/**
 * Keys are the `RiderOverview` field names, not the table column keys, so
 * `compareRiders(row, row, key, dir)` needs no mapping table in the page.
 *
 * `current_order_reference` is here because "who is free" is a question an admin
 * asks the list, and it is the one sortable field that can be null -- see
 * compareRiders' handling of missing values.
 */
export const RIDER_SORTS = [
  "name",
  "city",
  "vehicle",
  "deliveries",
  "rating",
  "earnings",
  "week_earnings",
  "current_order_reference",
  "suspended_at",
] as const;

export type RiderSortKey = (typeof RIDER_SORTS)[number];

export type SortDir = "asc" | "desc";

export interface RiderListParams {
  filter: RiderFilter;
  query: string;
  sort: RiderSortKey;
  dir: SortDir;
  page: number;
}

export const DEFAULT_RIDER_LIST_PARAMS: RiderListParams = {
  filter: "all",
  query: "",
  sort: "name",
  dir: "asc",
  page: 1,
};

function isFilter(value: string | null): value is RiderFilter {
  return value !== null && (RIDER_FILTERS as readonly string[]).includes(value);
}

function isSort(value: string | null): value is RiderSortKey {
  return value !== null && (RIDER_SORTS as readonly string[]).includes(value);
}

/**
 * Every field falls back to its default on anything unrecognised, including
 * garbage. A hand-edited URL must never be able to put the page into a state it
 * cannot render.
 */
export function parseRiderListParams(search: string): RiderListParams {
  const params = new URLSearchParams(search);

  const rawPage = Number.parseInt(params.get("page") ?? "", 10);
  const page =
    Number.isFinite(rawPage) && rawPage > 0 ? rawPage : DEFAULT_RIDER_LIST_PARAMS.page;

  const dir = params.get("dir");

  return {
    filter: isFilter(params.get("status"))
      ? params.get("status") as RiderFilter
      : DEFAULT_RIDER_LIST_PARAMS.filter,
    query: params.get("q") ?? "",
    sort: isSort(params.get("sort"))
      ? params.get("sort") as RiderSortKey
      : DEFAULT_RIDER_LIST_PARAMS.sort,
    dir: dir === "desc" ? "desc" : "asc",
    page,
  };
}

/**
 * Omits anything equal to its default, so the common case stays a clean URL
 * rather than accumulating `?status=all&sort=name&dir=asc&page=1`.
 */
export function riderListParamsToSearch(params: RiderListParams): string {
  const search = new URLSearchParams();

  if (params.filter !== DEFAULT_RIDER_LIST_PARAMS.filter) {
    search.set("status", params.filter);
  }
  if (params.query.trim()) search.set("q", params.query.trim());
  if (params.sort !== DEFAULT_RIDER_LIST_PARAMS.sort) {
    search.set("sort", params.sort);
  }
  if (params.dir !== DEFAULT_RIDER_LIST_PARAMS.dir) {
    search.set("dir", params.dir);
  }
  if (params.page > 1) search.set("page", String(params.page));

  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
}

/**
 * Changing any of these narrows or reorders the result set, so the page has to
 * go back to 1. Left to the caller as a predicate rather than done implicitly,
 * because "sort does not reset the page" is a bug that only shows up once
 * somebody is on page 3.
 */
export function viewChangeResetsPage(
  current: RiderListParams,
  next: RiderListParams,
): boolean {
  return (
    current.filter !== next.filter ||
    current.query !== next.query ||
    current.sort !== next.sort ||
    current.dir !== next.dir
  );
}

/**
 * Nullish-safe: a rider with a null phone or no current job must sort to the
 * bottom in ascending order rather than to the top, so they read as absent
 * instead of as urgent.
 */
export function compareRiders(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  key: RiderSortKey,
  dir: SortDir,
): number {
  const sign = dir === "asc" ? 1 : -1;
  const left = a[key];
  const right = b[key];

  const leftMissing = left === null || left === undefined || left === "";
  const rightMissing = right === null || right === undefined || right === "";
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;

  if (typeof left === "number" && typeof right === "number") {
    return (left - right) * sign;
  }

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  }) * sign;
}