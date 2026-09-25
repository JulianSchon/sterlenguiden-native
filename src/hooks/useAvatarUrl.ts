import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";

export const AVATAR_BUCKET = "profile-images";

/**
 * Sökvägen i den privata bildmappen för ett värde ur profiles (avatar_url eller
 * profile_image_url): antingen själva sökvägen (nytt) eller en hel öppen adress
 * ur den tid mappen var öppen (äldre). Annars null (en adress någon annanstans).
 */
export function storagePath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("http")) return value;
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const i = value.indexOf(marker);
  return i >= 0 ? decodeURIComponent(value.slice(i + marker.length).split("?")[0]) : null;
}

/**
 * Adressen att visa en bild i den privata mappen med. Profilen innehåller en
 * sökväg (eller en äldre öppen adress till samma mapp), som byts mot en
 * tillfällig länk (giltig 1 timme). Returnerar null om det inte finns någon bild
 * (eller medan länken hämtas).
 */
function useSignedImageUrl(kind: string, entry: string | null): string | null {
  const path = storagePath(entry);

  const { data: signed } = useQuery({
    queryKey: [kind, entry],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  if (!entry) return null;
  return path ? signed ?? null : entry;
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
