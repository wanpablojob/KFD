/**
 * The customer home browses dishes by kind, the way food apps do ("Coffee",
 * "Rice meals", "Sizzling"), across every shop. Each shop names its own menu
 * sections ("Matcha", "Value Meals", "Sizzlers"), so this maps them onto one
 * shared set: the shop's category decides first, the dish name only when the
 * category says nothing. Add-ons and extras are not dishes and are left out.
 *
 * Words match whole ("tea" never matches "steak"), and the first group that
 * matches wins, so the order below is deliberate.
 */
import { groupSizes, type SizedRow } from "./menu-sizes";

export const FOOD_GROUPS = [
  { key: "coffee", label: "Coffee & Matcha", icon: "cafe" },
  { key: "drinks", label: "Drinks & Shakes", icon: "beer" },
  { key: "desserts", label: "Desserts & Pastries", icon: "ice-cream" },
  { key: "rice", label: "Rice Meals", icon: "restaurant" },
  { key: "sizzling", label: "Sizzling", icon: "flame" },
  { key: "grill", label: "Inasal & Grill", icon: "bonfire" },
  { key: "seafood", label: "Seafood", icon: "fish" },
  { key: "noodles", label: "Soup & Noodles", icon: "water" },
  { key: "pasta", label: "Pasta & Pizza", icon: "pizza" },
  { key: "burgers", label: "Burgers & Sandwiches", icon: "fast-food" },
  { key: "snacks", label: "Snacks", icon: "nutrition" },
  { key: "salads", label: "Salads", icon: "leaf" },
  { key: "mains", label: "Chicken, Pork & Beef", icon: "restaurant-outline" },
] as const;

export type FoodGroupKey = (typeof FOOD_GROUPS)[number]["key"];

const SKIP = ["add-on", "add-ons", "addon", "extra", "extras", "additional"];

// Checked in this order; the first match wins.
const RULES: [FoodGroupKey, string[]][] = [
  [
    "desserts",
    [
      "pastry",
      "pastries",
      "cake",
      "cheesecake",
      "dessert",
      "desserts",
      "brownie",
      "brownies",
      "loaf",
      "crinkles",
      "flan",
      "tres leches",
      "sambo",
      "halo-halo",
      "halo halo",
      "mais con yelo",
      "float",
      "tiramisu",
    ],
  ],
  [
    "drinks",
    [
      "non-coffee",
      "milk tea",
      "shake",
      "shakes",
      "frappe",
      "frap",
      "frappucino",
      "juice",
      "soda",
      "fruit soda",
      "iced tea",
      "fruit tea",
      "tea",
      "drink",
      "drinks",
      "beverage",
      "beverages",
      "refreshment",
      "refreshments",
      "sticky milk",
      "cooler",
      "coolers",
      "lemonade",
      "dalandan",
      "coke",
      "sprite",
      "pepsi",
      "mt dew",
      "mt. dew",
      "water",
      "freshly squeezed",
      "specialty",
    ],
  ],
  [
    "coffee",
    [
      "coffee",
      "latte",
      "americano",
      "espresso",
      "cappuccino",
      "macchiato",
      "mocha",
      "matcha",
      "cold brew",
      "kohi",
      "barista",
      "sikwate",
    ],
  ],
  ["salads", ["salad", "salads"]],
  [
    "pasta",
    ["pasta", "pizza", "spaghetti", "carbonara", "lasagna", "aglio-olio", "aglio"],
  ],
  [
    "burgers",
    [
      "burger",
      "burgers",
      "sandwich",
      "sandwiches",
      "hash",
      "toast",
      "wrap",
      "shawarma",
      "burrito",
      "quesadilla",
    ],
  ],
  [
    "noodles",
    [
      "soup",
      "batchoy",
      "noodle",
      "noodles",
      "ramen",
      "sinigang",
      "tinola",
      "bulalo",
      "molo",
      "pancit",
      "sotanghon",
      "cansi",
      "nilagpang",
      "palabok",
    ],
  ],
  [
    "seafood",
    [
      "seafood",
      "seafoods",
      "bangus",
      "shrimp",
      "pasayan",
      "alimango",
      "talaba",
      "calamares",
      "fish",
      "tilapia",
      "malasugi",
      "squid",
      "gambas",
      "camaron",
    ],
  ],
  [
    "grill",
    [
      "inasal",
      "grill",
      "grilled",
      "barbecue",
      "bbq",
      "lechon",
      "liempo",
      "pecho",
      "paa",
      "pakpak",
      "pak-pak",
      "belly",
    ],
  ],
  ["sizzling", ["sizzling", "sizzler", "sizzlers", "sisig"]],
  [
    "rice",
    [
      "rice meal",
      "rice meals",
      "value meal",
      "value meals",
      "silog",
      "rice bowl",
      "rice bowls",
      "kimbap",
      "meal",
      "meals",
      "unli rice",
    ],
  ],
  [
    "snacks",
    [
      "snack",
      "snacks",
      "quick bites",
      "starter",
      "starters",
      "appetizer",
      "appetizers",
      "fries",
      "nachos",
      "nacho",
      "wings",
      "lumpia",
      "siomai",
      "cheese sticks",
      "corn dog",
      "short orders",
      "kakanin",
      "puto",
      "tikoy",
      "suman",
      "turon",
      "chicken in a basket",
    ],
  ],
  [
    "mains",
    [
      "chicken",
      "pork",
      "beef",
      "mains",
      "vegetables",
      "vegies",
      "chopsuey",
      "manok",
      "adobo",
      "kare-kare",
      "crispy pata",
    ],
  ],
];

