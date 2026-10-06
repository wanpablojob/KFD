/**
 * URL-backed view state for the customers list.
 *
 * Filters, sort and page live in the query string so a view can be linked,
 * bookmarked and survived by a refresh -- "blocked customers, highest spend
 * first, page 2" is a thing an operator sends to a colleague.
 *
 * Three filter facets, because they answer three different questions and an
 * operator switches between them: who they spend (tier), where they are (city),
 * and whether they may still order (active/blocked). Collapsing them into one
 * enum would mean "Gold" and "blocked" were mutually exclusive, which is exactly
 * the row an operator most wants to find.
 *
 * Search is deliberately NOT parsed here. `?q=` is owned by GlobalSearchSeed and
 * the store in lib/global-search.ts that every list page reads; a second copy
 * would give one filter two sources of truth. This module round-trips `q`
 * unchanged so a shared link still carries it.
 *
 * Every field falls back to its default on anything unrecognised, including
 * garbage: a hand-edited URL must never put the page into a state it cannot
 * render.
 */

export const CUSTOMER_TIER_FILTERS = ["all", "gold", "silver", "standard"] as const;
export type CustomerTierFilter = (typeof CUSTOMER_TIER_FILTERS)[number];

export const CUSTOMER_STATE_FILTERS = ["all", "active", "blocked", "archived"] as const;
export type CustomerStateFilter = (typeof CUSTOMER_STATE_FILTERS)[number];

/** Keys are CustomerStats field names so the comparator needs no mapping table. */
export const CUSTOMER_SORTS = [
  "name",
  "city",
  "ordersCount",
  "totalSpend",
  "lastOrderAt",
] as const;

export type CustomerSortKey = (typeof CUSTOMER_SORTS)[number];

export type SortDir = "asc" | "desc";

export interface CustomerListParams {
  tier: CustomerTierFilter;
  /** Empty string means "every city"; a real city's name otherwise. */
  city: string;
  state: CustomerStateFilter;
  query: string;
  sort: CustomerSortKey;
  dir: SortDir;
  page: number;
}

export const DEFAULT_CUSTOMER_LIST_PARAMS: CustomerListParams = {
  tier: "all",
  city: "",
  state: "all",
  query: "",
  sort: "name",
  dir: "asc",
  page: 1,
};

function isTierFilter(value: string | null): value is CustomerTierFilter {
  return (
    value !== null && (CUSTOMER_TIER_FILTERS as readonly string[]).includes(value)
  );
}

function isStateFilter(value: string | null): value is CustomerStateFilter {
  return (
    value !== null && (CUSTOMER_STATE_FILTERS as readonly string[]).includes(value)
  );
}

function isSort(value: string | null): value is CustomerSortKey {
  return value !== null && (CUSTOMER_SORTS as readonly string[]).includes(value);
}

export function parseCustomerListParams(search: string): CustomerListParams {
  const params = new URLSearchParams(search);

  const rawPage = Number.parseInt(params.get("page") ?? "", 10);
  const page =
    Number.isFinite(rawPage) && rawPage > 0
      ? rawPage
      : DEFAULT_CUSTOMER_LIST_PARAMS.page;

  const dir = params.get("dir");

  return {
    tier: isTierFilter(params.get("tier"))
      ? (params.get("tier") as CustomerTierFilter)
      : DEFAULT_CUSTOMER_LIST_PARAMS.tier,
    city: params.get("city") ?? "",
    state: isStateFilter(params.get("state"))
      ? (params.get("state") as CustomerStateFilter)
      : DEFAULT_CUSTOMER_LIST_PARAMS.state,
    query: params.get("q") ?? "",
    sort: isSort(params.get("sort"))
      ? (params.get("sort") as CustomerSortKey)
      : DEFAULT_CUSTOMER_LIST_PARAMS.sort,
    dir: dir === "desc" ? "desc" : "asc",
    page,
  };
}

/**
 * Omits anything equal to its default, so the common case stays a clean URL
 * rather than accumulating `?tier=all&state=all&sort=name&dir=asc&page=1`.
 */
export function customerListParamsToSearch(params: CustomerListParams): string {
  const search = new URLSearchParams();

  if (params.tier !== DEFAULT_CUSTOMER_LIST_PARAMS.tier) {
    search.set("tier", params.tier);
  }
  if (params.city) search.set("city", params.city);
  if (params.state !== DEFAULT_CUSTOMER_LIST_PARAMS.state) {
    search.set("state", params.state);
  }
  if (params.query.trim()) search.set("q", params.query.trim());
  if (params.sort !== DEFAULT_CUSTOMER_LIST_PARAMS.sort) {
    search.set("sort", params.sort);
  }
  if (params.dir !== DEFAULT_CUSTOMER_LIST_PARAMS.dir) {
    search.set("dir", params.dir);
  }
  if (params.page > 1) search.set("page", String(params.page));

  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
}

/**
 * Changing any view changes which rows exist, so the page must go back to 1.
 * Left to the caller as a predicate rather than done implicitly, because "sort
 * does not reset the page" only shows up once somebody is on page 3.
 */
export function customerViewChangeResetsPage(
  current: CustomerListParams,
  next: CustomerListParams,
): boolean {
  return (
    current.tier !== next.tier ||
    current.city !== next.city ||
    current.state !== next.state ||
    current.query !== next.query ||
    current.sort !== next.sort ||
    current.dir !== next.dir
  );
}