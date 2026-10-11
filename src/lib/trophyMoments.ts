/**
 * Samordningen kring utmaningsögonblicket (TrophyHost), så det aldrig krockar med annat:
 *
 *  - "Håll": medan något viktigare visas väntar firandet — personalskärmen för ett aktivt
 *    erbjudande (den får ALDRIG avbrytas) och incheckningens belöning. holdTrophyMoments()
 *    returnerar en funktion som släpper hållet; firandet spelas när inget håller längre.
 *  - "Redan firad": utmaningar som incheckningens belöning redan visat upplåsas där, och ska
 *    inte firas en gång till.
 *  - "Att placera": varje ny trofé ska få sitt placeringsögonblick på Utmaningar nästa gång sidan
 *    öppnas. Sparas på telefonen (per konto), så det överlever en omstart.
 */
import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

let holds = 0;
const celebrated = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function holdTrophyMoments(): () => void {
  holds += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    emit();
  };
}

export function useTrophyMomentsHeld(): boolean {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => holds > 0,
  );
}

export function markTrophiesCelebrated(keys: string[]): void {
  keys.forEach((k) => celebrated.add(k));
}

export function wasTrophyCelebrated(key: string): boolean {
  return celebrated.has(key);
}

// ─── Troféer som väntar på sin placering på Utmaningar ─────────────────────────
const placeKey = (userId: string) => `trophies-to-place:v1:${userId}`;

export async function getTrophiesToPlace(userId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(placeKey(userId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export async function addTrophiesToPlace(userId: string, keys: string[]): Promise<void> {
  const current = await getTrophiesToPlace(userId);
  const next = [...new Set([...current, ...keys])];
  await AsyncStorage.setItem(placeKey(userId), JSON.stringify(next)).catch(() => {});
}

export async function removeTrophyToPlace(userId: string, key: string): Promise<void> {
  const current = await getTrophiesToPlace(userId);
  await AsyncStorage.setItem(placeKey(userId), JSON.stringify(current.filter((k) => k !== key))).catch(() => {});
}