function has(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(text);
}

function match(text: string): FoodGroupKey | null {
  const lower = text.toLowerCase();
  for (const [group, words] of RULES) {
    if (words.some((w) => has(lower, w))) return group;
  }
  return null;
}

/** The food group of a menu item, or null for an add-on or extra. */
export function foodGroupOf(
  category: string | null,
  name: string
): FoodGroupKey | "other" | null {
  const cat = (category ?? "").toLowerCase();
  if (SKIP.some((w) => has(cat, w))) return null;
  // Plain rice on its own is a side, not a meal to browse.
  if (
    cat.trim() === "rice" ||
    /^(plain |garlic |java )?rice( \(.*\))?$/i.test(name.trim())
  )
    return null;
  return match(cat) ?? match(name) ?? "other";
}

export interface BrowseItem extends SizedRow {
  restaurant: string;
  restaurant_id: string;
  image_url: string | null;
}

export interface BrowseDish {
  key: string;
  name: string;
  restaurantId: string;
  restaurantName: string;
  /** The cheapest size. */
  price: number;
  hasSizes: boolean;
  imageUrl: string | null;
}

/**
 * Dishes per food group, sizes folded into one dish ("Creamy Matcha", from
 * P105), open shops first. Groups with no dishes are left out.
 */
export function dishesByGroup<T extends BrowseItem>(
  items: readonly T[],
  openShopIds: ReadonlySet<string>
): Map<FoodGroupKey | "other", BrowseDish[]> {
  const byShop = new Map<string, T[]>();
  for (const item of items) {
    const list = byShop.get(item.restaurant_id) ?? [];
    list.push(item);
    byShop.set(item.restaurant_id, list);
  }

  const out = new Map<FoodGroupKey | "other", BrowseDish[]>();
  for (const shopItems of byShop.values()) {
    for (const dish of groupSizes(shopItems)) {
      const first = dish.sizes[0].row;
      const group = foodGroupOf(first.category, dish.name);
      if (!group) continue;
      const list = out.get(group) ?? [];
      list.push({
        key: dish.key,
        name: dish.name,
        restaurantId: first.restaurant_id,
        restaurantName: first.restaurant,
        price: Math.min(...dish.sizes.map((s) => s.row.price)),
        hasSizes: dish.sizes.length > 1,
        imageUrl: dish.sizes.find((s) => s.row.image_url)?.row.image_url ?? null,
      });
      out.set(group, list);
    }
  }
  for (const list of out.values()) {
    list.sort(
      (a, b) =>
        Number(openShopIds.has(b.restaurantId)) -
          Number(openShopIds.has(a.restaurantId)) || a.name.localeCompare(b.name)
    );
  }
  return out;
}
