import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ServicePoint {
  id: string;
  name: string;
  description: string | null;
  short_description: string | null;
  address: string | null;
  type: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  logo_url: string | null;
}

/** Alla service-punkter (toaletter, laddning, AutoMat, vård …) — kartan visar de typer man valt */
export function useAllServicePoints() {
  return useQuery({
    queryKey: ["service-points", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_points")
        .select("id, name, description, short_description, address, type, lat, lng, phone, logo_url")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as ServicePoint[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
