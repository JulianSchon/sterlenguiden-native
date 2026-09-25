import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";

export const AVATAR_BUCKET = "profile-images";

/** Är värdet en sökväg i den privata mappen (ny) och inte en hel adress (äldre)? */
export const isAvatarPath = (value: string) => !value.startsWith("http");

/**
 * Adressen att visa en bild i den privata mappen med. Profilen innehåller en
 * sökväg, som byts mot en tillfällig länk (giltig 1 timme). Äldre profiler kan
 * ha en hel öppen adress; den används som den är. Returnerar null om det inte
 * finns någon bild (eller medan länken hämtas).
 */
function useSignedImageUrl(kind: string, entry: string | null): string | null {
  const needsSigning = !!entry && isAvatarPath(entry);

  const { data: signed } = useQuery({
    queryKey: [kind, entry],
    enabled: needsSigning,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(entry!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  if (!entry) return null;
  return needsSigning ? signed ?? null : entry;
}

/** Profilbilden (framsidan av kortet, Hem, Inställningar). */
export function useAvatarUrl(): string | null {
  const { data: profile } = useProfile();
  return useSignedImageUrl("avatar-url", profile?.avatar_url ?? null);
}

/** Kortfotot på baksidan av medlemskortet. */
export function useCardPhotoUrl(): string | null {
  const { data: profile } = useProfile();
  return useSignedImageUrl("card-photo-url", profile?.profile_image_url ?? null);
}
