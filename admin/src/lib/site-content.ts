/**
 * Single source of truth for customer-facing facts on the marketing surface.
 *
 * PRICING
 * -------
 * `DELIVERY_FEE` and `SERVICE_FEE` are the *display* mirror of the only
 * authoritative calculator in the system: public.customer_place_order() in
 * admin/supabase/migrations/0023_customer_place_order.sql, where the totals are
 * computed server-side and never accepted from a client. Keep the two in step;
 * the landing page imports these values rather than repeating the numbers, so a
 * price change is a one-line edit here plus the migration.
 *
 * REAL CONTENT ONLY
 * -----------------
 * Anything a human has to vouch for -- phone number, Messenger link, support
 * hours, delivery barangays, partner restaurants -- is deliberately empty until
 * the owner provides it. The UI hides or softens what is missing instead of
 * inventing a number, an area or a restaurant. Search for TODO(owner).
 */

/** Fee values in Philippine pesos. Mirror of migration 0023. */
export const DELIVERY_FEE = 45;
export const SERVICE_FEE = 5;

/** Minimum order value in pesos, or null when there is no minimum. */
export const MINIMUM_ORDER: number | null = null;

/** True, verifiable facts only. These are service guarantees, not stats. */
export const SERVICE_FACTS = [
  "Cash on delivery",
  "Kabankalan only",
  "Local restaurants",
  "Follow your rider",
] as const;

export const CUSTOMER_BENEFITS = [
  {
    sprite: "crate",
    title: "Fresh from local kitchens",
    body: "Cooked to order by Kabankalan restaurants, not a central commissary.",
  },
  {
    sprite: "scooter",
    title: "Follow your rider",
    body: "Every order gets a reference you can open to see the live status.",
  },
  {
    sprite: "bowl",
    title: "Pay cash at the door",
    body: "No card, no wallet, no prepayment. Bayad when the food arrives.",
  },
] as const;

export const HOW_IT_WORKS = [
  {
    key: "Pili",
    title: "Pili",
    body: "Piliin ang pagkain from the local kitchens open right now.",
  },
  {
    key: "Bayad",
    title: "Bayad",
    body: "Order and pay cash on delivery. No online payment needed.",
  },
  {
    key: "Hintay",
    title: "Hintay",
    body: "Follow your rider live until the food is handed to you at the door.",
  },
] as const;

/**
 * Local dishes worth featuring once partner restaurants are confirmed.
 * Presented as "coming from our kitchens", never as an on-menu promise.
 */
export const LOCAL_SPECIALTIES = ["Piaya", "Inasal", "Kansi", "Napoleones"] as const;

/**
 * Photos of those dishes, from Wikimedia Commons under free licences. They show
 * the dish, not a KFD partner: captions name the food only, and photos that
 * show a business's name or branding were left out. Replace with the owner's
 * own photos of partner kitchens once they exist.
 *
 * CC BY-SA requires credit (author, licence, source), rendered in the footer
 * from PHOTO_CREDITS.
 */
export const DISH_PHOTOS: Record<(typeof LOCAL_SPECIALTIES)[number], string> = {
  Inasal: "/images/food/inasal-meal.jpg",
  Piaya: "/images/food/piaya.jpg",
  Kansi: "/images/food/kansi.jpg",
  Napoleones: "/images/food/napoleones.jpg",
};

/** One line on what each dish is. General food facts, not menu promises. */
export const DISH_DETAILS: Record<(typeof LOCAL_SPECIALTIES)[number], string> = {
  Inasal:
    "Chicken marinated in calamansi, vinegar, lemongrass and annatto, grilled over charcoal.",
  Piaya: "Flat, unleavened bread filled with muscovado sugar and toasted on a griddle.",
  Kansi: "Beef shank and bone marrow soup, soured with batwan fruit.",
  Napoleones: "Flaky puff pastry layered with custard under a sugar glaze.",
};

/**
 * The order stages exactly as the app shows them (mobile/src/lib/order-progress.ts),
 * each with what is happening at that point.
 */
export const ORDER_STAGES = [
  { label: "Order placed", detail: "The kitchen gets your order and the total you saw." },
  { label: "Confirmed", detail: "The restaurant accepts it. Until then you can still cancel." },
  { label: "Being prepared", detail: "Your food is cooked to order." },
  { label: "Out for delivery", detail: "A rider picks it up. Call or text them from the app." },
  { label: "Delivered", detail: "Pay the rider in cash or by GCash, then rate the order." },
] as const;

/** What an applicant can expect, consistent with PARTNER_TERMS. */
export const PARTNER_NEXT_STEPS = [
  "We contact you on the number or email you leave.",
  "We walk you through the terms before you commit to anything.",
  "Once you agree, we set up your account and you can start.",
] as const;

export const HERO_PHOTO = "/images/food/hero-inasal.jpg";
export const KITCHEN_PHOTO = "/images/food/inasal-plate.jpg";

const BY_SA_4 = "https://creativecommons.org/licenses/by-sa/4.0/";

