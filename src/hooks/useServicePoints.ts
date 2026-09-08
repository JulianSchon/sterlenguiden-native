import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ServicePoint {
  id: number;
  name: string;
  description: string | null;
  type: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  logo_url: string | null;
}

/** Hämtar alla service-punkter med ett exakt type-värde. */
export function useServicePoints(type: string) {
  return useQuery({
    queryKey: ["service-points", type],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_points" as any)
        .select("id, name, description, type, lat, lng, phone, logo_url")
        .eq("type", type)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ServicePoint[];
    },
    staleTime: 60 * 1000,
  });
}

/** Hämtar alla service-punkter vars type börjar med ett prefix (t.ex. "Tjänster"). */
export function useServicePointsByPrefix(prefix: string) {
  return useQuery({
    queryKey: ["service-points-prefix", prefix],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_points" as any)
        .select("id, name, description, type, lat, lng, phone, logo_url")
        .like("type", `${prefix}%`)
        .order("type")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ServicePoint[];
    },
    staleTime: 60 * 1000,
  });
}
