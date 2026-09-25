/**
 * Ändringar av kontot: profilbild, visningsnamn, personuppgifter och radering.
 * Regler som "namnet kan bara ändras en gång i månaden" och "födelsedatum går
 * inte att ändra" tvingas av databasen (triggern profiles_guard), inte bara av appen.
 */
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { preparePhoto, type PickedPhoto } from "@/lib/photos";
import type { Profile } from "@/hooks/useProfile";
import { AVATAR_BUCKET, storagePath } from "@/hooks/useAvatarUrl";

/** Profilbilder visas som mest ~400 px, så 512 räcker gott */
const AVATAR_MAX_EDGE = 512;

export async function requireUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  return user.id;
}

export type PhotoSource = "library" | "camera";

/** Öppnar bildväljaren eller kameran med en fyrkantig beskärning. null = användaren avbröt. */
export async function pickSquarePhoto(source: PhotoSource): Promise<PickedPhoto | null> {
  const options: ImagePicker.ImagePickerOptions = { allowsEditing: true, aspect: [1, 1], quality: 0.8 };
  let result: ImagePicker.ImagePickerResult;
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("camera_denied");
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync({ ...options, mediaTypes: ["images"] });
  }
  if (result.canceled) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

export async function removeStoredImage(value: string | null | undefined) {
  const path = storagePath(value);
  if (path) await supabase.storage.from(AVATAR_BUCKET).remove([path]);
}

/** Väljer en bild, laddar upp den och sätter den som profilbild. Returnerar false om man avbröt. */
export function useChangeAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (source: PhotoSource): Promise<boolean> => {
      const photo = await pickSquarePhoto(source);
      if (!photo) return false;
      const userId = await requireUserId();

      const uri = await preparePhoto(photo, AVATAR_MAX_EDGE);
      const bytes = await (await fetch(uri)).arrayBuffer();
      const path = `${userId}/avatar-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, bytes, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      const { data: previous } = await supabase.from("profiles").select("avatar_url").eq("user_id", userId).maybeSingle();
      const { error } = await supabase.from("profiles").update({ avatar_url: path }).eq("user_id", userId);
      if (error) {
        await removeStoredImage(path);
        throw error;
      }
      await removeStoredImage(previous?.avatar_url);
      return true;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  });
}

export function useRemoveAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const userId = await requireUserId();
      const { data: current } = await supabase.from("profiles").select("avatar_url").eq("user_id", userId).maybeSingle();
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("user_id", userId);
      if (error) throw error;
      await removeStoredImage(current?.avatar_url);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  });
}

type ProfileChanges = {
  display_name?: string;
  circle_color?: string;
  birth_date?: string;
  lives_in_osterlen?: boolean;
};

/**
 * Sparar ändringar på profilen. Skärmen uppdateras direkt (optimistiskt) och
 * sparandet sker i bakgrunden; misslyckas det återställs profilen. Kastar
 * Error("display_name_cooldown") om namnet ändrats för nyligen och
 * Error("birth_date_locked") om födelsedatum redan är satt.
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changes: ProfileChanges) => {
      const userId = await requireUserId();
      const { error } = await supabase.from("profiles").update(changes).eq("user_id", userId);
      if (error) {
        if (error.message.includes("display_name_cooldown")) throw new Error("display_name_cooldown");
        if (error.message.includes("birth_date_locked")) throw new Error("birth_date_locked");
        throw error;
      }
    },
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: ["profile"] });
      const previous = queryClient.getQueryData<Profile | null>(["profile"]);
      if (previous) queryClient.setQueryData<Profile>(["profile"], { ...previous, ...changes });
      return { previous };
    },
    onError: (_error, _changes, context) => {
      if (context?.previous) queryClient.setQueryData(["profile"], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  });
}

/** Tar bort användarens filer, sedan kontot och all data via databasfunktionen delete_my_account. */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      const userId = await requireUserId();
      // Filerna måste bort först, databasfunktionen når inte lagringen
      for (const bucket of ["memories", AVATAR_BUCKET]) {
        const { data: files } = await supabase.storage.from(bucket).list(userId, { limit: 1000 });
        const paths = (files ?? []).map((f) => `${userId}/${f.name}`);
        if (paths.length > 0) await supabase.storage.from(bucket).remove(paths);
      }
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;
      // Kontot finns inte längre på servern; rensa bara den lokala sessionen
      await supabase.auth.signOut({ scope: "local" });
    },
  });
}
