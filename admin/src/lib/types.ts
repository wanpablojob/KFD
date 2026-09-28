export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export type PaymentMethod = "cash" | "card" | "e_wallet";

export type RestaurantStatus = "active" | "approval" | "suspended";

export type RiderStatus = "online" | "busy" | "offline";

export type VehicleType = "bicycle" | "scooter" | "motorcycle" | "car";

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  reference: string;
  customer: string;
  restaurant: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  payment: PaymentMethod;
  placedAt: string;
  rider: string;
  /** Merchant's stated reason for a cancellation. Null on other statuses. */
  rejectionReason: string | null;
}

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  city: string;
  rating: number;
  ordersCount: number;
  revenue: number;
  status: RestaurantStatus;
  joinedAt: string;
}

export interface Rider {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  vehicle: VehicleType;
  status: RiderStatus;
  deliveries: number;
  rating: number;
  earnings: number;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  ordersCount: number;
  totalSpend: number;
  joinedAt: string;
}

export interface MenuItem {
  id: string;
  restaurant: string;
  name: string;
  category: string;
  price: number;
  available: boolean;
}

export interface Kpi {
  label: string;
  value: string;
  /**
   * Optional period-over-period change, as a percentage. Absent means the
   * metric is a level with no meaningful comparison (Prompt 2.3): a success
   * rate has no "previous" and rendering a trend arrow beside it is
   * misleading, so the card omits the trend block entirely.
   */
  delta?: number;
  hint: string;
}

export interface RevenuePoint {
  label: string;
  orders: number;
  revenue: number;
}