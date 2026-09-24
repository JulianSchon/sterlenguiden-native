/**
 * Minnen: privata, bara ägaren ser dem (RLS på memories och på lagringsmappen
 * "memories"). Nya foton ligger i en privat mapp under <user_id>/<fil>.jpg och
 * visas med tillfälliga signerade länkar.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { preparePhoto, type PickedPhoto } from "@/lib/photos";

const BUCKET = "memories";

export interface Memory {
  id: string;
  title: string;
  story: string | null;
  /** "YYYY-MM-DD" */
  memoryDate: string;
  /** Sökvägar i den privata mappen, första = omslag */
  photoPaths: string[];
  placeIds: number[];
  people: string[];
  createdAt: string;
}

export interface MemoryInput {
  title: string;
  story: string;
  memoryDate: string;
  placeIds: number[];
  people: string[];
}

function toMemory(r: {
  id: string; title: string; story: string | null; memory_date: string; photo_paths: string[] | null;
  place_ids: number[] | null; people: string[] | null; created_at: string;
}): Memory {
  return {
    id: r.id,
    title: r.title,
    story: r.story,
    memoryDate: r.memory_date,
    photoPaths: r.photo_paths ?? [],
    placeIds: (r.place_ids ?? []).map(Number),
    people: r.people ?? [],
    createdAt: r.created_at,
  };
}

async function requireUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  return user.id;
}

/** Alla egna minnen, nyast först (efter minnesdatum). */
export function useMemories() {
  return useQuery({
    queryKey: ["memories", "all"],
    queryFn: async (): Promise<Memory[]> => {
      const { data, error } = await supabase
        .from("memories")
        .select("*")
        .order("memory_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toMemory);
    },
  });
}

export function useMemory(id: string | undefined) {
  return useQuery({
    queryKey: ["memories", "detail", id],
    enabled: !!id,
    queryFn: async (): Promise<Memory | null> => {
      const { data, error } = await supabase.from("memories").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data ? toMemory(data) : null;
    },
  });
}

/**
 * Tillfälliga länkar (giltiga 1 timme, hämtas om efter 50 minuter) till fotona
 * i den privata mappen. Returnerar en karta från sökväg till länk.
 */
export function useSignedUrls(paths: string[]) {
  return useQuery({
    queryKey: ["memories", "urls", ...paths],
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      if (error) throw error;
      const urls: Record<string, string> = {};
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
      }
      return urls;
    },
  });
}

/** Krymper och laddar upp ett foto. Returnerar sökvägen i den privata mappen. */
async function uploadPhoto(userId: string, photo: PickedPhoto): Promise<string> {
  const uri = await preparePhoto(photo);
  const bytes = await (await fetch(uri)).arrayBuffer();
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

async function removePhotos(paths: string[]) {
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
}

/** Ett foto i taget, så hela minnet aldrig ligger i arbetsminnet samtidigt. */
async function uploadAll(userId: string, photos: PickedPhoto[]): Promise<string[]> {
  const paths: string[] = [];
  try {
    for (const p of photos) paths.push(await uploadPhoto(userId, p));
  } catch (e) {
    await removePhotos(paths); // ångra det som redan hunnit laddas upp
    throw e;
  }
  return paths;
}

export function useCreateMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, photos }: { input: MemoryInput; photos: PickedPhoto[] }) => {
      const userId = await requireUserId();
      const photoPaths = await uploadAll(userId, photos);
      const { data, error } = await supabase
        .from("memories")
        .insert({
          user_id: userId,
          title: input.title.trim(),
          story: input.story.trim() || null,
          memory_date: input.memoryDate,
          place_ids: input.placeIds,
          people: input.people,
          photo_paths: photoPaths,
        })
        .select("id")
        .single();
      if (error) {
        await removePhotos(photoPaths);
        throw error;
      }
      return data.id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memories"] }),
  });
}

/**
 * Uppdaterar ett minne. `keptPaths` är de gamla fotona som ska vara kvar (i
 * ordning), `newPhotos` läggs till efter dem. Övriga gamla foton raderas.
 */
export function useUpdateMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      memory, input, keptPaths, newPhotos,
    }: { memory: Memory; input: MemoryInput; keptPaths: string[]; newPhotos: PickedPhoto[] }) => {
      const userId = await requireUserId();
      const addedPaths = await uploadAll(userId, newPhotos);
      const { error } = await supabase
        .from("memories")
        .update({
          title: input.title.trim(),
          story: input.story.trim() || null,
          memory_date: input.memoryDate,
          place_ids: input.placeIds,
          people: input.people,
          photo_paths: [...keptPaths, ...addedPaths],
          updated_at: new Date().toISOString(),
        })
        .eq("id", memory.id);
      if (error) {
        await removePhotos(addedPaths);
        throw error;
      }
      await removePhotos(memory.photoPaths.filter((p) => !keptPaths.includes(p)));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memories"] }),
  });
}

export function useDeleteMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memory: Memory) => {
      const { error } = await supabase.from("memories").delete().eq("id", memory.id);
      if (error) throw error;
      await removePhotos(memory.photoPaths);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memories"] }),
  });
}
