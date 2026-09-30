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
      menu_items: {
        Row: {
          available: boolean
          category: string
          created_at: string
          id: string
          name: string
          price: number
          restaurant: string
          restaurant_id: string | null
        }
        Insert: {
          available?: boolean
          category: string
          created_at?: string
          id: string
          name: string
          price?: number
          restaurant: string
          restaurant_id?: string | null
        }
        Update: {
          available?: boolean
          category?: string
          created_at?: string
          id?: string
          name?: string
          price?: number
          restaurant?: string
          restaurant_id?: string | null
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
          service_fee: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
        }
        Insert: {
          created_at?: string
          customer: string
          customer_user_id?: string | null
          delivery_address?: string | null
          delivery_fee?: number
          id: string
          items?: Json
          payment?: Database["public"]["Enums"]["payment_method"]
          placed_at?: string
          reference: string
          rejection_reason?: string | null
          restaurant: string
          restaurant_id?: string | null
          rider?: string | null
          service_fee?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
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
          service_fee?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
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
      current_merchant_restaurant: { Args: never; Returns: string }
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
      set_merchant_access: {
        Args: { p_email: string; p_restaurant_id: string }
        Returns: string
      }
      set_rider_access: {
        Args: { p_email: string; p_rider_id: string }
        Returns: string
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