export const PHOTO_CREDITS = [
  {
    subject: "Chicken inasal",
    author: "Obsidian Soul",
    license: "CC BY-SA 4.0",
    licenseUrl: BY_SA_4,
    source: "https://commons.wikimedia.org/wiki/File:Chicken_inasal_(Philippines).jpg",
  },
  {
    subject: "Chicken inasal with rice",
    author: "Roderick Suñaz Sumalinog",
    license: "CC BY-SA 4.0",
    licenseUrl: BY_SA_4,
    source: "https://commons.wikimedia.org/wiki/File:Chicken_inasal_with_rice.jpg",
  },
  {
    subject: "Chicken inasal meal",
    author: "Ralff Nestor Nacor",
    license: "CC BY-SA 4.0",
    licenseUrl: BY_SA_4,
    source: "https://commons.wikimedia.org/wiki/File:Bacolod%27s_Chicken_Inasal_Meal,_Sep_2026.jpg",
  },
  {
    subject: "Piaya",
    author: "Kguirnela",
    license: "CC BY-SA 4.0",
    licenseUrl: BY_SA_4,
    source: "https://commons.wikimedia.org/wiki/File:Piaya.jpg",
  },
  {
    subject: "Kansi",
    author: "Nuwordlife0rder",
    license: "CC BY-SA 4.0",
    licenseUrl: BY_SA_4,
    source: "https://commons.wikimedia.org/wiki/File:Cansi.jpg",
  },
  {
    subject: "Napoleones",
    author: "Nuwordlife0rder",
    license: "CC0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    source: "https://commons.wikimedia.org/wiki/File:Napoleones.jpg",
  },
] as const;

export interface DeliveryWindow {
  /** e.g. "Mon–Sun". */
  days: string;
  /** e.g. "10:00 AM". */
  open: string;
  /** e.g. "9:00 PM". */
  close: string;
}

/**
 * TODO(owner): replace these empties with the real launch values.
 *
 * `areas` are the barangays actually served today -- a customer checks this
 * first, so an invented list is worse than an honest "expanding soon".
 */
export const DELIVERY = {
  areas: [] as string[],
  hours: [] as DeliveryWindow[],
  /** Short note shown when areas/hours are not yet published. */
  note: "Delivery areas and hours will be posted here before launch.",
} as const;

/** TODO(owner): real contacts only. Anything left null is hidden in the UI. */
export const CONTACT = {
  messengerUrl: null as string | null,
  phone: null as string | null,
  email: null as string | null,
  supportHours: null as string | null,
} as const;

export const BUSINESS = {
  name: "Kabankalan Food Delivery",
  /** TODO(owner): DTI/SEC registration number once available. */
  registrationNumber: null as string | null,
} as const;

/** TODO(owner): real social pages only. */
export const SOCIALS = [] as { label: string; href: string }[];

/**
 * TODO(owner): real, permission-cleared restaurants only. Do not seed this
 * with placeholders -- an empty section is honest, a fake one is not.
 */
export const PARTNER_RESTAURANTS = [] as {
  name: string;
  specialty: string;
}[];

/**
 * Partner terms. Kept as explicit copy rather than a number so nothing is
 * invented: update once the pilot rates are signed off.
 */
export const PARTNER_TERMS = {
  restaurant: {
    blurb:
      "Sell on KFD and reach Kabankalan customers without building your own delivery.",
    terms:
      "Pilot commission terms are being finalised. Apply and we will walk you through the exact rates before you commit.",
  },
  rider: {
    blurb:
      "Drive with KFD and earn on your own schedule around Kabankalan.",
    terms:
      "Rider terms are being finalised. Apply and we will explain payouts and requirements before you start.",
  },
} as const;

/**
 * FAQ answers describe how the product actually behaves. Cancellations and
 * delivery-time wording are conservative on purpose -- confirm policy wording
 * with the owner before launch.
 */
export const FAQ = [
  {
    q: "Paano ako magbabayad?",
    a: "Cash on delivery. You pay the rider when your food arrives. KFD does not take card or online payment yet.",
  },
  {
    q: "How long does delivery take?",
    a: "It depends on the kitchen and the distance across Kabankalan. Once you order, your tracking link shows the live status so you are not guessing.",
  },
  {
    q: "Can I cancel my order?",
    a: "Message support as soon as you can. Once the rider has picked the food up, the order usually cannot be cancelled.",
  },
  {
    q: "How do I track my order?",
    a: "Enter the reference from your receipt on the Track page, or open the link you were given. Anyone with the reference can view the order, so keep it private.",
  },
  {
    q: "How do I reach support?",
    a: "Use the contact details in the Support section below. They are being finalised and will be posted here before launch.",
  },
] as const;

/** True when at least one support channel has been configured. */
export function hasContactDetails(): boolean {
  return Boolean(
    CONTACT.messengerUrl || CONTACT.phone || CONTACT.email || CONTACT.supportHours
  );
}
