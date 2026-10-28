import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signedInUser } from "@/lib/session";

export interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  username: string | null;
  city: string | null;
  avatar_url: string | null;
  profile_image_url: string | null;
  card_photo_changed_at: string | null;
  avatar_ring: string | null;
  is_member: boolean;
  member_period: string | null;
  member_started_at: string | null;
  member_until: string | null;
  member_auto_renew: boolean | null;
  member_bonus_days: number | null;
  display_name_changed_at: string | null;
  username_changed_at: string | null;
  birth_date: string | null;
  lives_in_osterlen: boolean | null;
  preferred_language: string;
  card_color: string | null;
  circle_color: string | null;
  /** Topplistor: null = aldrig tillfrågad, false = har sagt nej, true = deltar (migration 020) */
  show_in_leaderboard: boolean | null;
  /** Topplistor: visa profilbilden (bara när man också syns), av som standard (migration 024) */
  show_leaderboard_avatar: boolean;
  /** Kategorierna man sagt att man gillar (onboardingen, Inställningar › Intressen — migration 043) */
  interests?: string[] | null;
  /** När man gick igenom onboardingen; null = inte klar än (migration 043) */
  onboarded_at?: string | null;
  created_at: string;
  updated_at: string;
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const user = await signedInUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data as Profile | null;
    },
  });
}
