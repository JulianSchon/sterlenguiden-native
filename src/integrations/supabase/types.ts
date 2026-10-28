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
      app_days: {
        Row: {
          day: string
          user_id: string
        }
        Insert: {
          day: string
          user_id: string
        }
        Update: {
          day?: string
          user_id?: string
        }
        Relationships: []
      }
      code_attempts: {
        Row: {
          at: string
          id: number
          kind: string
          user_id: string
        }
        Insert: {
          at?: string
          id?: never
          kind: string
          user_id: string
        }
        Update: {
          at?: string
          id?: never
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      collectibles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_path: string | null
          lat: number
          lng: number
          name: string
          place_id: number | null
          published: boolean
          sort_order: number
          town: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          lat: number
          lng: number
          name: string
          place_id?: number | null
          published?: boolean
          sort_order?: number
          town?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          lat?: number
          lng?: number
          name?: string
          place_id?: number | null
          published?: boolean
          sort_order?: number
          town?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collectibles_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
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
      discovery_likes: {
        Row: {
          created_at: string
          place_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          place_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          place_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovery_likes_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          booking_required: boolean
          created_at: string
          created_by: string | null
          date: string | null
          description: string | null
          end_date: string | null
          has_food_drink: boolean | null
          has_parking: boolean | null
          id: number
          image_url: string | null
          is_featured: boolean | null
          is_indoor: boolean | null
          is_sold_out: boolean | null
          location: string | null
          logo_url: string | null
          main_category: string | null
          place_id: number | null
          series_id: string | null
          ticket_url: string | null
          tickets_release_at: string | null
          tickets_required: boolean | null
          time: string | null
          title: string
          website_url: string | null
        }
        Insert: {
          booking_required?: boolean
          created_at?: string
          created_by?: string | null
          date?: string | null
          description?: string | null
          end_date?: string | null
          has_food_drink?: boolean | null
          has_parking?: boolean | null
          id?: number
          image_url?: string | null
          is_featured?: boolean | null
          is_indoor?: boolean | null
          is_sold_out?: boolean | null
          location?: string | null
          logo_url?: string | null
          main_category?: string | null
          place_id?: number | null
          series_id?: string | null
          ticket_url?: string | null
          tickets_release_at?: string | null
          tickets_required?: boolean | null
          time?: string | null
          title: string
          website_url?: string | null
        }
        Update: {
          booking_required?: boolean
          created_at?: string
          created_by?: string | null
          date?: string | null
          description?: string | null
          end_date?: string | null
          has_food_drink?: boolean | null
          has_parking?: boolean | null
          id?: number
          image_url?: string | null
          is_featured?: boolean | null
          is_indoor?: boolean | null
          is_sold_out?: boolean | null
          location?: string | null
          logo_url?: string | null
          main_category?: string | null
          place_id?: number | null
          series_id?: string | null
          ticket_url?: string | null
          tickets_release_at?: string | null
          tickets_required?: boolean | null
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
      favorites: {
        Row: {
          created_at: string
          event_id: number | null
          id: string
          place_id: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id?: number | null
          id?: string
          place_id?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: number | null
          id?: string
          place_id?: number | null
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
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: []
      }
      list_members: {
        Row: {
          joined_at: string
          list_id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          list_id: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          joined_at?: string
          list_id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      list_opens: {
        Row: {
          list_id: string
          opened_at: string
          user_id: string
        }
        Insert: {
          list_id: string
          opened_at?: string
          user_id: string
        }
        Update: {
          list_id?: string
          opened_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_opens_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      list_places: {
        Row: {
          added_by: string
          created_at: string
          id: string
          list_id: string
          place_id: number
          position: number
        }
        Insert: {
          added_by: string
          created_at?: string
          id?: string
          list_id: string
          place_id: number
          position?: number
        }
        Update: {
          added_by?: string
          created_at?: string
          id?: string
          list_id?: string
          place_id?: number
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "list_places_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_places_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          id: string
          invite_code: string
          name: string
          owner_id: string
          visible_to_friends: boolean
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invite_code?: string
          name: string
          owner_id: string
          visible_to_friends?: boolean
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invite_code?: string
          name?: string
          owner_id?: string
          visible_to_friends?: boolean
        }
        Relationships: []
      }
      memories: {
        Row: {
          created_at: string
          id: string
          memory_date: string
          people: string[]
          photo_paths: string[]
          place_ids: number[]
          story: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          memory_date?: string
          people?: string[]
          photo_paths?: string[]
          place_ids?: number[]
          story?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          memory_date?: string
          people?: string[]
          photo_paths?: string[]
          place_ids?: number[]
          story?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      news: {
        Row: {
          body: string | null
          cover_image_url: string | null
          created_at: string
          gallery_urls: string[] | null
          id: string
          ingress: string | null
          is_pinned: boolean
          is_published: boolean
          link_label: string | null
          link_url: string | null
          place_id: number | null
          priority: number
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          cover_image_url?: string | null
          created_at?: string
          gallery_urls?: string[] | null
          id?: string
          ingress?: string | null
          is_pinned?: boolean
          is_published?: boolean
          link_label?: string | null
          link_url?: string | null
          place_id?: number | null
          priority?: number
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          cover_image_url?: string | null
          created_at?: string
          gallery_urls?: string[] | null
          id?: string
          ingress?: string | null
          is_pinned?: boolean
          is_published?: boolean
          link_label?: string | null
          link_url?: string | null
          place_id?: number | null
          priority?: number
          published_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      offer_redemptions: {
        Row: {
          activated_at: string
          id: string
          offer_id: string
          user_id: string
        }
        Insert: {
          activated_at?: string
          id?: string
          offer_id: string
          user_id: string
        }
        Update: {
          activated_at?: string
          id?: string
          offer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_redemptions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          place_id: number
          redemption_interval: string
          redemption_limit: number | null
          savings_label: string | null
          savings_value: number | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          place_id: number
          redemption_interval?: string
          redemption_limit?: number | null
          savings_label?: string | null
          savings_value?: number | null
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          place_id?: number
          redemption_interval?: string
          redemption_limit?: number | null
          savings_label?: string | null
          savings_value?: number | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      pass_gifts: {
        Row: {
          activation_date: string | null
          buyer_id: string
          claim_code: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          delivery_method: string
          id: string
          message: string | null
          period: string
          price: number
          recipient_email: string | null
          recipient_name: string
          status: string
        }
        Insert: {
          activation_date?: string | null
          buyer_id: string
          claim_code?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          delivery_method?: string
          id?: string
          message?: string | null
          period: string
          price: number
          recipient_email?: string | null
          recipient_name: string
          status?: string
        }
        Update: {
          activation_date?: string | null
          buyer_id?: string
          claim_code?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          delivery_method?: string
          id?: string
          message?: string | null
          period?: string
          price?: number
          recipient_email?: string | null
          recipient_name?: string
          status?: string
        }
        Relationships: []
      }
      pass_products: {
        Row: {
          active: boolean
          auto_renew: boolean
          available_from: string | null
          available_until: string | null
          days: number
          description: string | null
          id: string
          name: string
          price_sek: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          auto_renew?: boolean
          available_from?: string | null
          available_until?: string | null
          days: number
          description?: string | null
          id: string
          name: string
          price_sek: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          auto_renew?: boolean
          available_from?: string | null
          available_until?: string | null
          days?: number
          description?: string | null
          id?: string
          name?: string
          price_sek?: number
          sort_order?: number
        }
        Relationships: []
      }
      pass_purchases: {
        Row: {
          card_brand: string | null
          card_last4: string | null
          created_at: string
          gift_id: string | null
          id: string
          kind: string
          note: string | null
          period: string
          price: number
          user_id: string
        }
        Insert: {
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          gift_id?: string | null
          id?: string
          kind?: string
          note?: string | null
          period: string
          price?: number
          user_id: string
        }
        Update: {
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          gift_id?: string | null
          id?: string
          kind?: string
          note?: string | null
          period?: string
          price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pass_purchases_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "pass_gifts"
            referencedColumns: ["id"]
          },
        ]
      }
      place_analytics: {
        Row: {
          created_at: string
          event_type: string
          id: string
          link_type: string | null
          place_id: number
          source: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          link_type?: string | null
          place_id: number
          source?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          link_type?: string | null
          place_id?: number
          source?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "place_analytics_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_changes: {
        Row: {
          created_at: string
          id: number
          place_id: number
          user_id: string | null
          what: string
        }
        Insert: {
          created_at?: string
          id?: number
          place_id: number
          user_id?: string | null
          what: string
        }
        Update: {
          created_at?: string
          id?: number
          place_id?: number
          user_id?: string | null
          what?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_changes_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_claim_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          place_id: number
          sent_to: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          place_id: number
          sent_to: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          place_id?: number
          sent_to?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_claim_codes_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          declined_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          permissions: string[] | null
          place_id: number
          role: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          declined_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          permissions?: string[] | null
          place_id: number
          role?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          declined_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          permissions?: string[] | null
          place_id?: number
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_invites_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_members: {
        Row: {
          created_at: string
          invited_by: string | null
          permissions: string[] | null
          place_id: number
          role: string
          terms_accepted_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          invited_by?: string | null
          permissions?: string[] | null
          place_id: number
          role?: string
          terms_accepted_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          invited_by?: string | null
          permissions?: string[] | null
          place_id?: number
          role?: string
          terms_accepted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_members_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_reports: {
        Row: {
          created_at: string
          handled: boolean
          id: string
          kind: string
          message: string | null
          place_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          handled?: boolean
          id?: string
          kind: string
          message?: string | null
          place_id: number
          user_id?: string
        }
        Update: {
          created_at?: string
          handled?: boolean
          id?: string
          kind?: string
          message?: string | null
          place_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_reports_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          kind: string
          message: string | null
          new_place: Json | null
          phone: string | null
          place_id: number | null
          role_title: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind: string
          message?: string | null
          new_place?: Json | null
          phone?: string | null
          place_id?: number | null
          role_title?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind?: string
          message?: string | null
          new_place?: Json | null
          phone?: string | null
          place_id?: number | null
          role_title?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_requests_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_suggestions: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          handled_at: string | null
          id: string
          is_owner: boolean
          language: string
          link: string | null
          location: string | null
          name: string
          status: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          handled_at?: string | null
          id?: string
          is_owner?: boolean
          language?: string
          link?: string | null
          location?: string | null
          name: string
          status?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          handled_at?: string | null
          id?: string
          is_owner?: boolean
          language?: string
          link?: string | null
          location?: string | null
          name?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      places: {
        Row: {
          amenities: Json
          book_url: string | null
          categories: string | null
          checkin_enabled: boolean
          claim_link_hidden: boolean
          description: string | null
          email: string | null
          facebook_url: string | null
          hours_exceptions: Json
          id: number
          image_url: string | null
          info_updated_at: string | null
          instagram_url: string | null
          is_business: boolean
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
          tastes: string[]
          transit_stop_name: string | null
          website_url: string | null
        }
        Insert: {
          amenities?: Json
          book_url?: string | null
          categories?: string | null
          checkin_enabled?: boolean
          claim_link_hidden?: boolean
          description?: string | null
          email?: string | null
          facebook_url?: string | null
          hours_exceptions?: Json
          id?: number
          image_url?: string | null
          info_updated_at?: string | null
          instagram_url?: string | null
          is_business?: boolean
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
          tastes?: string[]
          transit_stop_name?: string | null
          website_url?: string | null
        }
        Update: {
          amenities?: Json
          book_url?: string | null
          categories?: string | null
          checkin_enabled?: boolean
          claim_link_hidden?: boolean
          description?: string | null
          email?: string | null
          facebook_url?: string | null
          hours_exceptions?: Json
          id?: number
          image_url?: string | null
          info_updated_at?: string | null
          instagram_url?: string | null
          is_business?: boolean
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
          tastes?: string[]
          transit_stop_name?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_ring: string | null
          avatar_url: string | null
          birth_date: string | null
          birth_year: number | null
          card_color: string | null
          card_photo_changed_at: string | null
          circle_color: string | null
          city: string | null
          created_at: string
          display_name: string | null
          display_name_changed_at: string | null
          username_changed_at: string | null
          id: string
          interests: string[] | null
          is_member: boolean | null
          lives_in_osterlen: boolean | null
          member_auto_renew: boolean
          member_bonus_days: number
          member_period: string | null
          member_started_at: string | null
          member_until: string | null
          onboarded_at: string | null
          preferred_language: string | null
          profile_image_url: string | null
          show_in_leaderboard: boolean | null
          show_leaderboard_avatar: boolean
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          avatar_ring?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          birth_year?: number | null
          card_color?: string | null
          card_photo_changed_at?: string | null
          circle_color?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          display_name_changed_at?: string | null
          username_changed_at?: string | null
          id?: string
          interests?: string[] | null
          is_member?: boolean | null
          lives_in_osterlen?: boolean | null
          member_auto_renew?: boolean
          member_bonus_days?: number
          member_period?: string | null
          member_started_at?: string | null
          member_until?: string | null
          onboarded_at?: string | null
          preferred_language?: string | null
          profile_image_url?: string | null
          show_in_leaderboard?: boolean | null
          show_leaderboard_avatar?: boolean
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          avatar_ring?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          birth_year?: number | null
          card_color?: string | null
          card_photo_changed_at?: string | null
          circle_color?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          display_name_changed_at?: string | null
          username_changed_at?: string | null
          id?: string
          interests?: string[] | null
          is_member?: boolean | null
          lives_in_osterlen?: boolean | null
          member_auto_renew?: boolean
          member_bonus_days?: number
          member_period?: string | null
          member_started_at?: string | null
          member_until?: string | null
          onboarded_at?: string | null
          preferred_language?: string | null
          profile_image_url?: string | null
          show_in_leaderboard?: boolean | null
          show_leaderboard_avatar?: boolean
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      reward_cards: {
        Row: {
          bg: string
          bg2: string
          created_at: string
          id: string
          image_path: string | null
          kind: string
          light: boolean
          name: string
          period: string | null
        }
        Insert: {
          bg?: string
          bg2?: string
          created_at?: string
          id: string
          image_path?: string | null
          kind: string
          light?: boolean
          name: string
          period?: string | null
        }
        Update: {
          bg?: string
          bg2?: string
          created_at?: string
          id?: string
          image_path?: string | null
          kind?: string
          light?: boolean
          name?: string
          period?: string | null
        }
        Relationships: []
      }
      service_points: {
        Row: {
          address: string | null
          created_at: string
          description: string | null
          id: string
          lat: number
          lng: number
          logo_url: string | null
          name: string
          phone: string | null
          short_description: string | null
          type: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          description?: string | null
          id?: string
          lat: number
          lng: number
          logo_url?: string | null
          name: string
          phone?: string | null
          short_description?: string | null
          type: string
        }
        Update: {
          address?: string | null
          created_at?: string
          description?: string | null
          id?: string
          lat?: number
          lng?: number
          logo_url?: string | null
          name?: string
          phone?: string | null
          short_description?: string | null
          type?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          caption: string | null
          created_at: string
          expires_at: string | null
          id: string
          image_url: string
          link: Json | null
          place_id: number
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          image_url: string
          link?: Json | null
          place_id: number
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          image_url?: string
          link?: Json | null
          place_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
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
      trophies: {
        Row: {
          achievement_type: string
          created_at: string
          id: string
          level: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_type: string
          created_at?: string
          id?: string
          level: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_type?: string
          created_at?: string
          id?: string
          level?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_cards: {
        Row: {
          awarded_at: string
          card_id: string
          seen_at: string | null
          user_id: string
        }
        Insert: {
          awarded_at?: string
          card_id: string
          seen_at?: string | null
          user_id: string
        }
        Update: {
          awarded_at?: string
          card_id?: string
          seen_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "reward_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      user_collectibles: {
        Row: {
          collected_at: string
          collectible_id: string
          user_id: string
        }
        Insert: {
          collected_at?: string
          collectible_id: string
          user_id: string
        }
        Update: {
          collected_at?: string
          collectible_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_collectibles_collectible_id_fkey"
            columns: ["collectible_id"]
            isOneToOne: false
            referencedRelation: "collectibles"
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
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visits: {
        Row: {
          created_at: string
          id: string
          method: string
          place_id: number
          user_id: string
          visited_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          method?: string
          place_id: number
          user_id: string
          visited_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          method?: string
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
      place_reports_overview: {
        Row: {
          Åtgärdat: boolean | null
          Från: string | null
          Gäller: string | null
          id: string | null
          Meddelande: string | null
          place_id: number | null
          Plats: string | null
          Skickat: string | null
        }
        Relationships: [
          {
            foreignKeyName: "place_reports_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_requests_overview: {
        Row: {
          Avgjord: string | null
          "E-post": string | null
          id: string | null
          Meddelande: string | null
          Plats: string | null
          Skickad: string | null
          Status: string | null
          Vad: string | null
          Vem: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_list_invite: {
        Args: { target_list_id: string }
        Returns: undefined
      }
      achievement_met: {
        Args: { p_level: string; p_type: string; p_user: string }
        Returns: boolean
      }
      add_list_members: {
        Args: { target_list_id: string; target_user_ids: string[] }
        Returns: undefined
      }
      admin_decide_request: {
        Args: { p_approve: boolean; p_id: string }
        Returns: Json
      }
      admin_mark_suggestion: {
        Args: { p_done: boolean; p_id: string }
        Returns: undefined
      }
      admin_requests: { Args: never; Returns: Json }
      admin_suggestions: { Args: never; Returns: Json }
      app_email_key: { Args: never; Returns: string }
      app_email_ready: { Args: never; Returns: boolean }
      avatar_visible_to_me: {
        Args: { p_object_name: string }
        Returns: boolean
      }
      award_visits_card: {
        Args: { p_card_id: string }
        Returns: {
          display_name: string
          user_id: string
          username: string
          visit_count: number
        }[]
      }
      bp_adult: { Args: { p_uid: string }; Returns: boolean }
      bp_can: { Args: { p_perm: string; p_place_id: number }; Returns: boolean }
      bp_clean_exceptions: { Args: { p: Json }; Returns: Json }
      bp_default_permissions: { Args: never; Returns: string[] }
      bp_display_name: { Args: { p_uid: string }; Returns: string }
      bp_email_admins: {
        Args: { p_body: string; p_heading: string; p_subject: string }
        Returns: undefined
      }
      bp_email_owners: {
        Args: {
          p_body: string
          p_heading: string
          p_place_id: number
          p_subject: string
        }
        Returns: undefined
      }
      bp_email_user: {
        Args: {
          p_body: string
          p_heading: string
          p_subject: string
          p_uid: string
        }
        Returns: undefined
      }
      bp_html: { Args: { p: string }; Returns: string }
      bp_image_ok: {
        Args: { p_place_id: number; p_url: string }
        Returns: boolean
      }
      bp_images: { Args: { p: string }; Returns: string[] }
      bp_is_email: { Args: { p: string }; Returns: boolean }
      bp_is_phone: { Args: { p: string }; Returns: boolean }
      bp_log: {
        Args: { p_place_id: number; p_what: string }
        Returns: undefined
      }
      bp_media_prefix: { Args: { p_place_id: number }; Returns: string }
      bp_require_member: {
        Args: { p_owner?: boolean; p_place_id: number }
        Returns: string
      }
      bp_require_permission: {
        Args: { p_perm: string; p_place_id: number }
        Returns: undefined
      }
      bp_text: {
        Args: { p: Json; p_key: string; p_max: number }
        Returns: string
      }
      bp_url: { Args: { p: Json; p_key: string }; Returns: string }
      business_accept_terms: {
        Args: { p_place_id: number }
        Returns: undefined
      }
      business_answer_invite: {
        Args: { p_accept: boolean; p_id: string }
        Returns: Json
      }
      business_answer_join: {
        Args: { p_accept: boolean; p_id: string }
        Returns: Json
      }
      business_apply_new_place: { Args: { p: Json }; Returns: Json }
      business_cancel_invite: { Args: { p_id: string }; Returns: undefined }
      business_cancel_request: { Args: { p_id: string }; Returns: undefined }
      business_claim_info: { Args: { p_place_id: number }; Returns: Json }
      business_claim_send_code: { Args: { p_place_id: number }; Returns: Json }
      business_claim_verify: {
        Args: { p_code: string; p_place_id: number }
        Returns: Json
      }
      business_delete_event: {
        Args: { p_id: number; p_scope?: string }
        Returns: number
      }
      business_delete_story: { Args: { p_id: string }; Returns: undefined }
      business_invite: {
        Args: {
          p_email: string
          p_permissions?: string[]
          p_place_id: number
          p_role?: string
        }
        Returns: Json
      }
      business_offer_action: {
        Args: { p_action: string; p_id: string }
        Returns: Json
      }
      business_offers: { Args: { p_place_id: number }; Returns: Json }
      business_overview: { Args: never; Returns: Json }
      business_post_story: {
        Args: {
          p_caption?: string
          p_image_url: string
          p_link?: Json
          p_place_id: number
        }
        Returns: string
      }
      business_remove_member: {
        Args: { p_place_id: number; p_user_id: string }
        Returns: Json
      }
      business_request_access: {
        Args: {
          p_message?: string
          p_phone?: string
          p_place_id: number
          p_role_title?: string
        }
        Returns: Json
      }
      business_save_event: {
        Args: {
          p_dates?: string[]
          p_event: Json
          p_id?: number
          p_place_id: number
          p_scope?: string
        }
        Returns: Json
      }
      business_save_offer: {
        Args: { p_id?: string; p_offer: Json; p_place_id: number }
        Returns: string
      }
      business_set_member_permissions: {
        Args: { p_permissions: string[]; p_place_id: number; p_user_id: string }
        Returns: Json
      }
      business_set_member_role: {
        Args: { p_place_id: number; p_role: string; p_user_id: string }
        Returns: Json
      }
      business_stats: {
        Args: { p_days?: number; p_place_id: number }
        Returns: Json
      }
      business_stories_overview: { Args: { p_place_id: number }; Returns: Json }
      business_team: { Args: { p_place_id: number }; Returns: Json }
      business_update_place: {
        Args: { p_patch: Json; p_place_id: number }
        Returns: Json
      }
      can_manage_place_media: { Args: { p_name: string }; Returns: boolean }
      check_in: {
        Args: { p_lat: number; p_lng: number; p_place_id: number }
        Returns: {
          created_at: string
          id: string
          method: string
          place_id: number
          user_id: string
          visited_at: string
        }
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      code_attempts_left: { Args: { p_kind: string }; Returns: boolean }
      collect_sticker: {
        Args: { p_collectible_id: string; p_lat: number; p_lng: number }
        Returns: string
      }
      delete_my_account: { Args: never; Returns: undefined }
      has_all_treasures: { Args: { p_user: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_member: { Args: { p_uid: string }; Returns: boolean }
      is_app_admin: { Args: never; Returns: boolean }
      is_list_member: { Args: { l: string }; Returns: boolean }
      is_list_owner: { Args: { l: string }; Returns: boolean }
      join_list: { Args: { code: string }; Returns: string }
      leaderboard_card_winners: {
        Args: { p_card_id: string }
        Returns: {
          display_name: string
          user_id: string
          username: string
          visit_count: number
        }[]
      }
      mark_card_seen: { Args: { p_card_id: string }; Returns: undefined }
      redeem_pass_code: { Args: { _code: string }; Returns: Json }
      reorder_list_places: {
        Args: { ordered_row_ids: string[]; target_list_id: string }
        Returns: undefined
      }
      ring_requirement_met: {
        Args: { p_ring: string; p_user: string }
        Returns: boolean
      }
      rpc_active_redemption: {
        Args: never
        Returns: {
          activated_at: string
          offer_id: string
          server_now: string
        }[]
      }
      rpc_friend_list_places: {
        Args: { target_list_id: string }
        Returns: {
          added_by: string
          created_at: string
          place_id: number
          position: number
          row_id: string
        }[]
      }
      rpc_friend_lists: {
        Args: { target_user_id: string }
        Returns: {
          cover_image_url: string
          created_at: string
          description: string
          id: string
          name: string
          place_ids: number[]
        }[]
      }
      rpc_friend_stats: { Args: { target_user_id: string }; Returns: Json }
      rpc_friends_at_place: {
        Args: { p_place_id: number }
        Returns: {
          avatar_path: string
          avatar_ring: string
          circle_color: string
          display_name: string
          last_visit: string
          saved: boolean
          user_id: string
          username: string
          visits: number
        }[]
      }
      rpc_friends_recent_visits: {
        Args: { p_limit?: number }
        Returns: {
          avatar_path: string
          avatar_ring: string
          circle_color: string
          display_name: string
          place_id: number
          user_id: string
          username: string
          visited_at: string
        }[]
      }
      rpc_get_profile: {
        Args: { target_user_id: string }
        Returns: {
          avatar_path: string
          avatar_ring: string
          card_color: string
          circle_color: string
          city: string
          direction: string
          display_name: string
          friends_since: string
          friendship_id: string
          is_member: boolean
          member_since: string
          status: string
          user_id: string
          username: string
        }[]
      }
      rpc_leaderboard: {
        Args: {
          p_limit?: number
          p_metric: string
          p_offset?: number
          p_period?: string
          p_scope: string
        }
        Returns: {
          avatar_path: string
          circle_color: string
          city: string
          display_name: string
          metric_value: number
          placement: number
          row_pos: number
          self_row: boolean
          user_id: string
          username: string
        }[]
      }
      rpc_list_friendships: {
        Args: never
        Returns: {
          avatar_path: string
          avatar_ring: string
          card_color: string
          circle_color: string
          city: string
          created_at: string
          direction: string
          display_name: string
          friendship_id: string
          is_member: boolean
          status: string
          user_id: string
          username: string
        }[]
      }
      rpc_list_profiles_public: {
        Args: { target_user_ids: string[] }
        Returns: {
          avatar_path: string
          avatar_ring: string
          circle_color: string
          display_name: string
          user_id: string
          username: string
        }[]
      }
      rpc_my_last_leaderboard: {
        Args: { p_period: string }
        Returns: {
          participants: number
          period_start: string
          placement: number
          visit_count: number
        }[]
      }
      rpc_pending_list_invites: {
        Args: never
        Returns: {
          cover_image_url: string
          first_place_ids: number[]
          list_id: string
          list_name: string
          owner_avatar_path: string
          owner_circle_color: string
          owner_id: string
          owner_name: string
          owner_ring: string
          place_count: number
        }[]
      }
      rpc_search_users: {
        Args: { q: string }
        Returns: {
          avatar_ring: string
          card_color: string
          circle_color: string
          city: string
          direction: string
          display_name: string
          friendship_id: string
          is_member: boolean
          member_since: string
          status: string
          user_id: string
          username: string
        }[]
      }
      send_app_email: {
        Args: {
          p_body: string
          p_code?: string
          p_heading: string
          p_subject: string
          p_to: string
        }
        Returns: boolean
      }
      track_place_event: {
        Args: {
          p_kind: string
          p_link?: string
          p_place_id: number
          p_source?: string
        }
        Returns: undefined
      }
      user_trophy_stats: {
        Args: { p_user: string }
        Returns: {
          n_categories: number
          n_favorites: number
          n_lists: number
          n_memories: number
          n_redemptions: number
          n_swipes: number
          n_treasures: number
          n_visits: number
        }[]
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
      app_role: ["user", "business", "admin"],
    },
  },
} as const
