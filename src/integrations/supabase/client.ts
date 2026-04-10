import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import type { Database } from "./types";

const SUPABASE_URL = "https://hnaaalewgkpqcylaaidj.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhuYWFhbGV3Z2twcWN5bGFhaWRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTI1ODIsImV4cCI6MjA4NTM2ODU4Mn0.sStAEXlIxK6T2CJ98N8Ki9kSyTcRZUROIoMIKWl_8zs";

// SecureStore adapter — replaces localStorage used in the web version
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // must be false in React Native
    },
  }
);
