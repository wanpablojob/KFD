/**
 * Supabase Database types for the mobile app, derived from the admin
 * migrations (admin/supabase/migrations/*.sql) -- the source of truth for the
 * deployed schema. Only the tables and columns this app reads or writes are
 * modelled here; the client is generic over this shape so `.select(...)`
 * mistypes surface at compile time instead of as silent `as` casts.
 *
 * NOTE: regenerate from the live project when a token is available:
 *   supabase gen types typescript --project-id <ref> --schema public
 */

type AppRole = "admin" | "merchant" | "rider" | "customer";
type RestaurantStatus = "active" | "approval" | "suspended";
type RiderStatus = "online" | "busy" | "offline";
type VehicleType = "bicycle" | "scooter" | "motorcycle" | "car";
type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";
type PaymentMethod = "cash" | "card" | "e_wallet";

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export type Database = {
  public: {
    Tables: {
      app_users: {
        Row: {
          user_id: string;
          role: AppRole;
          restaurant_id: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      restaurants: {
        Row: {
          id: string;
          name: string;
          cuisine: string;
          city: string;
          rating: number;
          orders_count: number;
          revenue: number;
          status: RestaurantStatus;
          joined_at: string;
          created_at: string;
          archived_at: string | null;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      menu_items: {
        Row: {
          id: string;
          restaurant: string;
          restaurant_id: string;
          name: string;
          category: string;
          price: number;
          available: boolean;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          table_name: string;
          record_id: string | null;
          action: "insert" | "update" | "delete";
          actor_user_id: string | null;
          old_role: AppRole | null;
          new_role: AppRole | null;
          old_restaurant_id: string | null;
          new_restaurant_id: string | null;
          changed_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      riders: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string | null;
          user_id: string | null;
          city: string;
          vehicle: VehicleType;
          status: RiderStatus;
          deliveries: number;
          rating: number;
          earnings: number;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          reference: string;
          customer: string;
          restaurant: string;
          items: OrderItem[];
          subtotal: number;
          delivery_fee: number;
          service_fee: number;
          total: number;
          status: OrderStatus;
          payment: PaymentMethod;
          placed_at: string;
          rider: string | null;
          restaurant_id: string | null;
          customer_user_id: string | null;
          delivery_address: string | null;
          rider_id: string | null;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      track_order: {
        Args: { p_reference: string };
        Returns: {
          reference: string;
          restaurant: string;
          items: OrderItem[];
          subtotal: number;
          delivery_fee: number;
          total: number;
          status: string;
          payment: string;
          placed_at: string;
        }[];
      };
      rider_set_status: {
        Args: { p_status: RiderStatus };
        Returns: unknown;
      };
      rider_mark_delivered: {
        Args: { p_order_id: string };
        Returns: unknown;
      };
      register_customer: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      customer_place_order: {
        Args: {
          p_restaurant_id: string;
          p_items: unknown;
          p_delivery_address: string;
          p_payment: PaymentMethod;
        };
        Returns: {
          order_id: string;
          reference: string;
          total: number;
          status: string;
        }[];
      };
      search_restaurants: {
        Args: {
          p_query?: string;
          p_cuisine?: string;
        };
        Returns: {
          id: string;
          name: string;
          cuisine: string;
          city: string;
          rating: number;
          status: RestaurantStatus;
          archived_at: string | null;
        }[];
      };
      fetch_rider_orders_page: {
        Args: {
          p_cursor?: string | null;
          p_limit?: number;
        };
        Returns: {
          id: string;
          reference: string;
          customer: string;
          restaurant: string;
          items: OrderItem[];
          total: number;
          status: OrderStatus;
          payment: PaymentMethod;
          placed_at: string;
          next_cursor: string | null;
        }[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
