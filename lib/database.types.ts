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
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
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
      book_generations: {
        Row: {
          book_config_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_step: number
          id: string
          status: string
          steps_completed: Json | null
          total_cost: number | null
          updated_at: string
        }
        Insert: {
          book_config_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_step?: number
          id?: string
          status?: string
          steps_completed?: Json | null
          total_cost?: number | null
          updated_at?: string
        }
        Update: {
          book_config_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_step?: number
          id?: string
          status?: string
          steps_completed?: Json | null
          total_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_generations_book_config_id_fkey"
            columns: ["book_config_id"]
            isOneToOne: false
            referencedRelation: "book_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_character_images: {
        Row: {
          created_at: string
          crop_data: Json | null
          generated_image_key: string | null
          generation_id: string
          id: string
          is_selected: boolean | null
          notes: string | null
          processed_image_key: string | null
          source_image_key: string
          version: number
        }
        Insert: {
          created_at?: string
          crop_data?: Json | null
          generated_image_key?: string | null
          generation_id: string
          id?: string
          is_selected?: boolean | null
          notes?: string | null
          processed_image_key?: string | null
          source_image_key: string
          version?: number
        }
        Update: {
          created_at?: string
          crop_data?: Json | null
          generated_image_key?: string | null
          generation_id?: string
          id?: string
          is_selected?: boolean | null
          notes?: string | null
          processed_image_key?: string | null
          source_image_key?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "generation_character_images_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "book_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_character_list: {
        Row: {
          character_name: string
          character_type: string | null
          created_at: string
          description: string | null
          generation_id: string
          id: string
          is_custom: boolean | null
          is_main_character: boolean | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          character_name: string
          character_type?: string | null
          created_at?: string
          description?: string | null
          generation_id: string
          id?: string
          is_custom?: boolean | null
          is_main_character?: boolean | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          character_name?: string
          character_type?: string | null
          created_at?: string
          description?: string | null
          generation_id?: string
          id?: string
          is_custom?: boolean | null
          is_main_character?: boolean | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_character_list_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "book_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_character_references: {
        Row: {
          character_list_id: string
          created_at: string
          generation_cost: number | null
          generation_id: string
          generation_params: Json | null
          id: string
          image_key: string
          image_prompt: string | null
          is_selected: boolean | null
          model_used: string | null
          notes: string | null
          version: number
        }
        Insert: {
          character_list_id: string
          created_at?: string
          generation_cost?: number | null
          generation_id: string
          generation_params?: Json | null
          id?: string
          image_key: string
          image_prompt?: string | null
          is_selected?: boolean | null
          model_used?: string | null
          notes?: string | null
          version?: number
        }
        Update: {
          character_list_id?: string
          created_at?: string
          generation_cost?: number | null
          generation_id?: string
          generation_params?: Json | null
          id?: string
          image_key?: string
          image_prompt?: string | null
          is_selected?: boolean | null
          model_used?: string | null
          notes?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "generation_character_references_character_list_id_fkey"
            columns: ["character_list_id"]
            isOneToOne: false
            referencedRelation: "generation_character_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_character_references_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "book_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_corrected_content: {
        Row: {
          corrected_content: Json | null
          created_at: string
          generation_id: string
          id: string
          manually_edited_content: Json | null
          model_used: string | null
          original_content: Json
          tokens_used: number | null
        }
        Insert: {
          corrected_content?: Json | null
          created_at?: string
          generation_id: string
          id?: string
          manually_edited_content?: Json | null
          model_used?: string | null
          original_content: Json
          tokens_used?: number | null
        }
        Update: {
          corrected_content?: Json | null
          created_at?: string
          generation_id?: string
          id?: string
          manually_edited_content?: Json | null
          model_used?: string | null
          original_content?: Json
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_corrected_content_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: true
            referencedRelation: "book_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_scene_images: {
        Row: {
          character_reference_ids: Json | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          generation_cost: number | null
          generation_id: string
          generation_params: Json | null
          generation_status: string
          id: string
          image_key: string
          image_prompt: string | null
          is_selected: boolean | null
          model_used: string | null
          scene_prompt_id: string
          version: number
        }
        Insert: {
          character_reference_ids?: Json | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          generation_cost?: number | null
          generation_id: string
          generation_params?: Json | null
          generation_status?: string
          id?: string
          image_key: string
          image_prompt?: string | null
          is_selected?: boolean | null
          model_used?: string | null
          scene_prompt_id: string
          version?: number
        }
        Update: {
          character_reference_ids?: Json | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          generation_cost?: number | null
          generation_id?: string
          generation_params?: Json | null
          generation_status?: string
          id?: string
          image_key?: string
          image_prompt?: string | null
          is_selected?: boolean | null
          model_used?: string | null
          scene_prompt_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "generation_scene_images_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "book_generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_scene_images_scene_prompt_id_fkey"
            columns: ["scene_prompt_id"]
            isOneToOne: false
            referencedRelation: "generation_scene_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_scene_prompts: {
        Row: {
          created_at: string
          generation_id: string
          id: string
          image_prompt: string
          prompt_metadata: Json | null
          scene_number: number | null
          scene_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          generation_id: string
          id?: string
          image_prompt: string
          prompt_metadata?: Json | null
          scene_number?: number | null
          scene_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          generation_id?: string
          id?: string
          image_prompt?: string
          prompt_metadata?: Json | null
          scene_number?: number | null
          scene_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_scene_prompts_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "book_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          max_retries: number
          payload: Json
          pdf_cleanup_error: string | null
          pdf_cleanup_status: string | null
          priority: number
          result: Json | null
          retry_count: number
          scheduled_for: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          type: Database["public"]["Enums"]["job_type"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_retries?: number
          payload?: Json
          pdf_cleanup_error?: string | null
          pdf_cleanup_status?: string | null
          priority?: number
          result?: Json | null
          retry_count?: number
          scheduled_for?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type: Database["public"]["Enums"]["job_type"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_retries?: number
          payload?: Json
          pdf_cleanup_error?: string | null
          pdf_cleanup_status?: string | null
          priority?: number
          result?: Json | null
          retry_count?: number
          scheduled_for?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type?: Database["public"]["Enums"]["job_type"]
          updated_at?: string
        }
        Relationships: []
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
          bg_carriers_carrier: string | null
          bg_carriers_delivery_type: string | null
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
          download_count: number | null
          id: string
          last_downloaded_at: string | null
          order_number: string | null
          payment_method: string
          payment_method_title: string | null
          preview_cleanup_error: string | null
          preview_cleanup_status: string | null
          print_file_r2_key: string | null
          print_file_size_bytes: number | null
          print_generated_at: string | null
          shipping_method_title: string | null
          shipping_total: number | null
          speedy_delivery_city_id: string | null
          speedy_delivery_city_name: string | null
          speedy_delivery_postcode: string | null
          speedy_delivery_street_id: string | null
          speedy_delivery_street_name: string | null
          speedy_delivery_street_number: string | null
          speedy_delivery_street_type: string | null
          speedy_label_created_at: string | null
          speedy_pickup_location_address: string | null
          speedy_pickup_location_city: string | null
          speedy_pickup_location_city_id: string | null
          speedy_pickup_location_id: string | null
          speedy_pickup_location_name: string | null
          speedy_pickup_location_postcode: string | null
          speedy_pickup_location_type: string | null
          speedy_shipment_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          total: number
          updated_at: string
          woocommerce_created_at: string | null
          woocommerce_order_id: number
        }
        Insert: {
          bg_carriers_carrier?: string | null
          bg_carriers_delivery_type?: string | null
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
          download_count?: number | null
          id?: string
          last_downloaded_at?: string | null
          order_number?: string | null
          payment_method: string
          payment_method_title?: string | null
          preview_cleanup_error?: string | null
          preview_cleanup_status?: string | null
          print_file_r2_key?: string | null
          print_file_size_bytes?: number | null
          print_generated_at?: string | null
          shipping_method_title?: string | null
          shipping_total?: number | null
          speedy_delivery_city_id?: string | null
          speedy_delivery_city_name?: string | null
          speedy_delivery_postcode?: string | null
          speedy_delivery_street_id?: string | null
          speedy_delivery_street_name?: string | null
          speedy_delivery_street_number?: string | null
          speedy_delivery_street_type?: string | null
          speedy_label_created_at?: string | null
          speedy_pickup_location_address?: string | null
          speedy_pickup_location_city?: string | null
          speedy_pickup_location_city_id?: string | null
          speedy_pickup_location_id?: string | null
          speedy_pickup_location_name?: string | null
          speedy_pickup_location_postcode?: string | null
          speedy_pickup_location_type?: string | null
          speedy_shipment_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total: number
          updated_at?: string
          woocommerce_created_at?: string | null
          woocommerce_order_id: number
        }
        Update: {
          bg_carriers_carrier?: string | null
          bg_carriers_delivery_type?: string | null
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
          download_count?: number | null
          id?: string
          last_downloaded_at?: string | null
          order_number?: string | null
          payment_method?: string
          payment_method_title?: string | null
          preview_cleanup_error?: string | null
          preview_cleanup_status?: string | null
          print_file_r2_key?: string | null
          print_file_size_bytes?: number | null
          print_generated_at?: string | null
          shipping_method_title?: string | null
          shipping_total?: number | null
          speedy_delivery_city_id?: string | null
          speedy_delivery_city_name?: string | null
          speedy_delivery_postcode?: string | null
          speedy_delivery_street_id?: string | null
          speedy_delivery_street_name?: string | null
          speedy_delivery_street_number?: string | null
          speedy_delivery_street_type?: string | null
          speedy_label_created_at?: string | null
          speedy_pickup_location_address?: string | null
          speedy_pickup_location_city?: string | null
          speedy_pickup_location_city_id?: string | null
          speedy_pickup_location_id?: string | null
          speedy_pickup_location_name?: string | null
          speedy_pickup_location_postcode?: string | null
          speedy_pickup_location_type?: string | null
          speedy_shipment_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total?: number
          updated_at?: string
          woocommerce_created_at?: string | null
          woocommerce_order_id?: number
        }
        Relationships: []
      }
      scene_prompt_characters: {
        Row: {
          character_list_id: string
          created_at: string
          id: string
          scene_prompt_id: string
          sort_order: number
        }
        Insert: {
          character_list_id: string
          created_at?: string
          id?: string
          scene_prompt_id: string
          sort_order?: number
        }
        Update: {
          character_list_id?: string
          created_at?: string
          id?: string
          scene_prompt_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "scene_prompt_characters_character_list_id_fkey"
            columns: ["character_list_id"]
            isOneToOne: false
            referencedRelation: "generation_character_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_prompt_characters_scene_prompt_id_fkey"
            columns: ["scene_prompt_id"]
            isOneToOne: false
            referencedRelation: "generation_scene_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_labels: {
        Row: {
          created_at: string
          delivery_deadline: string | null
          id: string
          order_id: string
          pickup_date: string | null
          price_amount: number | null
          price_currency: string | null
          price_total: number | null
          shipment_id: string
        }
        Insert: {
          created_at?: string
          delivery_deadline?: string | null
          id?: string
          order_id: string
          pickup_date?: string | null
          price_amount?: number | null
          price_currency?: string | null
          price_total?: number | null
          shipment_id: string
        }
        Update: {
          created_at?: string
          delivery_deadline?: string | null
          id?: string
          order_id?: string
          pickup_date?: string | null
          price_amount?: number | null
          price_currency?: string | null
          price_total?: number | null
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_labels_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
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
      cancel_job: { Args: { p_job_id: string }; Returns: boolean }
      claim_next_job: {
        Args: { p_stale_timeout_minutes?: number; p_worker_id: string }
        Returns: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          max_retries: number
          payload: Json
          pdf_cleanup_error: string | null
          pdf_cleanup_status: string | null
          priority: number
          result: Json | null
          retry_count: number
          scheduled_for: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          type: Database["public"]["Enums"]["job_type"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_job: {
        Args: { p_job_id: string; p_result?: Json }
        Returns: undefined
      }
      fail_job: {
        Args: { p_error: string; p_job_id: string; p_should_retry?: boolean }
        Returns: undefined
      }
    }
    Enums: {
      job_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
      job_type: "PRINT_GENERATION" | "PREVIEW_GENERATION" | "CONTENT_GENERATION"
      order_status:
        | "NEW"
        | "VALIDATION_PENDING"
        | "READY_FOR_PRINT"
        | "PRINTING"
        | "IN_TRANSIT"
        | "COMPLETED"
        | "REJECTED"
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
      job_status: ["pending", "processing", "completed", "failed", "cancelled"],
      job_type: [
        "PRINT_GENERATION",
        "PREVIEW_GENERATION",
        "CONTENT_GENERATION",
      ],
      order_status: [
        "NEW",
        "VALIDATION_PENDING",
        "READY_FOR_PRINT",
        "PRINTING",
        "IN_TRANSIT",
        "COMPLETED",
        "REJECTED",
      ],
    },
  },
} as const

