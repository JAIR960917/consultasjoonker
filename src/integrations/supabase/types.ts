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
      branding: {
        Row: {
          accent: string
          accent_foreground: string
          app_name: string
          background: string
          border: string
          card: string
          card_foreground: string
          destructive: string
          destructive_foreground: string
          foreground: string
          id: string
          login_badge: string
          login_subtitle: string
          login_tagline: string
          login_title: string
          logo_url: string | null
          muted: string
          muted_foreground: string
          primary_color: string
          primary_foreground: string
          primary_glow: string
          secondary: string
          secondary_foreground: string
          sidebar_accent: string
          sidebar_accent_foreground: string
          sidebar_background: string
          sidebar_border: string
          sidebar_foreground: string
          sidebar_primary: string
          sidebar_primary_foreground: string
          success: string
          success_foreground: string
          updated_at: string
          warning: string
          warning_foreground: string
        }
        Insert: {
          accent?: string
          accent_foreground?: string
          app_name?: string
          background?: string
          border?: string
          card?: string
          card_foreground?: string
          destructive?: string
          destructive_foreground?: string
          foreground?: string
          id?: string
          login_badge?: string
          login_subtitle?: string
          login_tagline?: string
          login_title?: string
          logo_url?: string | null
          muted?: string
          muted_foreground?: string
          primary_color?: string
          primary_foreground?: string
          primary_glow?: string
          secondary?: string
          secondary_foreground?: string
          sidebar_accent?: string
          sidebar_accent_foreground?: string
          sidebar_background?: string
          sidebar_border?: string
          sidebar_foreground?: string
          sidebar_primary?: string
          sidebar_primary_foreground?: string
          success?: string
          success_foreground?: string
          updated_at?: string
          warning?: string
          warning_foreground?: string
        }
        Update: {
          accent?: string
          accent_foreground?: string
          app_name?: string
          background?: string
          border?: string
          card?: string
          card_foreground?: string
          destructive?: string
          destructive_foreground?: string
          foreground?: string
          id?: string
          login_badge?: string
          login_subtitle?: string
          login_tagline?: string
          login_title?: string
          logo_url?: string | null
          muted?: string
          muted_foreground?: string
          primary_color?: string
          primary_foreground?: string
          primary_glow?: string
          secondary?: string
          secondary_foreground?: string
          sidebar_accent?: string
          sidebar_accent_foreground?: string
          sidebar_background?: string
          sidebar_border?: string
          sidebar_foreground?: string
          sidebar_primary?: string
          sidebar_primary_foreground?: string
          success?: string
          success_foreground?: string
          updated_at?: string
          warning?: string
          warning_foreground?: string
        }
        Relationships: []
      }
      consultas: {
        Row: {
          cpf: string
          created_at: string
          id: string
          nome: string | null
          raw: Json | null
          score: number | null
          status: string
          user_id: string
        }
        Insert: {
          cpf: string
          created_at?: string
          id?: string
          nome?: string | null
          raw?: Json | null
          score?: number | null
          status?: string
          user_id: string
        }
        Update: {
          cpf?: string
          created_at?: string
          id?: string
          nome?: string | null
          raw?: Json | null
          score?: number | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      contract_template: {
        Row: {
          company_address: string
          company_cnpj: string
          company_name: string
          content: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          company_address?: string
          company_cnpj?: string
          company_name?: string
          content?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Update: {
          company_address?: string
          company_cnpj?: string
          company_name?: string
          content?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          consulta_id: string | null
          content: string
          cpf: string
          created_at: string
          endereco: string
          id: string
          nome: string
          signature_data: Json | null
          signature_external_id: string | null
          signature_provider: string | null
          signature_url: string | null
          signed_at: string | null
          status: string
          telefone: string
          updated_at: string
          user_id: string
          venda_id: string | null
        }
        Insert: {
          consulta_id?: string | null
          content: string
          cpf: string
          created_at?: string
          endereco: string
          id?: string
          nome: string
          signature_data?: Json | null
          signature_external_id?: string | null
          signature_provider?: string | null
          signature_url?: string | null
          signed_at?: string | null
          status?: string
          telefone: string
          updated_at?: string
          user_id: string
          venda_id?: string | null
        }
        Update: {
          consulta_id?: string | null
          content?: string
          cpf?: string
          created_at?: string
          endereco?: string
          id?: string
          nome?: string
          signature_data?: Json | null
          signature_external_id?: string | null
          signature_provider?: string | null
          signature_url?: string | null
          signed_at?: string | null
          status?: string
          telefone?: string
          updated_at?: string
          user_id?: string
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "consultas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      cora_webhook_logs: {
        Row: {
          cora_invoice_id: string | null
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          processed: boolean
        }
        Insert: {
          cora_invoice_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          payload: Json
          processed?: boolean
        }
        Update: {
          cora_invoice_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean
        }
        Relationships: []
      }
      parcelas: {
        Row: {
          codigo_barras: string | null
          contrato_id: string | null
          cora_invoice_id: string | null
          created_at: string
          emitido_em: string | null
          erro_mensagem: string | null
          id: string
          linha_digitavel: string | null
          numero_parcela: number
          pago_em: string | null
          pdf_url: string | null
          pix_emv: string | null
          pix_qrcode: string | null
          status: string
          total_parcelas: number
          updated_at: string
          user_id: string
          valor: number
          valor_pago: number | null
          vencimento: string
          venda_id: string
        }
        Insert: {
          codigo_barras?: string | null
          contrato_id?: string | null
          cora_invoice_id?: string | null
          created_at?: string
          emitido_em?: string | null
          erro_mensagem?: string | null
          id?: string
          linha_digitavel?: string | null
          numero_parcela: number
          pago_em?: string | null
          pdf_url?: string | null
          pix_emv?: string | null
          pix_qrcode?: string | null
          status?: string
          total_parcelas: number
          updated_at?: string
          user_id: string
          valor: number
          valor_pago?: number | null
          vencimento: string
          venda_id: string
        }
        Update: {
          codigo_barras?: string | null
          contrato_id?: string | null
          cora_invoice_id?: string | null
          created_at?: string
          emitido_em?: string | null
          erro_mensagem?: string | null
          id?: string
          linha_digitavel?: string | null
          numero_parcela?: number
          pago_em?: string | null
          pdf_url?: string | null
          pix_emv?: string | null
          pix_qrcode?: string | null
          status?: string
          total_parcelas?: number
          updated_at?: string
          user_id?: string
          valor?: number
          valor_pago?: number | null
          vencimento?: string
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcelas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelas_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cidade: string
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cidade?: string
          created_at?: string
          email: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cidade?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          good_score: number
          id: string
          installment_rates: Json
          max_installments: number
          min_entry_percent: number
          min_score: number
          score_tiers: Json
          updated_at: string
        }
        Insert: {
          good_score?: number
          id?: string
          installment_rates?: Json
          max_installments?: number
          min_entry_percent?: number
          min_score?: number
          score_tiers?: Json
          updated_at?: string
        }
        Update: {
          good_score?: number
          id?: string
          installment_rates?: Json
          max_installments?: number
          min_entry_percent?: number
          min_score?: number
          score_tiers?: Json
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendas: {
        Row: {
          consulta_id: string | null
          cpf: string
          created_at: string
          id: string
          nome: string | null
          parcelas: number
          primeiro_vencimento: string | null
          score: number | null
          status: string
          taxa_juros: number
          user_id: string
          valor_entrada: number
          valor_financiado: number
          valor_parcela: number
          valor_total: number
        }
        Insert: {
          consulta_id?: string | null
          cpf: string
          created_at?: string
          id?: string
          nome?: string | null
          parcelas: number
          primeiro_vencimento?: string | null
          score?: number | null
          status?: string
          taxa_juros: number
          user_id: string
          valor_entrada: number
          valor_financiado: number
          valor_parcela: number
          valor_total: number
        }
        Update: {
          consulta_id?: string | null
          cpf?: string
          created_at?: string
          id?: string
          nome?: string | null
          parcelas?: number
          primeiro_vencimento?: string | null
          score?: number | null
          status?: string
          taxa_juros?: number
          user_id?: string
          valor_entrada?: number
          valor_financiado?: number
          valor_parcela?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendas_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "consultas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "gerente"
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
    Enums: {
      app_role: ["admin", "gerente"],
    },
  },
} as const
