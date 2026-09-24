import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";

export const AVATAR_BUCKET = "profile-images";

/** Är värdet en sökväg i den privata mappen (ny) och inte en hel adress (äldre)? */
export const isAvatarPath = (value: string) => !value.startsWith("http");

/**
 * Adressen att visa användarens profilbild med. profiles.avatar_url innehåller
 * en sökväg i den privata mappen, som byts mot en tillfällig länk (giltig 1
 * timme). Äldre profiler kan ha en hel öppen adress; den används som den är.
 * Returnerar null om användaren inte har någon bild (eller medan länken hämtas).
 */
export function useAvatarUrl(): string | null {
  const { data: profile } = useProfile();
  const entry = profile?.avatar_url ?? null;
  const needsSigning = !!entry && isAvatarPath(entry);

  const { data: signed } = useQuery({
    queryKey: ["avatar-url", entry],
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
