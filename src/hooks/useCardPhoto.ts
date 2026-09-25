/**
 * Kortfotot på baksidan av Österlenpasset. Ligger privat i samma mapp som
 * profilbilden (profile-images/<användare>/card-…), men är ett eget foto: personalen
 * jämför det med den som visar kortet. Databasen låter det bytas en gång i månaden
 * (triggern profiles_card_photo_guard), inte bara appen.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { preparePhoto } from "@/lib/photos";
import { AVATAR_BUCKET } from "@/hooks/useAvatarUrl";
import { pickSquarePhoto, storagePath, removeStoredImage, requireUserId, type PhotoSource } from "@/hooks/useAccount";
import type { Profile } from "@/hooks/useProfile";

const CARD_PHOTO_MAX_EDGE = 512;
export const CARD_PHOTO_COOLDOWN_DAYS = 30;

/** När kortfotot kan bytas igen, eller null om det går att byta nu. */
export function nextCardPhotoChange(profile: Pick<Profile, "card_photo_changed_at"> | null | undefined): Date | null {
  if (!profile?.card_photo_changed_at) return null;
  const next = addDays(new Date(profile.card_photo_changed_at), CARD_PHOTO_COOLDOWN_DAYS);
  return next.getTime() > Date.now() ? next : null;
}

/** Väljer och laddar upp kortfotot. Kastar Error("card_photo_cooldown") om det bytts för nyligen. */
export function useChangeCardPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (source: PhotoSource): Promise<boolean> => {
      const photo = await pickSquarePhoto(source);
      if (!photo) return false;
      const userId = await requireUserId();

      const uri = await preparePhoto(photo, CARD_PHOTO_MAX_EDGE);
      const bytes = await (await fetch(uri)).arrayBuffer();
      const path = `${userId}/card-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, bytes, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      const { data: previous } = await supabase.from("profiles").select("profile_image_url").eq("user_id", userId).maybeSingle();
      const { error } = await supabase.from("profiles").update({ profile_image_url: path }).eq("user_id", userId);
      if (error) {
        await removeStoredImage(path);
        if (error.message.includes("card_photo_cooldown")) throw new Error("card_photo_cooldown");
        throw error;
      }
      // Äldre värden kan vara en hel adress; storagePath tar fram sökvägen ur båda
      if (storagePath(previous?.profile_image_url) !== path) await removeStoredImage(previous?.profile_image_url);
      return true;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  });
}
