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
    PostgrestVersion: "14.15"
  }
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
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_table: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_blocks: {
        Row: {
          active: boolean
          boat_id: string
          booking_id: string | null
          created_at: string
          id: string
          reason: string | null
          source: string
          time_slot_id: string
          tour_date: string
        }
        Insert: {
          active?: boolean
          boat_id: string
          booking_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          source: string
          time_slot_id: string
          tour_date: string
        }
        Update: {
          active?: boolean
          boat_id?: string
          booking_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          source?: string
          time_slot_id?: string
          tour_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_blocks_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_time_slot_id_fkey"
            columns: ["time_slot_id"]
            isOneToOne: false
            referencedRelation: "time_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      boat_images: {
        Row: {
          active: boolean
          alt_text: string
          boat_id: string
          created_at: string
          deleted_at: string | null
          deletion_attempts: number
          deletion_error: string | null
          id: string
          image_url: string
          is_primary: boolean
          pending_deletion: boolean
          sort_order: number
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          alt_text?: string
          boat_id: string
          created_at?: string
          deleted_at?: string | null
          deletion_attempts?: number
          deletion_error?: string | null
          id?: string
          image_url: string
          is_primary?: boolean
          pending_deletion?: boolean
          sort_order?: number
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          alt_text?: string
          boat_id?: string
          created_at?: string
          deleted_at?: string | null
          deletion_attempts?: number
          deletion_error?: string | null
          id?: string
          image_url?: string
          is_primary?: boolean
          pending_deletion?: boolean
          sort_order?: number
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boat_images_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
        ]
      }
      boat_tours: {
        Row: {
          active: boolean
          boat_id: string
          id: string
          sort_order: number
          tour_id: string
        }
        Insert: {
          active?: boolean
          boat_id: string
          id?: string
          sort_order?: number
          tour_id: string
        }
        Update: {
          active?: boolean
          boat_id?: string
          id?: string
          sort_order?: number
          tour_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boat_tours_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boat_tours_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      boats: {
        Row: {
          active: boolean
          badge: string | null
          base_price_label: string | null
          created_at: string
          engine: string | null
          extra_guest_price: number
          featured_spec: string | null
          id: string
          image_public_id: string | null
          image_url: string | null
          images: Json
          included_guests: number
          length: string | null
          max_guests: number
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          badge?: string | null
          base_price_label?: string | null
          created_at?: string
          engine?: string | null
          extra_guest_price?: number
          featured_spec?: string | null
          id: string
          image_public_id?: string | null
          image_url?: string | null
          images?: Json
          included_guests?: number
          length?: string | null
          max_guests: number
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          badge?: string | null
          base_price_label?: string | null
          created_at?: string
          engine?: string | null
          extra_guest_price?: number
          featured_spec?: string | null
          id?: string
          image_public_id?: string | null
          image_url?: string | null
          images?: Json
          included_guests?: number
          length?: string | null
          max_guests?: number
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      booking_extras: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          key: string
          label: string
          quantity: number
          total: number
          unit_price: number
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          key: string
          label: string
          quantity: number
          total: number
          unit_price: number
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          key?: string
          label?: string
          quantity?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_extras_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_notifications: {
        Row: {
          booking_id: string
          channel: string
          created_at: string
          dedupe_key: string
          id: string
          payload: Json
          sent_at: string | null
          type: string
        }
        Insert: {
          booking_id: string
          channel: string
          created_at?: string
          dedupe_key: string
          id?: string
          payload?: Json
          sent_at?: string | null
          type: string
        }
        Update: {
          booking_id?: string
          channel?: string
          created_at?: string
          dedupe_key?: string
          id?: string
          payload?: Json
          sent_at?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_rate_limits: {
        Row: {
          attempts: number
          ip_hash: string
          updated_at: string
          window_start: string
        }
        Insert: {
          attempts?: number
          ip_hash: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          attempts?: number
          ip_hash?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      booking_status_history: {
        Row: {
          booking_id: string
          changed_by: string | null
          created_at: string
          id: string
          new_booking_status: string
          new_payment_status: string
          note: string | null
          previous_booking_status: string | null
          previous_payment_status: string | null
        }
        Insert: {
          booking_id: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_booking_status: string
          new_payment_status: string
          note?: string | null
          previous_booking_status?: string | null
          previous_payment_status?: string | null
        }
        Update: {
          booking_id?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_booking_status?: string
          new_payment_status?: string
          note?: string | null
          previous_booking_status?: string | null
          previous_payment_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_status_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          admin_notes: string | null
          base_price_snapshot: number
          boat_id: string
          boat_tour_id: string
          booking_reference: string
          booking_status: string
          created_at: string
          currency: string
          customer_id: string
          departure_currency_snapshot: string | null
          departure_location_id: string | null
          departure_location_name_snapshot: string | null
          departure_surcharge_snapshot: number | null
          expires_at: string | null
          extra_guest_price_snapshot: number
          extra_guests_snapshot: number
          extra_guests_total_snapshot: number
          extras_total_snapshot: number
          guests: number
          id: string
          included_guests_snapshot: number
          max_guests_snapshot: number
          meal_option: string | null
          payment_method_key: string
          payment_status: string
          paypal_order_id: string | null
          special_requests: string | null
          time_slot_id: string
          total_snapshot: number
          tour_date: string
          tour_id: string
          tour_package_id: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          base_price_snapshot: number
          boat_id: string
          boat_tour_id: string
          booking_reference: string
          booking_status: string
          created_at?: string
          currency?: string
          customer_id: string
          departure_currency_snapshot?: string | null
          departure_location_id?: string | null
          departure_location_name_snapshot?: string | null
          departure_surcharge_snapshot?: number | null
          expires_at?: string | null
          extra_guest_price_snapshot: number
          extra_guests_snapshot?: number
          extra_guests_total_snapshot?: number
          extras_total_snapshot?: number
          guests: number
          id?: string
          included_guests_snapshot: number
          max_guests_snapshot: number
          meal_option?: string | null
          payment_method_key: string
          payment_status: string
          paypal_order_id?: string | null
          special_requests?: string | null
          time_slot_id: string
          total_snapshot: number
          tour_date: string
          tour_id: string
          tour_package_id: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          base_price_snapshot?: number
          boat_id?: string
          boat_tour_id?: string
          booking_reference?: string
          booking_status?: string
          created_at?: string
          currency?: string
          customer_id?: string
          departure_currency_snapshot?: string | null
          departure_location_id?: string | null
          departure_location_name_snapshot?: string | null
          departure_surcharge_snapshot?: number | null
          expires_at?: string | null
          extra_guest_price_snapshot?: number
          extra_guests_snapshot?: number
          extra_guests_total_snapshot?: number
          extras_total_snapshot?: number
          guests?: number
          id?: string
          included_guests_snapshot?: number
          max_guests_snapshot?: number
          meal_option?: string | null
          payment_method_key?: string
          payment_status?: string
          paypal_order_id?: string | null
          special_requests?: string | null
          time_slot_id?: string
          total_snapshot?: number
          tour_date?: string
          tour_id?: string
          tour_package_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_boat_tour_id_fkey"
            columns: ["boat_tour_id"]
            isOneToOne: false
            referencedRelation: "boat_tours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_departure_location_id_fkey"
            columns: ["departure_location_id"]
            isOneToOne: false
            referencedRelation: "departure_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_payment_method_key_fkey"
            columns: ["payment_method_key"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "bookings_time_slot_id_fkey"
            columns: ["time_slot_id"]
            isOneToOne: false
            referencedRelation: "time_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_tour_package_id_fkey"
            columns: ["tour_package_id"]
            isOneToOne: false
            referencedRelation: "tour_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      departure_locations: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          slug: string
          sort_order: number
          surcharge_amount: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          slug: string
          sort_order?: number
          surcharge_amount?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          slug?: string
          sort_order?: number
          surcharge_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          country: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
          whatsapp: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          updated_at?: string
          whatsapp: string
        }
        Update: {
          country?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
          whatsapp?: string
        }
        Relationships: []
      }
      destinations: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          image_public_id: string | null
          image_url: string | null
          name: string
          region: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id: string
          image_public_id?: string | null
          image_url?: string | null
          name: string
          region?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          image_public_id?: string | null
          image_url?: string | null
          name?: string
          region?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      editable_content: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          group_name: string
          id: string
          key: string
          label: string | null
          locale: string
          type: string
          updated_at: string
          value: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          group_name: string
          id?: string
          key: string
          label?: string | null
          locale: string
          type: string
          updated_at?: string
          value: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          group_name?: string
          id?: string
          key?: string
          label?: string | null
          locale?: string
          type?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      extras: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          key: string
          label: string
          sort_order: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id: string
          key: string
          label: string
          sort_order?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          label?: string
          sort_order?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      gallery_images: {
        Row: {
          active: boolean
          alt: string
          category: string
          created_at: string
          id: string
          image_public_id: string | null
          image_url: string | null
          sort_order: number
          src: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          alt: string
          category: string
          created_at?: string
          id: string
          image_public_id?: string | null
          image_url?: string | null
          sort_order?: number
          src?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          alt?: string
          category?: string
          created_at?: string
          id?: string
          image_public_id?: string | null
          image_url?: string | null
          sort_order?: number
          src?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          active: boolean
          byte_size: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deletion_attempts: number
          deletion_error: string | null
          height: number | null
          id: string
          mime_type: string | null
          original_filename: string | null
          pending_deletion: boolean
          provider: string
          provider_id: string
          public_url: string | null
          resource_id: string | null
          resource_table: string | null
          size_bytes: number | null
          storage_bucket: string | null
          storage_path: string | null
          uploaded_by: string | null
          url: string
          width: number | null
        }
        Insert: {
          active?: boolean
          byte_size?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deletion_attempts?: number
          deletion_error?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          pending_deletion?: boolean
          provider?: string
          provider_id: string
          public_url?: string | null
          resource_id?: string | null
          resource_table?: string | null
          size_bytes?: number | null
          storage_bucket?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
          url: string
          width?: number | null
        }
        Update: {
          active?: boolean
          byte_size?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deletion_attempts?: number
          deletion_error?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          pending_deletion?: boolean
          provider?: string
          provider_id?: string
          public_url?: string | null
          resource_id?: string | null
          resource_table?: string | null
          size_bytes?: number | null
          storage_bucket?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      package_extras: {
        Row: {
          active: boolean
          created_at: string
          extra_id: string
          id: string
          sort_order: number
          tour_package_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          extra_id: string
          id?: string
          sort_order?: number
          tour_package_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          extra_id?: string
          id?: string
          sort_order?: number
          tour_package_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_extras_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "extras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_extras_tour_package_id_fkey"
            columns: ["tour_package_id"]
            isOneToOne: false
            referencedRelation: "tour_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          instructions: string | null
          key: string
          logo_url: string | null
          name: string
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          instructions?: string | null
          key: string
          logo_url?: string | null
          name: string
          sort_order?: number
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          instructions?: string | null
          key?: string
          logo_url?: string | null
          name?: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_webhook_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
          provider: string
          provider_event_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload: Json
          processed?: boolean
          processed_at?: string | null
          provider: string
          provider_event_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          currency: string
          id: string
          provider: string
          provider_capture_id: string | null
          provider_order_id: string | null
          raw_response: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          currency?: string
          id?: string
          provider: string
          provider_capture_id?: string | null
          provider_order_id?: string | null
          raw_response?: Json | null
          status: string
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          currency?: string
          id?: string
          provider?: string
          provider_capture_id?: string | null
          provider_order_id?: string | null
          raw_response?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      review_rate_limits: {
        Row: {
          attempts: number
          created_at: string
          id: string
          ip_hash: string
          updated_at: string
          window_start: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          ip_hash: string
          updated_at?: string
          window_start: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          ip_hash?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          active: boolean
          boat_id: string | null
          country: string | null
          created_at: string
          featured: boolean
          id: string
          image_public_id: string | null
          image_url: string | null
          name: string
          quote: string
          rating: number
          sort_order: number
          status: string
          tour_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          boat_id?: string | null
          country?: string | null
          created_at?: string
          featured?: boolean
          id?: string
          image_public_id?: string | null
          image_url?: string | null
          name: string
          quote: string
          rating: number
          sort_order?: number
          status?: string
          tour_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          boat_id?: string | null
          country?: string | null
          created_at?: string
          featured?: boolean
          id?: string
          image_public_id?: string | null
          image_url?: string | null
          name?: string
          quote?: string
          rating?: number
          sort_order?: number
          status?: string
          tour_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          active: boolean
          created_at: string
          key: string
          type: string
          updated_at: string
          value: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          key: string
          type?: string
          updated_at?: string
          value: string
        }
        Update: {
          active?: boolean
          created_at?: string
          key?: string
          type?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      time_slots: {
        Row: {
          active: boolean
          id: string
          label: string
          sort_order: number
          starts_at: string
        }
        Insert: {
          active?: boolean
          id: string
          label: string
          sort_order?: number
          starts_at: string
        }
        Update: {
          active?: boolean
          id?: string
          label?: string
          sort_order?: number
          starts_at?: string
        }
        Relationships: []
      }
      tour_images: {
        Row: {
          active: boolean
          alt_text: string
          created_at: string
          deletion_error: string | null
          id: string
          image_url: string
          is_primary: boolean
          pending_deletion: boolean
          sort_order: number
          storage_path: string | null
          tour_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          alt_text?: string
          created_at?: string
          deletion_error?: string | null
          id?: string
          image_url: string
          is_primary?: boolean
          pending_deletion?: boolean
          sort_order?: number
          storage_path?: string | null
          tour_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          alt_text?: string
          created_at?: string
          deletion_error?: string | null
          id?: string
          image_url?: string
          is_primary?: boolean
          pending_deletion?: boolean
          sort_order?: number
          storage_path?: string | null
          tour_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_images_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_inclusions: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          sort_order: number
          tour_id: string
          tour_package_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          sort_order?: number
          tour_id: string
          tour_package_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
          tour_id?: string
          tour_package_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_inclusions_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_inclusions_tour_package_id_fkey"
            columns: ["tour_package_id"]
            isOneToOne: false
            referencedRelation: "tour_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_locations: {
        Row: {
          created_at: string
          id: string
          location: string
          sort_order: number
          tour_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location: string
          sort_order?: number
          tour_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string
          sort_order?: number
          tour_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_locations_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_packages: {
        Row: {
          active: boolean
          base_price: number
          boat_tour_id: string
          created_at: string
          custom_quote: boolean
          description: string | null
          duration_minutes: number | null
          extra_guest_price: number
          id: string
          image_public_id: string | null
          image_url: string | null
          included_guests: number
          max_guests: number
          name: string
          package_type: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_price?: number
          boat_tour_id: string
          created_at?: string
          custom_quote?: boolean
          description?: string | null
          duration_minutes?: number | null
          extra_guest_price?: number
          id: string
          image_public_id?: string | null
          image_url?: string | null
          included_guests?: number
          max_guests: number
          name: string
          package_type: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_price?: number
          boat_tour_id?: string
          created_at?: string
          custom_quote?: boolean
          description?: string | null
          duration_minutes?: number | null
          extra_guest_price?: number
          id?: string
          image_public_id?: string | null
          image_url?: string | null
          included_guests?: number
          max_guests?: number
          name?: string
          package_type?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_packages_boat_tour_id_fkey"
            columns: ["boat_tour_id"]
            isOneToOne: false
            referencedRelation: "boat_tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tours: {
        Row: {
          active: boolean
          category: string
          created_at: string
          description: string | null
          featured: boolean
          highlights: Json
          id: string
          image_alt: string | null
          image_public_id: string | null
          image_url: string | null
          included: Json
          location: string | null
          long_description: string | null
          publication_status: string
          rating: number
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          description?: string | null
          featured?: boolean
          highlights?: Json
          id: string
          image_alt?: string | null
          image_public_id?: string | null
          image_url?: string | null
          included?: Json
          location?: string | null
          long_description?: string | null
          publication_status?: string
          rating?: number
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string | null
          featured?: boolean
          highlights?: Json
          id?: string
          image_alt?: string | null
          image_public_id?: string | null
          image_url?: string | null
          included?: Json
          location?: string | null
          long_description?: string | null
          publication_status?: string
          rating?: number
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_booking_rate_limit: {
        Args: { p_ip_hash: string; p_limit?: number; p_window_minutes?: number }
        Returns: boolean
      }
      create_booking_transaction: { Args: { payload: Json }; Returns: Json }
      expire_pending_paypal_bookings: { Args: never; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      is_admin_editor_viewer: { Args: never; Returns: boolean }
      is_editor_or_admin: { Args: never; Returns: boolean }
      mark_paypal_order_created: {
        Args: {
          p_amount: number
          p_booking_id: string
          p_currency: string
          p_paypal_order_id: string
          p_raw_response: Json
        }
        Returns: Json
      }
      mark_paypal_payment_paid: {
        Args: {
          p_amount: number
          p_booking_id: string
          p_currency: string
          p_paypal_capture_id: string
          p_paypal_order_id: string
          p_raw_response: Json
        }
        Returns: Json
      }
      mark_paypal_payment_refunded: {
        Args: {
          p_amount: number
          p_booking_id: string
          p_currency: string
          p_paypal_order_id: string
          p_raw_response: Json
        }
        Returns: Json
      }
      mark_paypal_payment_unsuccessful: {
        Args: {
          p_booking_id: string
          p_paypal_order_id: string
          p_raw_response: Json
          p_status: string
        }
        Returns: Json
      }
      record_review_attempt: {
        Args: { p_ip_hash: string; p_limit?: number }
        Returns: boolean
      }
      update_booking_status: {
        Args: {
          p_booking_id: string
          p_booking_status: string
          p_note?: string
          p_payment_status?: string
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
    Enums: {},
  },
} as const
