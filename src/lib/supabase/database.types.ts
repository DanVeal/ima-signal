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
      audio_items: {
        Row: {
          announcement_version_id: string | null
          created_at: string
          current_version_id: string | null
          id: string
          script_variant_id: string | null
          updated_at: string
        }
        Insert: {
          announcement_version_id?: string | null
          created_at?: string
          current_version_id?: string | null
          id?: string
          script_variant_id?: string | null
          updated_at?: string
        }
        Update: {
          announcement_version_id?: string | null
          created_at?: string
          current_version_id?: string | null
          id?: string
          script_variant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_items_announcement_version_id_fkey"
            columns: ["announcement_version_id"]
            isOneToOne: true
            referencedRelation: "prams_announcement_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_items_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "audio_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_items_script_variant_id_fkey"
            columns: ["script_variant_id"]
            isOneToOne: true
            referencedRelation: "script_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_versions: {
        Row: {
          audio_item_id: string
          bit_rate_bps: number | null
          channels: number | null
          codec: string | null
          container_format: string | null
          created_at: string
          duration_seconds: number | null
          file_checksum: string
          file_size_bytes: number
          id: string
          original_filename: string
          restored_from_version_id: string | null
          sample_rate_hz: number | null
          storage_bucket: string
          storage_path: string
          uploaded_by_user_id: string | null
          version_number: number
          waveform_peaks: Json | null
        }
        Insert: {
          audio_item_id: string
          bit_rate_bps?: number | null
          channels?: number | null
          codec?: string | null
          container_format?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_checksum: string
          file_size_bytes: number
          id?: string
          original_filename: string
          restored_from_version_id?: string | null
          sample_rate_hz?: number | null
          storage_bucket?: string
          storage_path: string
          uploaded_by_user_id?: string | null
          version_number: number
          waveform_peaks?: Json | null
        }
        Update: {
          audio_item_id?: string
          bit_rate_bps?: number | null
          channels?: number | null
          codec?: string | null
          container_format?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_checksum?: string
          file_size_bytes?: number
          id?: string
          original_filename?: string
          restored_from_version_id?: string | null
          sample_rate_hz?: number | null
          storage_bucket?: string
          storage_path?: string
          uploaded_by_user_id?: string | null
          version_number?: number
          waveform_peaks?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audio_versions_audio_item_id_fkey"
            columns: ["audio_item_id"]
            isOneToOne: false
            referencedRelation: "audio_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_versions_restored_from_version_id_fkey"
            columns: ["restored_from_version_id"]
            isOneToOne: false
            referencedRelation: "audio_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_versions_uploaded_by_user_id_fkey"
            columns: ["uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
          reference_code_raw: string | null
          section_id: string | null
          source_import_id: string | null
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
          reference_code_raw?: string | null
          section_id?: string | null
          source_import_id?: string | null
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
          reference_code_raw?: string | null
          section_id?: string | null
          source_import_id?: string | null
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
          {
            foreignKeyName: "prams_announcement_versions_source_import_id_fkey"
            columns: ["source_import_id"]
            isOneToOne: false
            referencedRelation: "prams_workbook_imports"
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
          original_reference_code: string | null
          reference_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_tags?: Json
          current_title: string
          id?: string
          notes?: string | null
          original_reference_code?: string | null
          reference_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_tags?: Json
          current_title?: string
          id?: string
          notes?: string | null
          original_reference_code?: string | null
          reference_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      prams_matrix_cells: {
        Row: {
          announcement_version_id: string
          created_at: string
          id: string
          row_id: string
          source_import_id: string | null
        }
        Insert: {
          announcement_version_id: string
          created_at?: string
          id?: string
          row_id: string
          source_import_id?: string | null
        }
        Update: {
          announcement_version_id?: string
          created_at?: string
          id?: string
          row_id?: string
          source_import_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prams_matrix_cells_announcement_version_id_fkey"
            columns: ["announcement_version_id"]
            isOneToOne: false
            referencedRelation: "prams_announcement_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prams_matrix_cells_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "prams_matrix_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prams_matrix_cells_source_import_id_fkey"
            columns: ["source_import_id"]
            isOneToOne: false
            referencedRelation: "prams_workbook_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      prams_matrix_rows: {
        Row: {
          created_at: string
          id: string
          row_key: string
          section_id: string
          sort_order: number
          source_import_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          row_key: string
          section_id: string
          sort_order: number
          source_import_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          row_key?: string
          section_id?: string
          sort_order?: number
          source_import_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "prams_matrix_rows_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "prams_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prams_matrix_rows_source_import_id_fkey"
            columns: ["source_import_id"]
            isOneToOne: false
            referencedRelation: "prams_workbook_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      prams_sections: {
        Row: {
          available: boolean
          id: string
          name: string
          project_id: string
          slug: string
          sort_order: number
          source_import_id: string | null
          source_sheet_name: string | null
        }
        Insert: {
          available?: boolean
          id?: string
          name: string
          project_id: string
          slug: string
          sort_order: number
          source_import_id?: string | null
          source_sheet_name?: string | null
        }
        Update: {
          available?: boolean
          id?: string
          name?: string
          project_id?: string
          slug?: string
          sort_order?: number
          source_import_id?: string | null
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
          {
            foreignKeyName: "prams_sections_source_import_id_fkey"
            columns: ["source_import_id"]
            isOneToOne: false
            referencedRelation: "prams_workbook_imports"
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
      prams_wording_group_members: {
        Row: {
          created_at: string
          id: string
          is_current: boolean
          matrix_cell_id: string
          replaces_membership_id: string | null
          wording_group_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_current?: boolean
          matrix_cell_id: string
          replaces_membership_id?: string | null
          wording_group_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_current?: boolean
          matrix_cell_id?: string
          replaces_membership_id?: string | null
          wording_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prams_wording_group_members_matrix_cell_id_fkey"
            columns: ["matrix_cell_id"]
            isOneToOne: false
            referencedRelation: "prams_matrix_cells"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prams_wording_group_members_replaces_membership_id_fkey"
            columns: ["replaces_membership_id"]
            isOneToOne: false
            referencedRelation: "prams_wording_group_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prams_wording_group_members_wording_group_id_fkey"
            columns: ["wording_group_id"]
            isOneToOne: false
            referencedRelation: "prams_wording_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      prams_wording_groups: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          id: string
          row_id: string
          source: string
          source_import_id: string | null
          text: string | null
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          row_id: string
          source: string
          source_import_id?: string | null
          text?: string | null
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          row_id?: string
          source?: string
          source_import_id?: string | null
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prams_wording_groups_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prams_wording_groups_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "prams_matrix_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prams_wording_groups_source_import_id_fkey"
            columns: ["source_import_id"]
            isOneToOne: false
            referencedRelation: "prams_workbook_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      prams_workbook_import_diffs: {
        Row: {
          created_at: string
          diff_type: string
          id: string
          import_id: string
          payload: Json
          reference_code: string | null
          row_key: string | null
          section_slug: string | null
        }
        Insert: {
          created_at?: string
          diff_type: string
          id?: string
          import_id: string
          payload?: Json
          reference_code?: string | null
          row_key?: string | null
          section_slug?: string | null
        }
        Update: {
          created_at?: string
          diff_type?: string
          id?: string
          import_id?: string
          payload?: Json
          reference_code?: string | null
          row_key?: string | null
          section_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prams_workbook_import_diffs_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "prams_workbook_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      prams_workbook_imports: {
        Row: {
          completed_at: string | null
          file_hash: string | null
          file_name: string
          id: string
          imported_by_user_id: string | null
          project_id: string
          started_at: string
          status: string
          summary: Json
        }
        Insert: {
          completed_at?: string | null
          file_hash?: string | null
          file_name: string
          id?: string
          imported_by_user_id?: string | null
          project_id: string
          started_at?: string
          status?: string
          summary?: Json
        }
        Update: {
          completed_at?: string | null
          file_hash?: string | null
          file_name?: string
          id?: string
          imported_by_user_id?: string | null
          project_id?: string
          started_at?: string
          status?: string
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "prams_workbook_imports_imported_by_user_id_fkey"
            columns: ["imported_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prams_workbook_imports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      script_lines: {
        Row: {
          id: string
          revision_id: string
          sort_order: number
          text: string
        }
        Insert: {
          id?: string
          revision_id: string
          sort_order: number
          text: string
        }
        Update: {
          id?: string
          revision_id?: string
          sort_order?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_lines_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "script_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      script_revisions: {
        Row: {
          approved_at: string | null
          approved_by_user_id: string | null
          created_at: string
          created_by_user_id: string | null
          id: string
          is_approved_for_recording: boolean
          notes: string | null
          revision_number: number
          variant_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          is_approved_for_recording?: boolean
          notes?: string | null
          revision_number: number
          variant_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          is_approved_for_recording?: boolean
          notes?: string | null
          revision_number?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_revisions_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_revisions_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_revisions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "script_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      script_variants: {
        Row: {
          column_order: number | null
          created_at: string
          departure_airport: string | null
          destination: string | null
          id: string
          offer_label: string | null
          region_label: string | null
          script_id: string
          updated_at: string
          variant_code: string
        }
        Insert: {
          column_order?: number | null
          created_at?: string
          departure_airport?: string | null
          destination?: string | null
          id?: string
          offer_label?: string | null
          region_label?: string | null
          script_id: string
          updated_at?: string
          variant_code: string
        }
        Update: {
          column_order?: number | null
          created_at?: string
          departure_airport?: string | null
          destination?: string | null
          id?: string
          offer_label?: string | null
          region_label?: string | null
          script_id?: string
          updated_at?: string
          variant_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_variants_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          created_at: string
          id: string
          project_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scripts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      audio_item_project_id: {
        Args: { p_audio_item_id: string }
        Returns: string
      }
      audio_subject_project_id: {
        Args: { p_announcement_version_id: string; p_script_variant_id: string }
        Returns: string
      }
      can_access_project: {
        Args: { target_project_id: string }
        Returns: boolean
      }
      can_upload_audio_for_project: {
        Args: { target_project_id: string }
        Returns: boolean
      }
      create_audio_version: {
        Args: {
          p_audio_item_id: string
          p_bit_rate_bps: number
          p_channels: number
          p_codec: string
          p_container_format: string
          p_duration_seconds: number
          p_file_checksum: string
          p_file_size_bytes: number
          p_original_filename: string
          p_sample_rate_hz: number
          p_storage_path: string
          p_waveform_peaks: Json
        }
        Returns: string
      }
      create_variant_override: {
        Args: {
          p_matrix_cell_id: string
          p_new_text: string
          p_wording_group_id: string
        }
        Returns: string
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
      edit_shared_wording: {
        Args: { p_new_text: string; p_wording_group_id: string }
        Returns: string
      }
      is_ima_manager: { Args: never; Returns: boolean }
      normalize_reference_code: { Args: { input: string }; Returns: string }
      prams_project_id_for_row: { Args: { p_row_id: string }; Returns: string }
      remerge_wording_cells: {
        Args: { p_matrix_cell_ids: string[]; p_text: string }
        Returns: string
      }
      restore_audio_version: {
        Args: { p_audio_version_id: string }
        Returns: string
      }
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

