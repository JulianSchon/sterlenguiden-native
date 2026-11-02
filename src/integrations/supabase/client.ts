import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import type { Database } from "./types";

const SUPABASE_URL = "https://hnaaalewgkpqcylaaidj.supabase.co";
// Den publika nyckeln (publishable key). Den får ligga i appen: vad den släpper in styrs helt av
// databasens regler (RLS), och utloggade kommer inte åt någonting.
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_n5mlxyuWrqa9oOWNoAVtVQ_mSgDEoYK";

/**
 * Inloggningen sparas i telefonens säkra lagring (SecureStore). Den klarar bara 2 048 tecken per
 * värde och inloggningen är större, så den delas upp i bitar: "<nyckel>.0", "<nyckel>.1" … och
 * antalet i "<nyckel>.n". En inloggning sparad på det gamla sättet (i ett stycke) läses fortfarande.
 */
const CHUNK = 1800;

const ChunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const count = await SecureStore.getItemAsync(`${key}.n`);
    if (count === null) return SecureStore.getItemAsync(key);
    const parts = await Promise.all(
      Array.from({ length: Number(count) }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)),
    );
    return parts.some((p) => p === null) ? null : parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    const old = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
    const count = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await SecureStore.setItemAsync(`${key}.n`, String(count));
    for (let i = count; i < old; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(key);
  },
  async removeItem(key: string): Promise<void> {
    const count = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: ChunkedSecureStore,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // must be false in React Native
    },
  }
);

// Inloggningen förnyas medan appen är öppen och vilar när den ligger i bakgrunden (Supabases råd för
// mobilappar). Kommer man tillbaka efter en lång paus förnyas den direkt — och har kontot loggats ut
// någon annanstans märks det på en gång, i stället för vid nästa kontroll.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
