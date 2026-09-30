/**
 * Customer-facing design tokens: a warm, appetising palette drawn from the
 * Kabankalan Food Delivery logo (red -> orange -> gold -> cream).
 *
 * The app previously hardcoded ~19 hex values per screen in a cold navy/blue
 * "pixel" theme. That made the customer half read as an arcade cabinet and made
 * a brand change a find-and-replace across every file. These tokens are the
 * single source of truth for the storefront and the auth screens; the rider and
 * account surfaces deliberately keep their own dark theme until they are
 * redesigned (this file is not a global override).
 *
 * Usage rules that keep the warmth coherent:
 *   * background / card / surface carry the cream, the text carries the brown.
 *     Never a cool grey.
 *   * primary is reserved for real actions (Order Now, Place Order, Sign in).
 *     Prices, badges and highlights use accent/gold instead, so the red keeps
 *     its meaning.
 *   * shadow is warm (brown-ish), never neutral black -- a black drop shadow
 *     on cream reads as dirt.
 */

export const colors = {
  /** Deep crimson: the logo's anchor colour and the only "do this" red. */
  primary: "#A3130A",
  primaryDark: "#7E0E07",
  primarySoft: "#F6DDD6",

  /** Burnt orange: borders, inactive iconography, section rules. */
  secondary: "#CD6D18",
  /** Golden orange: prices, ratings, food-category accents. */
  accent: "#D59E50",
  /** Warm gold: promo badges, "new"/"sale" chips. */
  gold: "#ECC97B",
  goldSoft: "#FBF1D8",

  /** Page background. Warm cream, never grey. */
  background: "#FFF8E7",
  /** Raised surfaces: cards, inputs, sheets. */
  card: "#FFFFFF",
  /** A second, quieter card tone for nested blocks. */
  surface: "#FDF3DC",

  /** Primary body text: dark brown instead of black. */
  text: "#3A2115",
  textMuted: "#795548",
  textFaint: "#A1887F",
  textInverse: "#FEFEFE",

  border: "#EBD9B8",
  borderStrong: "#D59E50",

  success: "#2E7D32",
  successSoft: "#E3F1E4",
  danger: "#B3261E",
  dangerSoft: "#FBE6E4",
  warning: "#CD6D18",

  /** Warm drop shadow. Neutral black on cream looks like grime. */
  shadow: "#9E5C28",
} as const;

/**
 * Rounded, soft-edged shapes per the Foodpanda-style direction. The old theme
 * used borderRadius: 0 everywhere; corners are the loudest signal that this is
 * a different product, so they get a token rather than inline numbers.
 */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Warm elevation. iOS reads shadow*, Android reads elevation, so a card needs
 * both to look the same on either platform. Kept subtle: heavy shadows on a
 * cream background fight the food photography.
 */
export const shadow = {
  card: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
} as const;

/** Text tokens, so type scale is consistent across the storefront. */
export const type = {
  display: { fontSize: 26, fontWeight: "800" as const, color: colors.text },
  title: { fontSize: 20, fontWeight: "800" as const, color: colors.text },
  heading: { fontSize: 17, fontWeight: "700" as const, color: colors.text },
  body: { fontSize: 15, fontWeight: "400" as const, color: colors.text },
  label: { fontSize: 13, fontWeight: "600" as const, color: colors.textMuted },
  caption: { fontSize: 12, fontWeight: "500" as const, color: colors.textMuted },
  /** Small all-caps eyebrow above a section. */
  eyebrow: {
    fontSize: 11,
    fontWeight: "800" as const,
    letterSpacing: 1.2,
    color: colors.secondary,
  },
  price: { fontSize: 16, fontWeight: "800" as const, color: colors.primary },
} as const;
