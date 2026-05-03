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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_contracts: {
        Row: {
          agent_id: string
          agent_number: string | null
          carrier: string
          contract_type: string
          created_at: string
          id: string
          referral_code: string | null
          start_date: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          agent_id: string
          agent_number?: string | null
          carrier: string
          contract_type?: string
          created_at?: string
          id?: string
          referral_code?: string | null
          start_date?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          agent_id?: string
          agent_number?: string | null
          carrier?: string
          contract_type?: string
          created_at?: string
          id?: string
          referral_code?: string | null
          start_date?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_contracts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_position_history: {
        Row: {
          agent_id: string
          created_at: string
          end_date: string | null
          id: string
          position_id: string | null
          start_date: string
          tenant_id: string
          upline_email: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          position_id?: string | null
          start_date: string
          tenant_id: string
          upline_email?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          position_id?: string | null
          start_date?: string
          tenant_id?: string
          upline_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_position_history_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_position_history_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_position_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          annual_goal: number | null
          archived_at: string | null
          archived_by: string | null
          auth_user_id: string | null
          contract_type: string | null
          created_at: string
          custom_fields: Json
          email: string
          first_name: string
          id: string
          is_archived: boolean
          is_owner: boolean
          last_login_at: string | null
          last_name: string
          npn: string | null
          phone: string | null
          start_date: string | null
          tenant_id: string
          upline_email: string | null
        }
        Insert: {
          annual_goal?: number | null
          archived_at?: string | null
          archived_by?: string | null
          auth_user_id?: string | null
          contract_type?: string | null
          created_at?: string
          custom_fields?: Json
          email: string
          first_name: string
          id?: string
          is_archived?: boolean
          is_owner?: boolean
          last_login_at?: string | null
          last_name: string
          npn?: string | null
          phone?: string | null
          start_date?: string | null
          tenant_id: string
          upline_email?: string | null
        }
        Update: {
          annual_goal?: number | null
          archived_at?: string | null
          archived_by?: string | null
          auth_user_id?: string | null
          contract_type?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string
          first_name?: string
          id?: string
          is_archived?: boolean
          is_owner?: boolean
          last_login_at?: string | null
          last_name?: string
          npn?: string | null
          phone?: string | null
          start_date?: string | null
          tenant_id?: string
          upline_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_snapshots: {
        Row: {
          active_agent_count: number
          created_at: string
          id: string
          notes: string | null
          snapshot_date: string
          tenant_id: string
        }
        Insert: {
          active_agent_count?: number
          created_at?: string
          id?: string
          notes?: string | null
          snapshot_date?: string
          tenant_id: string
        }
        Update: {
          active_agent_count?: number
          created_at?: string
          id?: string
          notes?: string | null
          snapshot_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_agent_aliases: {
        Row: {
          agent_id: string
          carrier: string
          created_at: string
          id: string
          tenant_id: string
          writing_agent_id: string
        }
        Insert: {
          agent_id: string
          carrier: string
          created_at?: string
          id?: string
          tenant_id: string
          writing_agent_id: string
        }
        Update: {
          agent_id?: string
          carrier?: string
          created_at?: string
          id?: string
          tenant_id?: string
          writing_agent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carrier_agent_aliases_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_agent_aliases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_products: {
        Row: {
          carrier_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          product_type: string | null
          type: string | null
        }
        Insert: {
          carrier_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          product_type?: string | null
          type?: string | null
        }
        Update: {
          carrier_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          product_type?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carrier_products_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_profiles: {
        Row: {
          carrier_name: string
          column_mappings: Json
          created_at: string
          custom_fields: Json
          header_fingerprint: string[] | null
          id: string
          status_value_map: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          carrier_name: string
          column_mappings?: Json
          created_at?: string
          custom_fields?: Json
          header_fingerprint?: string[] | null
          id?: string
          status_value_map?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          carrier_name?: string
          column_mappings?: Json
          created_at?: string
          custom_fields?: Json
          header_fingerprint?: string[] | null
          id?: string
          status_value_map?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carrier_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      carriers: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          notes: string | null
          phone: string | null
          short_name: string | null
          status: string
          tenant_id: string
          website: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          short_name?: string | null
          status?: string
          tenant_id: string
          website?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          short_name?: string | null
          status?: string
          tenant_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carriers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_levels: {
        Row: {
          carrier: string
          created_at: string
          custom_fields: Json
          id: string
          position_id: string
          product: string
          rate: number
          start_date: string
          tenant_id: string
        }
        Insert: {
          carrier: string
          created_at?: string
          custom_fields?: Json
          id?: string
          position_id: string
          product: string
          rate: number
          start_date: string
          tenant_id: string
        }
        Update: {
          carrier?: string
          created_at?: string
          custom_fields?: Json
          id?: string
          position_id?: string
          product?: string
          rate?: number
          start_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_levels_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_levels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_payouts: {
        Row: {
          agent_id: string
          calculated_at: string
          commission_amount: number | null
          commission_rate: number | null
          contract_type: string | null
          id: string
          paid_at: string | null
          payment_status: string
          payout_type: string
          policy_id: string
          tenant_id: string
        }
        Insert: {
          agent_id: string
          calculated_at?: string
          commission_amount?: number | null
          commission_rate?: number | null
          contract_type?: string | null
          id?: string
          paid_at?: string | null
          payment_status?: string
          payout_type?: string
          policy_id: string
          tenant_id: string
        }
        Update: {
          agent_id?: string
          calculated_at?: string
          commission_amount?: number | null
          commission_rate?: number | null
          contract_type?: string | null
          id?: string
          paid_at?: string | null
          payment_status?: string
          payout_type?: string
          policy_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_payouts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_payouts_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_payouts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rate_adjustments: {
        Row: {
          adjustment_rate: number
          carrier: string
          created_at: string
          end_date: string | null
          id: string
          position_id: string
          product: string
          reason: string | null
          start_date: string
          tenant_id: string
        }
        Insert: {
          adjustment_rate: number
          carrier: string
          created_at?: string
          end_date?: string | null
          id?: string
          position_id: string
          product: string
          reason?: string | null
          start_date: string
          tenant_id: string
        }
        Update: {
          adjustment_rate?: number
          carrier?: string
          created_at?: string
          end_date?: string | null
          id?: string
          position_id?: string
          product?: string
          reason?: string | null
          start_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_rate_adjustments_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rate_adjustments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted: boolean
          created_at: string
          id: string
          invited_by_agent_id: string
          invitee_email: string
          invitee_upline_email: string | null
          tenant_id: string
          token: string
        }
        Insert: {
          accepted?: boolean
          created_at?: string
          id?: string
          invited_by_agent_id: string
          invitee_email: string
          invitee_upline_email?: string | null
          tenant_id: string
          token: string
        }
        Update: {
          accepted?: boolean
          created_at?: string
          id?: string
          invited_by_agent_id?: string
          invitee_email?: string
          invitee_upline_email?: string | null
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_invited_by_agent_id_fkey"
            columns: ["invited_by_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leadership_broadcasts: {
        Row: {
          body: string | null
          created_at: string
          created_by_user_id: string
          cta_text: string | null
          cta_url: string | null
          end_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          start_at: string
          targeting: Json
          tenant_id: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by_user_id: string
          cta_text?: string | null
          cta_url?: string | null
          end_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          start_at?: string
          targeting?: Json
          tenant_id: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by_user_id?: string
          cta_text?: string | null
          cta_url?: string | null
          end_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          start_at?: string
          targeting?: Json
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "leadership_broadcasts_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadership_broadcasts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          agent_count: number
          created_at: string
          id: string
          notes: string | null
          period_end: string
          period_start: string
          processed_at: string | null
          processed_by: string | null
          status: string
          tenant_id: string
          total_amount: number
        }
        Insert: {
          agent_count?: number
          created_at?: string
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          tenant_id: string
          total_amount?: number
        }
        Update: {
          agent_count?: number
          created_at?: string
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          tenant_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          auth_user_id: string
          created_at: string
          email: string
          id: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      policies: {
        Row: {
          agent_number: string | null
          annual_premium: number | null
          application_date: string | null
          billing_interval: string | null
          carrier: string | null
          chargeback_risk: boolean
          client_dob: string | null
          client_name: string | null
          client_phone: string | null
          contract_type: string | null
          created_at: string
          custom_fields: Json
          draft_saved_at: string | null
          effective_date: string | null
          id: string
          is_draft: boolean
          lead_source: string | null
          modal_premium: number | null
          needs_review: boolean
          needs_review_reasons: string[]
          notes: string | null
          policy_number: string | null
          product: string | null
          refs_collected: number
          refs_sold: number
          resolved_agent_id: string | null
          status: string | null
          tenant_id: string
          writing_agent_id: string | null
        }
        Insert: {
          agent_number?: string | null
          annual_premium?: number | null
          application_date?: string | null
          billing_interval?: string | null
          carrier?: string | null
          chargeback_risk?: boolean
          client_dob?: string | null
          client_name?: string | null
          client_phone?: string | null
          contract_type?: string | null
          created_at?: string
          custom_fields?: Json
          draft_saved_at?: string | null
          effective_date?: string | null
          id?: string
          is_draft?: boolean
          lead_source?: string | null
          modal_premium?: number | null
          needs_review?: boolean
          needs_review_reasons?: string[]
          notes?: string | null
          policy_number?: string | null
          product?: string | null
          refs_collected?: number
          refs_sold?: number
          resolved_agent_id?: string | null
          status?: string | null
          tenant_id: string
          writing_agent_id?: string | null
        }
        Update: {
          agent_number?: string | null
          annual_premium?: number | null
          application_date?: string | null
          billing_interval?: string | null
          carrier?: string | null
          chargeback_risk?: boolean
          client_dob?: string | null
          client_name?: string | null
          client_phone?: string | null
          contract_type?: string | null
          created_at?: string
          custom_fields?: Json
          draft_saved_at?: string | null
          effective_date?: string | null
          id?: string
          is_draft?: boolean
          lead_source?: string | null
          modal_premium?: number | null
          needs_review?: boolean
          needs_review_reasons?: string[]
          notes?: string | null
          policy_number?: string | null
          product?: string | null
          refs_collected?: number
          refs_sold?: number
          resolved_agent_id?: string | null
          status?: string | null
          tenant_id?: string
          writing_agent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "policies_resolved_agent_id_fkey"
            columns: ["resolved_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_deletions_audit: {
        Row: {
          agent_id: string | null
          annual_premium_at_deletion: number | null
          carrier_id: string | null
          client_name: string | null
          deleted_at: string
          deleted_by_user_id: string
          id: string
          paid_commission_total_at_deletion: number
          policy_id: string
          policy_number: string | null
          reason: string | null
          status_at_deletion: string | null
          tenant_id: string
        }
        Insert: {
          agent_id?: string | null
          annual_premium_at_deletion?: number | null
          carrier_id?: string | null
          client_name?: string | null
          deleted_at?: string
          deleted_by_user_id: string
          id?: string
          paid_commission_total_at_deletion?: number
          policy_id: string
          policy_number?: string | null
          reason?: string | null
          status_at_deletion?: string | null
          tenant_id: string
        }
        Update: {
          agent_id?: string | null
          annual_premium_at_deletion?: number | null
          carrier_id?: string | null
          client_name?: string | null
          deleted_at?: string
          deleted_by_user_id?: string
          id?: string
          paid_commission_total_at_deletion?: number
          policy_id?: string
          policy_number?: string | null
          reason?: string | null
          status_at_deletion?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_deletions_audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: string | null
          id: string
          policy_id: string
          source: string
          tenant_id: string
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          policy_id: string
          source?: string
          tenant_id: string
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          policy_id?: string
          source?: string
          tenant_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_status_history_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_status_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          created_at: string
          id: string
          priority: number
          tenant_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          priority?: number
          tenant_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          priority?: number
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_targets: {
        Row: {
          created_at: string
          criteria: Json
          from_position_id: string
          id: string
          tenant_id: string
          to_position_id: string
        }
        Insert: {
          created_at?: string
          criteria?: Json
          from_position_id: string
          id?: string
          tenant_id: string
          to_position_id: string
        }
        Update: {
          created_at?: string
          criteria?: Json
          from_position_id?: string
          id?: string
          tenant_id?: string
          to_position_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_targets_from_position_id_fkey"
            columns: ["from_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_targets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_targets_to_position_id_fkey"
            columns: ["to_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_custom_fields: {
        Row: {
          applies_to: string
          created_at: string
          created_by: string | null
          data_type: string
          field_key: string
          field_label: string
          id: string
          required: boolean
          tenant_id: string
          updated_at: string
          visible_in_dashboard: boolean
        }
        Insert: {
          applies_to: string
          created_at?: string
          created_by?: string | null
          data_type: string
          field_key: string
          field_label: string
          id?: string
          required?: boolean
          tenant_id: string
          updated_at?: string
          visible_in_dashboard?: boolean
        }
        Update: {
          applies_to?: string
          created_at?: string
          created_by?: string | null
          data_type?: string
          field_key?: string
          field_label?: string
          id?: string
          required?: boolean
          tenant_id?: string
          updated_at?: string
          visible_in_dashboard?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tenant_custom_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_onboarding_state: {
        Row: {
          completed_at: string | null
          created_at: string
          payload: Json
          step_completed: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          payload?: Json
          step_completed?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          payload?: Json
          step_completed?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_onboarding_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          agency_name: string | null
          cloudflare_hostname_id: string | null
          created_at: string
          custom_domain: string | null
          default_annual_goal: number | null
          default_currency: string
          domain_status: string
          domain_txt_verification: string | null
          domain_verified: boolean
          id: string
          logo_url: string | null
          name: string
          plan: string | null
          primary_color: string | null
          subdomain: string | null
          time_zone: string | null
        }
        Insert: {
          agency_name?: string | null
          cloudflare_hostname_id?: string | null
          created_at?: string
          custom_domain?: string | null
          default_annual_goal?: number | null
          default_currency?: string
          domain_status?: string
          domain_txt_verification?: string | null
          domain_verified?: boolean
          id?: string
          logo_url?: string | null
          name: string
          plan?: string | null
          primary_color?: string | null
          subdomain?: string | null
          time_zone?: string | null
        }
        Update: {
          agency_name?: string | null
          cloudflare_hostname_id?: string | null
          created_at?: string
          custom_domain?: string | null
          default_annual_goal?: number | null
          default_currency?: string
          domain_status?: string
          domain_txt_verification?: string | null
          domain_verified?: boolean
          id?: string
          logo_url?: string | null
          name?: string
          plan?: string | null
          primary_color?: string | null
          subdomain?: string | null
          time_zone?: string | null
        }
        Relationships: []
      }
      user_action_items: {
        Row: {
          action_type: string
          auto_resolve_condition: string | null
          body: string | null
          created_at: string
          cta_text: string | null
          cta_url: string | null
          dismissed_at: string | null
          id: string
          is_dismissible: boolean
          resolved_at: string | null
          tenant_id: string
          title: string
          user_id: string
        }
        Insert: {
          action_type: string
          auto_resolve_condition?: string | null
          body?: string | null
          created_at?: string
          cta_text?: string | null
          cta_url?: string | null
          dismissed_at?: string | null
          id?: string
          is_dismissible?: boolean
          resolved_at?: string | null
          tenant_id: string
          title: string
          user_id: string
        }
        Update: {
          action_type?: string
          auto_resolve_condition?: string | null
          body?: string | null
          created_at?: string
          cta_text?: string | null
          cta_url?: string | null
          dismissed_at?: string | null
          id?: string
          is_dismissible?: boolean
          resolved_at?: string | null
          tenant_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_action_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_action_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_configs: {
        Row: {
          created_at: string
          event_type: string
          id: string
          is_active: boolean
          tenant_id: string
          webhook_url: string
        }
        Insert: {
          created_at?: string
          event_type?: string
          id?: string
          is_active?: boolean
          tenant_id: string
          webhook_url: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          is_active?: boolean
          tenant_id?: string
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      agent_current_positions: {
        Row: {
          agent_id: string | null
          position_id: string | null
          position_priority: number | null
          position_title: string | null
          start_date: string | null
          tenant_id: string | null
          upline_email: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_position_history_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_position_history_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_position_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      bulk_delete_policies: {
        Args: { policy_ids: string[]; reason?: string }
        Returns: {
          agent_id: string
          annual_premium_at_deletion: number
          audit_id: string
          deleted_policy_id: string
          paid_commission_total: number
          status_at_deletion: string
        }[]
      }
      claim_agent_record: {
        Args: {
          p_agent_email: string
          p_first_name?: string
          p_last_name?: string
          p_npn?: string
          p_phone?: string
          p_user_id: string
        }
        Returns: undefined
      }
      current_agent_id: { Args: never; Returns: string }
      flag_chargeback_risk: { Args: never; Returns: undefined }
      get_agent_position_at: {
        Args: { _agent_id: string; _at_date: string }
        Returns: string
      }
      get_agent_tenant_id_secure: {
        Args: { _user_id: string }
        Returns: string
      }
      get_current_agent_email: { Args: never; Returns: string }
      get_current_agent_tenant_id: { Args: never; Returns: string }
      get_downline_agent_ids: {
        Args: { _agent_email: string }
        Returns: string[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_owner_or_manager: { Args: never; Returns: boolean }
      is_tenant_owner: { Args: { _user_id: string }; Returns: boolean }
      reassign_agent_upline: {
        Args: { p_agent_id: string; p_new_upline_email: string }
        Returns: undefined
      }
      resolve_tenant_by_domain: {
        Args: { p_hostname: string }
        Returns: {
          agency_name: string
          custom_domain: string
          domain_verified: boolean
          id: string
          logo_url: string
          name: string
          plan: string
          primary_color: string
          subdomain: string
        }[]
      }
      snapshot_active_agents: { Args: { p_tenant_id: string }; Returns: number }
      update_carrier_status_mapping: {
        Args: {
          p_canonical_value: string
          p_carrier_name: string
          p_raw_value: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
