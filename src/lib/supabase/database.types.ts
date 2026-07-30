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
      activity_events: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_label: string
          entity_type: string
          id: string
          metadata: Json
          organisation_id: string | null
          project_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_label: string
          entity_type: string
          id?: string
          metadata?: Json
          organisation_id?: string | null
          project_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_label?: string
          entity_type?: string
          id?: string
          metadata?: Json
          organisation_id?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          id: string
          name: string
          organisation_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organisation_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organisation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string
          id: string
          name: string
          type: Database["public"]["Enums"]["organisation_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          type: Database["public"]["Enums"]["organisation_type"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["organisation_type"]
        }
        Relationships: []
      }
      prams_announcement_versions: {
        Row: {
          announcement_id: string
          column_order: number | null
          created_at: string
          id: string
          project_id: string
          section_id: string | null
          status: Database["public"]["Enums"]["prams_announcement_version_status"]
          tags: Json
          title_at_import: string
          updated_at: string
        }
        Insert: {
          announcement_id: string
          column_order?: number | null
          created_at?: string
          id?: string
          project_id: string
          section_id?: string | null
          status?: Database["public"]["Enums"]["prams_announcement_version_status"]
          tags?: Json
          title_at_import: string
          updated_at?: string
        }
        Update: {
          announcement_id?: string
          column_order?: number | null
          created_at?: string
          id?: string
          project_id?: string
          section_id?: string | null
          status?: Database["public"]["Enums"]["prams_announcement_version_status"]
          tags?: Json
          title_at_import?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prams_announcement_versions_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "prams_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prams_announcement_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prams_announcement_versions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "prams_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      prams_announcements: {
        Row: {
          created_at: string
          current_tags: Json
          current_title: string
          id: string
          notes: string | null
          reference_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_tags?: Json
          current_title: string
          id?: string
          notes?: string | null
          reference_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_tags?: Json
          current_title?: string
          id?: string
          notes?: string | null
          reference_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      prams_sections: {
        Row: {
          available: boolean
          id: string
          name: string
          project_id: string
          slug: string
          sort_order: number
          source_sheet_name: string | null
        }
        Insert: {
          available?: boolean
          id?: string
          name: string
          project_id: string
          slug: string
          sort_order: number
          source_sheet_name?: string | null
        }
        Update: {
          available?: boolean
          id?: string
          name?: string
          project_id?: string
          slug?: string
          sort_order?: number
          source_sheet_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prams_sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      prams_updates: {
        Row: {
          created_at: string
          effective_from: string | null
          id: string
          project_id: string
          status: Database["public"]["Enums"]["prams_update_status"]
          superseded_by_update_id: string | null
          update_label: string
          updated_at: string
          workbook_source_label: string | null
        }
        Insert: {
          created_at?: string
          effective_from?: string | null
          id?: string
          project_id: string
          status?: Database["public"]["Enums"]["prams_update_status"]
          superseded_by_update_id?: string | null
          update_label: string
          updated_at?: string
          workbook_source_label?: string | null
        }
        Update: {
          created_at?: string
          effective_from?: string | null
          id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["prams_update_status"]
          superseded_by_update_id?: string | null
          update_label?: string
          updated_at?: string
          workbook_source_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prams_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prams_updates_superseded_by_update_id_fkey"
            columns: ["superseded_by_update_id"]
            isOneToOne: false
            referencedRelation: "prams_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_jet2_reviewers: {
        Row: {
          project_id: string
          user_id: string
        }
        Insert: {
          project_id: string
          user_id: string
        }
        Update: {
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_jet2_reviewers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_jet2_reviewers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          campaign_id: string
          client_review_deadline: string | null
          created_at: string
          deleted_at: string | null
          description: string
          id: string
          internal_review_deadline: string | null
          job_number: string
          live_date: string | null
          name: string
          notification_email: string | null
          owner_user_id: string | null
          recording_deadline: string | null
          status: Database["public"]["Enums"]["project_status"]
          studio_organisation_id: string | null
          type: Database["public"]["Enums"]["project_type"]
          updated_at: string
        }
        Insert: {
          campaign_id: string
          client_review_deadline?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          id?: string
          internal_review_deadline?: string | null
          job_number: string
          live_date?: string | null
          name: string
          notification_email?: string | null
          owner_user_id?: string | null
          recording_deadline?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          studio_organisation_id?: string | null
          type: Database["public"]["Enums"]["project_type"]
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          client_review_deadline?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          id?: string
          internal_review_deadline?: string | null
          job_number?: string
          live_date?: string | null
          name?: string
          notification_email?: string | null
          owner_user_id?: string | null
          recording_deadline?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          studio_organisation_id?: string | null
          type?: Database["public"]["Enums"]["project_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_studio_organisation_id_fkey"
            columns: ["studio_organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          auth_user_id: string
          avatar_initials: string
          created_at: string
          email: string
          full_name: string
          id: string
          organisation_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          auth_user_id: string
          avatar_initials: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          organisation_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          auth_user_id?: string
          avatar_initials?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          organisation_id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_project: {
        Args: { target_project_id: string }
        Returns: boolean
      }
      current_organisation_id: { Args: never; Returns: string }
      current_organisation_type: {
        Args: never
        Returns: Database["public"]["Enums"]["organisation_type"]
      }
      current_profile: {
        Args: never
        Returns: {
          auth_user_id: string
          avatar_initials: string
          created_at: string
          email: string
          full_name: string
          id: string
          organisation_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        SetofOptions: {
          from: "*"
          to: "user_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_ima_manager: { Args: never; Returns: boolean }
    }
    Enums: {
      organisation_type: "ima" | "jet2" | "studio"
      prams_announcement_version_status: "active" | "removed"
      prams_update_status: "draft" | "active" | "archived"
      project_status:
        | "draft_script"
        | "ready_to_record"
        | "studio_recording"
        | "ready_for_ima_review"
        | "ima_changes_requested"
        | "ready_for_jet2_review"
        | "jet2_changes_requested"
        | "approved"
        | "delivered"
      project_type: "standard_radio" | "prams"
      user_role:
        | "ima_admin"
        | "ima_producer"
        | "ima_reviewer"
        | "jet2_reviewer"
        | "jet2_view_only"
        | "studio_admin"
        | "studio_contributor"
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
      organisation_type: ["ima", "jet2", "studio"],
      prams_announcement_version_status: ["active", "removed"],
      prams_update_status: ["draft", "active", "archived"],
      project_status: [
        "draft_script",
        "ready_to_record",
        "studio_recording",
        "ready_for_ima_review",
        "ima_changes_requested",
        "ready_for_jet2_review",
        "jet2_changes_requested",
        "approved",
        "delivered",
      ],
      project_type: ["standard_radio", "prams"],
      user_role: [
        "ima_admin",
        "ima_producer",
        "ima_reviewer",
        "jet2_reviewer",
        "jet2_view_only",
        "studio_admin",
        "studio_contributor",
      ],
    },
  },
} as const

