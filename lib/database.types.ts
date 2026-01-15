export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      book_configurations: {
        Row: {
          age: string | null
          config_id: string
          content: Json
          created_at: string
          gender: string | null
          id: string
          images: Json | null
          line_item_id: string
          name: string
          story_description: string | null
          woocommerce_completed_at: string | null
          woocommerce_created_at: string | null
        }
        Insert: {
          age?: string | null
          config_id: string
          content: Json
          created_at?: string
          gender?: string | null
          id?: string
          images?: Json | null
          line_item_id: string
          name: string
          story_description?: string | null
          woocommerce_completed_at?: string | null
          woocommerce_created_at?: string | null
        }
        Update: {
          age?: string | null
          config_id?: string
          content?: Json
          created_at?: string
          gender?: string | null
          id?: string
          images?: Json | null
          line_item_id?: string
          name?: string
          story_description?: string | null
          woocommerce_completed_at?: string | null
          woocommerce_created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_configurations_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_line_item"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      line_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          prikazko_wizard_config_id: string | null
          product_id: number | null
          product_name: string
          quantity: number
          total: number
          woocommerce_line_item_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          prikazko_wizard_config_id?: string | null
          product_id?: number | null
          product_name: string
          quantity?: number
          total: number
          woocommerce_line_item_id: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          prikazko_wizard_config_id?: string | null
          product_id?: number | null
          product_name?: string
          quantity?: number
          total?: number
          woocommerce_line_item_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_order"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          notes: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          notes?: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "fk_order"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          billing_address_1: string | null
          billing_address_2: string | null
          billing_city: string | null
          billing_company: string | null
          billing_country: string | null
          billing_email: string
          billing_first_name: string
          billing_last_name: string
          billing_phone: string | null
          billing_postcode: string | null
          billing_state: string | null
          created_at: string
          currency: string | null
          delivery_address_component_id: string | null
          delivery_address_component_name: string | null
          delivery_address_component_type: string | null
          delivery_address_type_prefix: string | null
          delivery_city_id: string | null
          delivery_city_name: string | null
          delivery_city_region: string | null
          delivery_city_type: string | null
          id: string
          order_number: string | null
          payment_method: string
          payment_method_title: string | null
          shipping_method_title: string | null
          shipping_total: number | null
          speedy_office_id: string | null
          speedy_office_name: string | null
          status: Database["public"]["Enums"]["order_status"]
          total: number
          updated_at: string
          woocommerce_created_at: string | null
          woocommerce_order_id: number
        }
        Insert: {
          billing_address_1?: string | null
          billing_address_2?: string | null
          billing_city?: string | null
          billing_company?: string | null
          billing_country?: string | null
          billing_email: string
          billing_first_name: string
          billing_last_name: string
          billing_phone?: string | null
          billing_postcode?: string | null
          billing_state?: string | null
          created_at?: string
          currency?: string | null
          delivery_address_component_id?: string | null
          delivery_address_component_name?: string | null
          delivery_address_component_type?: string | null
          delivery_address_type_prefix?: string | null
          delivery_city_id?: string | null
          delivery_city_name?: string | null
          delivery_city_region?: string | null
          delivery_city_type?: string | null
          id?: string
          order_number?: string | null
          payment_method: string
          payment_method_title?: string | null
          shipping_method_title?: string | null
          shipping_total?: number | null
          speedy_office_id?: string | null
          speedy_office_name?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total: number
          updated_at?: string
          woocommerce_created_at?: string | null
          woocommerce_order_id: number
        }
        Update: {
          billing_address_1?: string | null
          billing_address_2?: string | null
          billing_city?: string | null
          billing_company?: string | null
          billing_country?: string | null
          billing_email?: string
          billing_first_name?: string
          billing_last_name?: string
          billing_phone?: string | null
          billing_postcode?: string | null
          billing_state?: string | null
          created_at?: string
          currency?: string | null
          delivery_address_component_id?: string | null
          delivery_address_component_name?: string | null
          delivery_address_component_type?: string | null
          delivery_address_type_prefix?: string | null
          delivery_city_id?: string | null
          delivery_city_name?: string | null
          delivery_city_region?: string | null
          delivery_city_type?: string | null
          id?: string
          order_number?: string | null
          payment_method?: string
          payment_method_title?: string | null
          shipping_method_title?: string | null
          shipping_total?: number | null
          speedy_office_id?: string | null
          speedy_office_name?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total?: number
          updated_at?: string
          woocommerce_created_at?: string | null
          woocommerce_order_id?: number
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      order_status:
        | "NEW"
        | "VALIDATION_PENDING"
        | "READY_FOR_PRINT"
        | "PRINTING"
        | "IN_TRANSIT"
        | "COMPLETED"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      order_status: [
        "NEW",
        "VALIDATION_PENDING",
        "READY_FOR_PRINT",
        "PRINTING",
        "IN_TRANSIT",
        "COMPLETED",
      ],
    },
  },
} as const

