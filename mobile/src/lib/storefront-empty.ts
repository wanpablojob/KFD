/**
 * Which empty state the storefront should show, if any.
 *
 * The home screen used to decide this from `cuisines.length === 0`, which is
 * the wrong question: the chip list is derived from the *filtered* result, so a
 * search that matched nothing also emptied the chips and the screen announced
 * "No places are open for orders right now" -- a claim about the restaurant
 * catalogue, made on the strength of a typo. The two cases are genuinely
 * different and get different copy (and a way out) here.
 *
 * "Loading" and "error" are returned as kinds rather than handled by early
 * returns in the screen so the header (search box + chips) stays mounted: the
 * old code replaced the whole screen, which unmounted the TextInput and threw
 * away focus and in-progress text mid-search.
 */
export type StorefrontEmptyKind = "loading" | "error" | "no_places" | "no_match";

export interface StorefrontEmptyArgs {
  isLoading: boolean;
  isError: boolean;
  /** Active restaurants before any search/cuisine filter. */
  catalogueCount: number;
  /** Restaurants the current query/cuisine matched. */
  resultCount: number;
  /** True when a search term or cuisine chip is narrowing the list. */
  filtersActive: boolean;
}

export function storefrontEmptyState(
  args: StorefrontEmptyArgs
): StorefrontEmptyKind | null {
  if (args.isLoading) return "loading";
  if (args.isError) return "error";

  // A non-empty result is a result: nothing to say.
  if (args.resultCount > 0) return null;

  // No restaurants in the unfiltered catalogue is the only honest "none open".
  if (args.catalogueCount === 0) return "no_places";

  // Restaurants exist but the filter matched none of them.
  if (args.filtersActive) return "no_match";

  // Catalogue non-empty yet the unfiltered query returned nothing. Fall back to
  // the catalogue-level message rather than blaming a filter that is not set.
  return "no_places";
}
