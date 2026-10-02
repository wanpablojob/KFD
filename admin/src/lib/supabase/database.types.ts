export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_users: {
        Row: {
          created_at: string
          last_notification_seen_at: string | null
          restaurant_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          last_notification_seen_at?: string | null
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          last_notification_seen_at?: string | null
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          changed_at: string
          id: number
          new_restaurant_id: string | null
          new_role: Database["public"]["Enums"]["app_role"] | null
          old_restaurant_id: string | null
          old_role: Database["public"]["Enums"]["app_role"] | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          changed_at?: string
          id?: never
          new_restaurant_id?: string | null
          new_role?: Database["public"]["Enums"]["app_role"] | null
          old_restaurant_id?: string | null
          old_role?: Database["public"]["Enums"]["app_role"] | null
          record_id?: string | null
          table_name?: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          changed_at?: string
          id?: never
          new_restaurant_id?: string | null
          new_role?: Database["public"]["Enums"]["app_role"] | null
          old_restaurant_id?: string | null
          old_role?: Database["public"]["Enums"]["app_role"] | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          city: string
          created_at: string
          email: string
          id: string
          joined_at: string
          name: string
          orders_count: number
          phone: string | null
          total_spend: number
        }
        Insert: {
          city?: string
          created_at?: string
          email: string
          id: string
          joined_at?: string
          name: string
          orders_count?: number
          phone?: string | null
          total_spend?: number
        }
        Update: {
          city?: string
          created_at?: string
          email?: string
          id?: string
          joined_at?: string
          name?: string
          orders_count?: number
          phone?: string | null
          total_spend?: number
        }
        Relationships: []
      }
      leads: {
        Row: {
          consent_at: string
          contact: string
          created_at: string
          id: number
          kind: string
          name: string
          note: string | null
        }
        Insert: {
          consent_at?: string
          contact: string
          created_at?: string
          id?: never
          kind: string
          name: string
          note?: string | null
        }
        Update: {
          consent_at?: string
          contact?: string
          created_at?: string
          id?: never
          kind?: string
          name?: string
          note?: string | null
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          available: boolean
          category: string
          created_at: string
          id: string
          name: string
          price: number
          restaurant: string
          restaurant_id: string
        }
        Insert: {
          available?: boolean
          category: string
          created_at?: string
          id: string
          name: string
          price?: number
          restaurant: string
          restaurant_id: string
        }
        Update: {
          available?: boolean
          category?: string
          created_at?: string
          id?: string
          name?: string
          price?: number
          restaurant?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_offers: {
        Row: {
          claimed_at: string | null
          decline_reason: string | null
          expires_at: string
          id: number
          offered_at: string
          order_id: string
          rider_id: string
          status: Database["public"]["Enums"]["offer_status"]
        }
        Insert: {
          claimed_at?: string | null
          decline_reason?: string | null
          expires_at: string
          id?: never
          offered_at?: string
          order_id: string
          rider_id: string
          status?: Database["public"]["Enums"]["offer_status"]
        }
        Update: {
          claimed_at?: string | null
          decline_reason?: string | null
          expires_at?: string
          id?: never
          offered_at?: string
          order_id?: string
          rider_id?: string
          status?: Database["public"]["Enums"]["offer_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_offers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_offers_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer: string
          customer_user_id: string | null
          delivery_address: string | null
          delivery_fee: number
          id: string
          items: Json
          payment: Database["public"]["Enums"]["payment_method"]
          placed_at: string
          reference: string
          rejection_reason: string | null
          restaurant: string
          restaurant_id: string | null
          rider: string | null
          rider_id: string | null
          service_fee: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer: string
          customer_user_id?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          id?: string
          items?: Json
          payment?: Database["public"]["Enums"]["payment_method"]
          placed_at?: string
          reference: string
          rejection_reason?: string | null
          restaurant: string
          restaurant_id?: string | null
          rider?: string | null
          rider_id?: string | null
          service_fee?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer?: string
          customer_user_id?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          id?: string
          items?: Json
          payment?: Database["public"]["Enums"]["payment_method"]
          placed_at?: string
          reference?: string
          rejection_reason?: string | null
          restaurant?: string
          restaurant_id?: string | null
          rider?: string | null
          rider_id?: string | null
          service_fee?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      restaurants: {
        Row: {
          archived_at: string | null
          city: string
          created_at: string
          cuisine: string
          id: string
          joined_at: string
          name: string
          orders_count: number
          rating: number
          revenue: number
          status: Database["public"]["Enums"]["restaurant_status"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          city?: string
          created_at?: string
          cuisine: string
          id: string
          joined_at?: string
          name: string
          orders_count?: number
          rating?: number
          revenue?: number
          status?: Database["public"]["Enums"]["restaurant_status"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          city?: string
          created_at?: string
          cuisine?: string
          id?: string
          joined_at?: string
          name?: string
          orders_count?: number
          rating?: number
          revenue?: number
          status?: Database["public"]["Enums"]["restaurant_status"]
          updated_at?: string
        }
        Relationships: []
      }
      riders: {
        Row: {
          archived_at: string | null
          city: string
          created_at: string
          deliveries: number
          earnings: number
          email: string
          id: string
          name: string
          phone: string | null
          rating: number
          status: Database["public"]["Enums"]["rider_status"]
          updated_at: string
          user_id: string | null
          vehicle: Database["public"]["Enums"]["vehicle_type"]
        }
        Insert: {
          archived_at?: string | null
          city?: string
          created_at?: string
          deliveries?: number
          earnings?: number
          email: string
          id: string
          name: string
          phone?: string | null
          rating?: number
          status?: Database["public"]["Enums"]["rider_status"]
          updated_at?: string
          user_id?: string | null
          vehicle?: Database["public"]["Enums"]["vehicle_type"]
        }
        Update: {
          archived_at?: string | null
          city?: string
          created_at?: string
          deliveries?: number
          earnings?: number
          email?: string
          id?: string
          name?: string
          phone?: string | null
          rating?: number
          status?: Database["public"]["Enums"]["rider_status"]
          updated_at?: string
          user_id?: string | null
          vehicle?: Database["public"]["Enums"]["vehicle_type"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_dispatch_order: {
        Args: { p_order_id: string; p_rider_ids?: string[] }
        Returns: {
          offered_to: number
          order_id: string
        }[]
      }
      available_jobs: {
        Args: never
        Returns: {
          city: string
          delivery_address: string
          expires_at: string
          items: Json
          order_id: string
          payment: Database["public"]["Enums"]["payment_method"]
          placed_at: string
          reference: string
          restaurant: string
          total: number
        }[]
      }
      claim_order: {
        Args: { p_order_id: string }
        Returns: {
          delivery_address: string
          items: Json
          order_id: string
          payment: Database["public"]["Enums"]["payment_method"]
          placed_at: string
          reference: string
          restaurant: string
          total: number
        }[]
      }
      current_merchant_restaurant: { Args: never; Returns: string }
      current_rider_id: { Args: never; Returns: string }
      customer_place_order: {
        Args: {
          p_delivery_address: string
          p_items: Json
          p_payment: Database["public"]["Enums"]["payment_method"]
          p_restaurant_id: string
        }
        Returns: {
          order_id: string
          reference: string
          status: Database["public"]["Enums"]["order_status"]
          total: number
        }[]
      }
      decline_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: undefined
      }
      dispatch_riders: {
        Args: never
        Returns: {
          active_offers: number
          city: string
          claimed_today: number
          deliveries: number
          name: string
          phone: string
          rating: number
          rider_id: string
          status: Database["public"]["Enums"]["rider_status"]
          vehicle: Database["public"]["Enums"]["vehicle_type"]
        }[]
      }
      dispatch_unassigned_orders: {
        Args: never
        Returns: {
          city: string
          customer: string
          declines: number
          delivery_address: string
          items: Json
          live_offers: number
          offers_made: number
          online_riders_in_city: number
          order_id: string
          placed_at: string
          reference: string
          restaurant: string
          restaurant_id: string
          status: Database["public"]["Enums"]["order_status"]
          total: number
        }[]
      }
      expire_stale_offers: { Args: never; Returns: undefined }
      fetch_rider_orders_page: {
        Args: { p_cursor?: string; p_limit?: number }
        Returns: {
          customer: string
          id: string
          items: Json
          next_cursor: string
          payment: Database["public"]["Enums"]["payment_method"]
          placed_at: string
          reference: string
          restaurant: string
          status: Database["public"]["Enums"]["order_status"]
          total: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_customer: { Args: never; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      mark_notifications_seen: { Args: never; Returns: string }
      merchant_access_list: {
        Args: never
        Returns: {
          created_at: string
          email: string
          restaurant_id: string
          restaurant_name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      mint_order_reference: { Args: never; Returns: string }
      order_fees: {
        Args: never
        Returns: {
          delivery_fee: number
          service_fee: number
        }[]
      }
      quote_order: {
        Args: { p_items: Json; p_restaurant_id: string }
        Returns: {
          delivery_fee: number
          service_fee: number
          subtotal: number
          total: number
        }[]
      }
      refresh_restaurant_aggregates: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      register_customer: { Args: never; Returns: undefined }
      revoke_merchant_access: { Args: { p_email: string }; Returns: undefined }
      revoke_rider_access: { Args: { p_email: string }; Returns: undefined }
      rider_access_list: {
        Args: never
        Returns: {
          archived_at: string
          email: string
          rider_id: string
          rider_name: string
          user_id: string
        }[]
      }
      rider_mark_delivered: { Args: { p_order_id: string }; Returns: undefined }
      rider_set_status: { Args: { p_status: string }; Returns: undefined }
      search_restaurants: {
        Args: { p_cuisine?: string; p_query?: string }
        Returns: {
          archived_at: string
          city: string
          cuisine: string
          id: string
          name: string
          rating: number
          status: Database["public"]["Enums"]["restaurant_status"]
        }[]
      }
      set_merchant_access: {
        Args: { p_email: string; p_restaurant_id: string }
        Returns: string
      }
      set_rider_access: {
        Args: { p_email: string; p_rider_id: string }
        Returns: string
      }
      submit_lead: {
        Args: {
          p_consent?: boolean
          p_contact: string
          p_kind: string
          p_name: string
          p_note?: string
        }
        Returns: undefined
      }
      track_order: {
        Args: { p_reference: string }
        Returns: {
          delivery_fee: number
          items: Json
          payment: Database["public"]["Enums"]["payment_method"]
          placed_at: string
          reference: string
          restaurant: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "merchant" | "rider" | "customer"
      offer_status: "offered" | "claimed" | "declined" | "expired"
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
      payment_method: "cash" | "card" | "e_wallet"
      restaurant_status: "active" | "approval" | "suspended"
      rider_status: "online" | "busy" | "offline"
      vehicle_type: "bicycle" | "scooter" | "motorcycle" | "car"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "merchant", "rider", "customer"],
      offer_status: ["offered", "claimed", "declined", "expired"],
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      payment_method: ["cash", "card", "e_wallet"],
      restaurant_status: ["active", "approval", "suspended"],
      rider_status: ["online", "busy", "offline"],
      vehicle_type: ["bicycle", "scooter", "motorcycle", "car"],
    },
  },
} as const
