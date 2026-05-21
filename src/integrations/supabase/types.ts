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
      agents: {
        Row: {
          average_rating: number
          category: string | null
          created_at: string
          demo_inputs: Json | null
          demo_output: string | null
          endpoint_url: string | null
          full_description: string | null
          id: string
          input_schema: Json | null
          name: string
          one_time_price: number | null
          output_type: string | null
          pricing_model: string | null
          processing_time: string | null
          review_count: number
          run_count: number
          seller_id: string
          short_description: string
          slug: string | null
          status: string
          subscription_price: number | null
        }
        Insert: {
          average_rating?: number
          category?: string | null
          created_at?: string
          demo_inputs?: Json | null
          demo_output?: string | null
          endpoint_url?: string | null
          full_description?: string | null
          id?: string
          input_schema?: Json | null
          name: string
          one_time_price?: number | null
          output_type?: string | null
          pricing_model?: string | null
          processing_time?: string | null
          review_count?: number
          run_count?: number
          seller_id: string
          short_description: string
          slug?: string | null
          status?: string
          subscription_price?: number | null
        }
        Update: {
          average_rating?: number
          category?: string | null
          created_at?: string
          demo_inputs?: Json | null
          demo_output?: string | null
          endpoint_url?: string | null
          full_description?: string | null
          id?: string
          input_schema?: Json | null
          name?: string
          one_time_price?: number | null
          output_type?: string | null
          pricing_model?: string | null
          processing_time?: string | null
          review_count?: number
          run_count?: number
          seller_id?: string
          short_description?: string
          slug?: string | null
          status?: string
          subscription_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          reason: string
          run_id: string
          status: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          reason: string
          run_id: string
          status?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          reason?: string
          run_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_seller_onboarded: boolean
          role: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_seller_onboarded?: boolean
          role?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_seller_onboarded?: boolean
          role?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          agent_id: string
          buyer_id: string
          created_at: string
          id: string
          rating: number
          review_text: string | null
          run_id: string
        }
        Insert: {
          agent_id: string
          buyer_id: string
          created_at?: string
          id?: string
          rating: number
          review_text?: string | null
          run_id: string
        }
        Update: {
          agent_id?: string
          buyer_id?: string
          created_at?: string
          id?: string
          rating?: number
          review_text?: string | null
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          agent_id: string
          buyer_id: string
          created_at: string
          error_code: string | null
          error_message: string | null
          files: Json | null
          id: string
          inputs: Json | null
          output: string | null
          output_type: string | null
          processing_time_ms: number | null
          status: string
          tasqr_request_id: string
          transaction_id: string | null
        }
        Insert: {
          agent_id: string
          buyer_id: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          files?: Json | null
          id?: string
          inputs?: Json | null
          output?: string | null
          output_type?: string | null
          processing_time_ms?: number | null
          status?: string
          tasqr_request_id: string
          transaction_id?: string | null
        }
        Update: {
          agent_id?: string
          buyer_id?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          files?: Json | null
          id?: string
          inputs?: Json | null
          output?: string | null
          output_type?: string | null
          processing_time_ms?: number | null
          status?: string
          tasqr_request_id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_profiles: {
        Row: {
          airtm_email: string | null
          api_key_hash: string | null
          api_key_last_used: string | null
          api_key_prefix: string | null
          bio: string | null
          created_at: string
          draft_input_schema: Json | null
          handle: string | null
          id: string
          reliability_score: number
          total_earnings: number
          user_id: string
          website: string | null
          withdrawable_balance: number
        }
        Insert: {
          airtm_email?: string | null
          api_key_hash?: string | null
          api_key_last_used?: string | null
          api_key_prefix?: string | null
          bio?: string | null
          created_at?: string
          draft_input_schema?: Json | null
          handle?: string | null
          id?: string
          reliability_score?: number
          total_earnings?: number
          user_id: string
          website?: string | null
          withdrawable_balance?: number
        }
        Update: {
          airtm_email?: string | null
          api_key_hash?: string | null
          api_key_last_used?: string | null
          api_key_prefix?: string | null
          bio?: string | null
          created_at?: string
          draft_input_schema?: Json | null
          handle?: string | null
          id?: string
          reliability_score?: number
          total_earnings?: number
          user_id?: string
          website?: string | null
          withdrawable_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "seller_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          agent_id: string
          amount: number
          buyer_id: string
          created_at: string
          hold_until: string | null
          id: string
          paystack_reference: string | null
          platform_fee: number | null
          seller_earnings: number | null
          seller_id: string
          status: string
          transaction_type: string | null
        }
        Insert: {
          agent_id: string
          amount: number
          buyer_id: string
          created_at?: string
          hold_until?: string | null
          id?: string
          paystack_reference?: string | null
          platform_fee?: number | null
          seller_earnings?: number | null
          seller_id: string
          status?: string
          transaction_type?: string | null
        }
        Update: {
          agent_id?: string
          amount?: number
          buyer_id?: string
          created_at?: string
          hold_until?: string | null
          id?: string
          paystack_reference?: string | null
          platform_fee?: number | null
          seller_earnings?: number | null
          seller_id?: string
          status?: string
          transaction_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      seller_profiles_public: {
        Row: {
          bio: string | null
          created_at: string | null
          handle: string | null
          id: string | null
          reliability_score: number | null
          user_id: string | null
          website: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string | null
          handle?: string | null
          id?: string | null
          reliability_score?: number | null
          user_id?: string | null
          website?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string | null
          handle?: string | null
          id?: string | null
          reliability_score?: number | null
          user_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      is_seller_owner: { Args: { seller_profile_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
