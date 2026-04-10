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
      achievements: {
        Row: {
          achievement_type: string
          category: string | null
          created_at: string
          id: string
          level: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_type: string
          category?: string | null
          created_at?: string
          id?: string
          level: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_type?: string
          category?: string | null
          created_at?: string
          id?: string
          level?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      business_analytics: {
        Row: {
          created_at: string
          event_type: string
          id: string
          link_type: string | null
          place_id: number
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          link_type?: string | null
          place_id: number
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          link_type?: string | null
          place_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_analytics_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      business_stories: {
        Row: {
          caption: string | null
          created_at: string
          deal_text: string | null
          expires_at: string | null
          filter: string | null
          id: string
          image_url: string
          is_premium: boolean | null
          place_id: number
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          deal_text?: string | null
          expires_at?: string | null
          filter?: string | null
          id?: string
          image_url: string
          is_premium?: boolean | null
          place_id: number
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          deal_text?: string | null
          expires_at?: string | null
          filter?: string | null
          id?: string
          image_url?: string
          is_premium?: boolean | null
          place_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_stories_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      completed_levels: {
        Row: {
          completed_at: string | null
          id: string
          level_id: string | null
          profile_id: string | null
        }
        Insert: {
          completed_at?: string | null
          id?: string
          level_id?: string | null
          profile_id?: string | null
        }
        Update: {
          completed_at?: string | null
          id?: string
          level_id?: string | null
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "completed_levels_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "game_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completed_levels_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_dismissals: {
        Row: {
          created_at: string
          id: string
          place_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          place_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          place_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovery_dismissals_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          date: string | null
          description: string | null
          end_date: string | null
          id: number
          image_url: string | null
          is_featured: boolean | null
          location: string | null
          logo_url: string | null
          place_id: number | null
          time: string | null
          title: string
          website_url: string | null
        }
        Insert: {
          date?: string | null
          description?: string | null
          end_date?: string | null
          id?: number
          image_url?: string | null
          is_featured?: boolean | null
          location?: string | null
          logo_url?: string | null
          place_id?: number | null
          time?: string | null
          title: string
          website_url?: string | null
        }
        Update: {
          date?: string | null
          description?: string | null
          end_date?: string | null
          id?: number
          image_url?: string | null
          is_featured?: boolean | null
          location?: string | null
          logo_url?: string | null
          place_id?: number | null
          time?: string | null
          title?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      farm_items: {
        Row: {
          category: string
          created_at: string
          id: string
          image_url: string
          is_active: boolean
          min_level: number
          name: string
          season_id: string | null
          slot_type: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          image_url: string
          is_active?: boolean
          min_level?: number
          name: string
          season_id?: string | null
          slot_type?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          image_url?: string
          is_active?: boolean
          min_level?: number
          name?: string
          season_id?: string | null
          slot_type?: string | null
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          event_id: number | null
          id: string
          place_id: number | null
          service_point_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id?: number | null
          id?: string
          place_id?: number | null
          service_point_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: number | null
          id?: string
          place_id?: number | null
          service_point_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_service_point_id_fkey"
            columns: ["service_point_id"]
            isOneToOne: false
            referencedRelation: "service_points"
            referencedColumns: ["id"]
          },
        ]
      }
      game_levels: {
        Row: {
          config: Json | null
          created_at: string
          difficulty: number | null
          game_type: string | null
          id: string
          xp_reward: number | null
        }
        Insert: {
          config?: Json | null
          created_at?: string
          difficulty?: number | null
          game_type?: string | null
          id?: string
          xp_reward?: number | null
        }
        Update: {
          config?: Json | null
          created_at?: string
          difficulty?: number | null
          game_type?: string | null
          id?: string
          xp_reward?: number | null
        }
        Relationships: []
      }
      places: {
        Row: {
          book_url: string | null
          business_tier: string
          categories: string | null
          description: string | null
          email: string | null
          facebook_url: string | null
          id: number
          image_url: string | null
          instagram_url: string | null
          is_premium: boolean | null
          lat: number | null
          lng: number | null
          logo_url: string | null
          name: string
          nearest_town: string | null
          opening_hours: Json | null
          phone: string | null
          price_level: number | null
          short_description: string | null
          sub_category: string | null
          website_url: string | null
        }
        Insert: {
          book_url?: string | null
          business_tier?: string
          categories?: string | null
          description?: string | null
          email?: string | null
          facebook_url?: string | null
          id?: number
          image_url?: string | null
          instagram_url?: string | null
          is_premium?: boolean | null
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          name: string
          nearest_town?: string | null
          opening_hours?: Json | null
          phone?: string | null
          price_level?: number | null
          short_description?: string | null
          sub_category?: string | null
          website_url?: string | null
        }
        Update: {
          book_url?: string | null
          business_tier?: string
          categories?: string | null
          description?: string | null
          email?: string | null
          facebook_url?: string | null
          id?: number
          image_url?: string | null
          instagram_url?: string | null
          is_premium?: boolean | null
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          name?: string
          nearest_town?: string | null
          opening_hours?: Json | null
          phone?: string | null
          price_level?: number | null
          short_description?: string | null
          sub_category?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birth_year: number | null
          card_color: string | null
          circle_color: string | null
          city: string | null
          country: string | null
          created_at: string
          dark_mode: boolean | null
          display_name: string | null
          id: string
          is_member: boolean | null
          notifications_enabled: boolean | null
          preferred_language: string | null
          profile_image_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          birth_year?: number | null
          card_color?: string | null
          circle_color?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          dark_mode?: boolean | null
          display_name?: string | null
          id?: string
          is_member?: boolean | null
          notifications_enabled?: boolean | null
          preferred_language?: string | null
          profile_image_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          birth_year?: number | null
          card_color?: string | null
          circle_color?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          dark_mode?: boolean | null
          display_name?: string | null
          id?: string
          is_member?: boolean | null
          notifications_enabled?: boolean | null
          preferred_language?: string | null
          profile_image_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      service_points: {
        Row: {
          address: string | null
          created_at: string
          description: string | null
          distance: string | null
          id: string
          lat: number
          led_map: string | null
          lng: number
          logo_url: string | null
          name: string
          phone: string | null
          short_description: string | null
          type: string
          walk_bike: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          description?: string | null
          distance?: string | null
          id?: string
          lat: number
          led_map?: string | null
          lng: number
          logo_url?: string | null
          name: string
          phone?: string | null
          short_description?: string | null
          type: string
          walk_bike?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          description?: string | null
          distance?: string | null
          id?: string
          lat?: number
          led_map?: string | null
          lng?: number
          logo_url?: string | null
          name?: string
          phone?: string | null
          short_description?: string | null
          type?: string
          walk_bike?: string | null
        }
        Relationships: []
      }
      story_views: {
        Row: {
          id: string
          story_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          story_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          story_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: []
      }
      user_farm: {
        Row: {
          crop_left_variant: string | null
          crop_right_variant: string | null
          house_color: string | null
          id: string
          oven_variant: string | null
          slot_1_item_id: string | null
          slot_2_item_id: string | null
          slot_3_item_id: string | null
          slot_4_item_id: string | null
          slot_5_item_id: string | null
          updated_at: string
          user_id: string
          windmill_variant: string | null
        }
        Insert: {
          crop_left_variant?: string | null
          crop_right_variant?: string | null
          house_color?: string | null
          id?: string
          oven_variant?: string | null
          slot_1_item_id?: string | null
          slot_2_item_id?: string | null
          slot_3_item_id?: string | null
          slot_4_item_id?: string | null
          slot_5_item_id?: string | null
          updated_at?: string
          user_id: string
          windmill_variant?: string | null
        }
        Update: {
          crop_left_variant?: string | null
          crop_right_variant?: string | null
          house_color?: string | null
          id?: string
          oven_variant?: string | null
          slot_1_item_id?: string | null
          slot_2_item_id?: string | null
          slot_3_item_id?: string | null
          slot_4_item_id?: string | null
          slot_5_item_id?: string | null
          updated_at?: string
          user_id?: string
          windmill_variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_farm_slot_1_item_id_fkey"
            columns: ["slot_1_item_id"]
            isOneToOne: false
            referencedRelation: "farm_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_farm_slot_2_item_id_fkey"
            columns: ["slot_2_item_id"]
            isOneToOne: false
            referencedRelation: "farm_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_farm_slot_3_item_id_fkey"
            columns: ["slot_3_item_id"]
            isOneToOne: false
            referencedRelation: "farm_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_farm_slot_4_item_id_fkey"
            columns: ["slot_4_item_id"]
            isOneToOne: false
            referencedRelation: "farm_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_farm_slot_5_item_id_fkey"
            columns: ["slot_5_item_id"]
            isOneToOne: false
            referencedRelation: "farm_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_progression: {
        Row: {
          created_at: string | null
          current_level: number | null
          id: string
          lifetime_xp: number | null
          profile_id: string | null
          season_xp: number
        }
        Insert: {
          created_at?: string | null
          current_level?: number | null
          id?: string
          lifetime_xp?: number | null
          profile_id?: string | null
          season_xp: number
        }
        Update: {
          created_at?: string | null
          current_level?: number | null
          id?: string
          lifetime_xp?: number | null
          profile_id?: string | null
          season_xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_progression_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          name: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          name?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          name?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visits: {
        Row: {
          created_at: string
          id: string
          place_id: number
          user_id: string
          visited_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          place_id: number
          user_id: string
          visited_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          place_id?: number
          user_id?: string
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_place_audience_stats: { Args: { p_place_id: number }; Returns: Json }
      get_place_favorites_count: {
        Args: { p_place_id: number }
        Returns: number
      }
      get_story_visibility: {
        Args: never
        Returns: {
          created_at: string
          expires_at: string
          id: string
          is_premium: boolean
          place_id: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "user" | "business" | "admin"
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
      app_role: ["user", "business", "admin"],
    },
  },
} as const
