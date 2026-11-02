/** Listornas omslagsbilder (bucketen list-covers, en mapp per lista) */
import { supabase } from "@/integrations/supabase/client";

export const COVER_BUCKET = "list-covers";

/** Rensar en omslagsbild ur bucketen om det är en uppladdad (samma bucket-egna sökväg, inte en
 * adress utanför den, annars skulle vi kunna radera någon annans fil av misstag). Delad av byte,
 * återställning och borttaget konto. Kastar aldrig: ett nätfel här fick annars något som lyckats
 * att se misslyckat ut — blir bilden kvar tar den bara plats. */
export async function removeListCover(url: string | null | undefined) {
  const path = url?.includes(`/${COVER_BUCKET}/`) ? url.split(`/${COVER_BUCKET}/`)[1] : null;
  if (!path) return;
  try {
    await supabase.storage.from(COVER_BUCKET).remove([path]);
  } catch {
    // Se ovan
  }
}
