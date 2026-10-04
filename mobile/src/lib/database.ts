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
      /**
       * The failure leg of a delivery (migration 0044). Returns the order to
       * the dispatch pool and records why, so the order stops being a lie the
       * rider has to tell to get rid of it.
       */
      rider_report_failed_delivery: {
        Args: { p_order_id: string; p_reason: string };
        Returns: {
          order_id: string;
          reference: string;
          status: OrderStatus;
        }[];
      };
      /**
       * Live delivery offers addressed to the calling rider (migration 0045).
       * rider_payout is absent because the order is not claimed yet: the fee is
       * the standard rate, frozen onto the order only when the rider accepts.
       */
      fetch_rider_offers: {
        Args: Record<string, never>;
        Returns: {
          offer_id: number;
          order_id: string;
          reference: string;
          restaurant: string;
          customer: string;
          delivery_address: string | null;
          items: OrderItem[];
          total: number;
          order_status: OrderStatus;
          payout_per_delivery: number | null;
          city: string | null;
          offered_at: string;
          expires_at: string;
        }[];
      };
      decline_order: {
        Args: { p_order_id: string; p_reason?: string | null };
        Returns: undefined;
      };
      claim_order: {
        Args: { p_order_id: string };
        Returns: {
          order_id: string;
          reference: string;
          restaurant: string;
          delivery_address: string | null;
          items: OrderItem[];
          total: number;
          rider_payout: number;
          payment: PaymentMethod;
          placed_at: string;
        }[];
      };
      register_customer: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      /**
       * Apply to deliver (migration 0046). Returns the application id, and is
       * idempotent while a pending application exists. Grants no role: an admin
       * approves via review_rider_application().
       */
      submit_rider_application: {
        Args: {
          p_full_name: string;
          p_phone: string;
          p_city?: string | null;
          p_vehicle?: VehicleType;
          p_licence_ref?: string | null;
          p_orcr_ref?: string | null;
          p_government_id_ref?: string | null;
        };
        Returns: string;
      };
      /** The signed-in applicant's most recent application, any status. */
      my_rider_application: {
        Args: Record<string, never>;
        Returns:
          | {
              id: string;
              status: "pending" | "approved" | "rejected";
              full_name: string;
              phone: string;
              city: string;
              vehicle: VehicleType;
              licence_ref: string | null;
              orcr_ref: string | null;
              government_id_ref: string | null;
              decision_note: string | null;
              created_at: string;
              reviewed_at: string | null;
            }
          | [];
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
      /**
       * Server-authoritative price preview (migration 0033). Mirrors the
       * pricing and availability checks in customer_place_order so the number
       * shown at checkout and the number charged come from one place.
       */
      order_fees: {
        Args: never;
        Returns: {
          delivery_fee: number;
          service_fee: number;
        }[];
      };
      quote_order: {
        Args: {
          p_restaurant_id: string;
          p_items: { menu_item_id: string; quantity: number }[];
        };
        Returns: {
          subtotal: number;
          delivery_fee: number;
          service_fee: number;
          total: number;
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
          /** Null when the customer never set a contact number in their profile. */
          customer_phone: string | null;
          restaurant: string;
          /** Null for orders placed before delivery addresses existed. */
          delivery_address: string | null;
          items: OrderItem[];
          total: number;
          /** The rider's agreed fee, frozen at claim time. Null until claimed. */
          rider_payout: number | null;
          status: OrderStatus;
          payment: PaymentMethod;
          placed_at: string;
          next_cursor: string | null;
        }[];
      };
      rider_earnings_summary: {
        Args: Record<never, never>;
        Returns: {
          earned_today: number;
          earned_week: number;
          lifetime: number;
          delivery_count: number;
          /** Null until the rider's first delivery since the ledger existed. */
          first_earned_at: string | null;
          last_earned_at: string | null;
        }[];
      };
      rider_payout_history: {
        Args: { p_limit?: number };
        Returns: {
          order_id: string;
          order_reference: string;
          restaurant: string;
          amount: number;
          earned_at: string;
          /** True when the rider has more deliveries than the limit returned. */
          has_more: boolean;
        }[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
