/**
 * Sökhistoriken, som i Spotify: det man öppnat via söket (en plats, ett evenemang, en ort) och det
 * man sökt på. Senast överst, samma sak bara en gång. Sparas i telefonen per konto, så den finns
 * kvar när appen startas om men följer inte med om någon annan loggar in.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/integrations/supabase/client";

export type HistoryEntry =
  | { kind: "place"; id: number; at: number }
  | { kind: "event"; id: number; at: number }
  | { kind: "town"; name: string; at: number }
  | { kind: "term"; text: string; at: number };

type NewEntry =
  | { kind: "place"; id: number }
  | { kind: "event"; id: number }
  | { kind: "town"; name: string }
  | { kind: "term"; text: string };

const MAX = 20;

/** Samma sak (samma plats, samma sökord …) */
const keyOf = (e: NewEntry) =>
  e.kind === "town" ? `town:${e.name.toLowerCase()}`
    : e.kind === "term" ? `term:${e.text.trim().toLowerCase()}`
      : `${e.kind}:${e.id}`;

async function storageKey(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  return id ? `search-history:${id}` : null;
}

export function useSearchHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const key = await storageKey();
        keyRef.current = key;
        if (!key) return;
        const raw = await AsyncStorage.getItem(key);
        if (alive && raw) setEntries(JSON.parse(raw) as HistoryEntry[]);
      } catch {
        // Ingen historik — söket fungerar ändå
      }
    })();
    return () => { alive = false; };
  }, []);

  const persist = useCallback((next: HistoryEntry[]) => {
    if (keyRef.current) AsyncStorage.setItem(keyRef.current, JSON.stringify(next)).catch(() => {});
  }, []);

  const add = useCallback((entry: NewEntry) => {
    if (entry.kind === "term" && entry.text.trim().length < 2) return;
    setEntries((prev) => {
      const key = keyOf(entry);
      const next = [{ ...entry, at: Date.now() } as HistoryEntry, ...prev.filter((e) => keyOf(e) !== key)].slice(0, MAX);
      persist(next);
      return next;
    });
  }, [persist]);

  const remove = useCallback((entry: HistoryEntry) => {
    setEntries((prev) => {
      const key = keyOf(entry);
      const next = prev.filter((e) => keyOf(e) !== key);
      persist(next);
      return next;
    });
  }, [persist]);

  const clear = useCallback(() => {
    setEntries([]);
    persist([]);
  }, [persist]);

  return { entries, add, remove, clear };
}
