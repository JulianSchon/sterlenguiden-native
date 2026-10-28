import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Den inloggade användaren, ur sessionen som redan finns i telefonen. Ingen fråga till servern
 * (snabbare, och fungerar utan nät) — servern kontrollerar ändå inloggningen vid varje anrop.
 */
export async function signedInUser(): Promise<User | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

/** Den inloggades id, eller ett fel om ingen är inloggad (för det som bara går att göra inloggad) */
export async function requireUserId(): Promise<string> {
  const user = await signedInUser();
  if (!user) throw new Error("not_authenticated");
  return user.id;
}
