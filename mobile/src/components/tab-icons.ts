import type { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

export type IconName = ComponentProps<typeof Ionicons>["name"];

/**
 * Every tab icon in the app, outline for idle and filled for selected.
 *
 * One map so swapping an icon is a one-line change, and so both layouts cannot
 * pick different glyphs for the same idea (the account and profile tabs share a
 * person on purpose).
 */
export const TAB_ICONS = {
  home: { icon: "home-outline", activeIcon: "home" },
  orders: { icon: "receipt-outline", activeIcon: "receipt" },
  account: { icon: "person-outline", activeIcon: "person" },
  available: { icon: "flash-outline", activeIcon: "flash" },
  deliveries: { icon: "bicycle-outline", activeIcon: "bicycle" },
  earnings: { icon: "cash-outline", activeIcon: "cash" },
  profile: { icon: "person-outline", activeIcon: "person" },
} as const satisfies Record<string, { icon: IconName; activeIcon: IconName }>;
