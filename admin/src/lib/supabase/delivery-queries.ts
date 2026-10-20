import { supabase } from "./client";

/**
 * The trips (0099).
 *
 * A trip is one basket from several shops: one address, one rider, one
 * drop-off, one amount collected. The orders table holds one row per shop, so
 * the trip itself is the only place the basket as a whole exists -- and the
 * only place its fees, its rider and its cash are.
 */

export interface AdminDelivery {
  id: string;
  reference: string;
  customer: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryBarangay: string | null;
  status: string;
  /** How many shops are still in the trip. */
  shops: number;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  rider: string;
  /** What the rider took, once the trip is closed. */
  cashCollected: number | null;
  placedAt: string;
  deliveredAt: string | null;
  /** The shops in the trip. */
  restaurantNames: string[];
}

export interface AdminDeliveryStop {
  orderId: string;
  reference: string;
  restaurant: string;
  status: string;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  items: { name: string; quantity: number; price: number }[];
  rider: string;
  riderPayout: number | null;
  rejectionReason: string | null;
  deliveryFailedReason: string | null;
  placedAt: string;
}

export interface AdminDeliveryPayout {
  orderId: string;
  amount: number;
  settlementState: string;
  gcashReference: string | null;
  earnedAt: string;
}

export interface AdminDeliveryCash {
  amountExpected: number;
  amountCollected: number;
  variance: number;
  collectedAt: string;
}

export interface AdminDeliveryDetail {
  id: string;
  reference: string;
  customer: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryBarangay: string | null;
  status: string;
  shops: number;
  subtotal: number;
  baseDeliveryFee: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  rider: string | null;
  riderPayout: number | null;
  cashCollected: number | null;
  gcashReference: string | null;
  feeAgreedInPerson: boolean;
  placedAt: string;
  deliveredAt: string | null;
  deliveryPhotoPath: string | null;
  stops: AdminDeliveryStop[];
  payouts: AdminDeliveryPayout[];
  cash: AdminDeliveryCash[];
}

const num = (value: unknown): number =>
  value === null || value === undefined ? 0 : Number(value);

const str = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

/**
 * Every trip, newest first.
 *
 * Read through admin_deliveries() rather than the table: the list needs the
 * shops in each trip, and that is an aggregate the client cannot do without
 * a query per row.
 */
export async function fetchDeliveries(limit = 100): Promise<AdminDelivery[]> {
  const { data, error } = await supabase.rpc("admin_deliveries", {
    p_limit: limit,
  });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.delivery_id,
    reference: row.reference,
    customer: row.customer,
    customerPhone: row.customer_phone ?? "",
    deliveryAddress: row.delivery_address ?? "",
    deliveryBarangay: row.delivery_barangay ?? null,
    status: row.status,
    shops: row.shops,
    subtotal: num(row.subtotal),
    deliveryFee: num(row.delivery_fee),
    serviceFee: num(row.service_fee),
    total: num(row.total),
    rider: row.rider ?? "",
    cashCollected: row.cash_collected === null ? null : num(row.cash_collected),
    placedAt: row.placed_at,
    deliveredAt: row.delivered_at ?? null,
    restaurantNames: Array.isArray(row.restaurant_names)
      ? (row.restaurant_names as string[])
      : [],
  }));
}

/**
 * One trip in full: the shops and their statuses, the fees, the rider, the
 * payouts and the cash collected against the grand total.
 */
export async function fetchDeliveryDetail(
  deliveryId: string,
): Promise<AdminDeliveryDetail | null> {
  const { data, error } = await supabase.rpc("admin_delivery_detail", {
    p_delivery_id: deliveryId,
  });
  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown> | null;
  if (!row) return null;

  const stops = Array.isArray(row.stops) ? row.stops : [];
  const payouts = Array.isArray(row.payouts) ? row.payouts : [];
  const cash = Array.isArray(row.cash) ? row.cash : [];

  return {
    id: str(row.id),
    reference: str(row.reference),
    customer: str(row.customer),
    customerPhone: str(row.customer_phone),
    deliveryAddress: str(row.delivery_address),
    deliveryBarangay: (row.delivery_barangay as string | null) ?? null,
    status: str(row.status),
    shops: num(row.shops),
    subtotal: num(row.subtotal),
    baseDeliveryFee: num(row.base_delivery_fee),
    deliveryFee: num(row.delivery_fee),
    serviceFee: num(row.service_fee),
    total: num(row.total),
    rider: (row.rider as string | null) ?? null,
    riderPayout: row.rider_payout === null ? null : num(row.rider_payout),
    cashCollected: row.cash_collected === null ? null : num(row.cash_collected),
    gcashReference: (row.gcash_reference as string | null) ?? null,
    feeAgreedInPerson: row.fee_agreed_in_person === true,
    placedAt: str(row.placed_at),
    deliveredAt: (row.delivered_at as string | null) ?? null,
    deliveryPhotoPath: (row.delivery_photo_path as string | null) ?? null,
    stops: stops.flatMap((stop) => {
      if (stop === null || typeof stop !== "object") return [];
      const s = stop as Record<string, unknown>;
      if (typeof s.order_id !== "string") return [];
      const items = Array.isArray(s.items) ? s.items : [];
      return [
        {
          orderId: s.order_id,
          reference: str(s.reference),
          restaurant: str(s.restaurant),
          status: str(s.status),
          subtotal: num(s.subtotal),
          deliveryFee: num(s.delivery_fee),
          serviceFee: num(s.service_fee),
          total: num(s.total),
          items: items.flatMap((item) => {
            if (item === null || typeof item !== "object") return [];
            const i = item as Record<string, unknown>;
            return [
              {
                name: str(i.name),
                quantity: num(i.quantity),
                price: num(i.price),
              },
            ];
          }),
          rider: str(s.rider),
          riderPayout: s.rider_payout === null ? null : num(s.rider_payout),
          rejectionReason: (s.rejection_reason as string | null) ?? null,
          deliveryFailedReason: (s.delivery_failed_reason as string | null) ?? null,
          placedAt: str(s.placed_at),
        },
      ];
    }),
    payouts: payouts.flatMap((payout) => {
      if (payout === null || typeof payout !== "object") return [];
      const p = payout as Record<string, unknown>;
      if (typeof p.order_id !== "string") return [];
      return [
        {
          orderId: p.order_id,
          amount: num(p.amount),
          settlementState: str(p.settlement_state),
          gcashReference: (p.gcash_reference as string | null) ?? null,
          earnedAt: str(p.earned_at),
        },
      ];
    }),
    cash: cash.flatMap((c) => {
      if (c === null || typeof c !== "object") return [];
      const row = c as Record<string, unknown>;
      return [
        {
          amountExpected: num(row.amount_expected),
          amountCollected: num(row.amount_collected),
          variance: num(row.variance),
          collectedAt: str(row.collected_at),
        },
      ];
    }),
  };
}
