import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import type { Database } from "./types";

const SUPABASE_URL = "https://hnaaalewgkpqcylaaidj.supabase.co";
// Den publika nyckeln (publishable key). Den får ligga i appen: vad den släpper in styrs helt av
// databasens regler (RLS), och utloggade kommer inte åt någonting.
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_n5mlxyuWrqa9oOWNoAVtVQ_mSgDEoYK";

// SecureStore adapter — replaces localStorage used in the web version
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // must be false in React Native
    },
  }
);
