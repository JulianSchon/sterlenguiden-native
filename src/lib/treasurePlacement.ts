/**
 * Skatter som väntar på sitt inklistringsögonblick i samlingen på Mitt Österlen. Läggs till när en
 * skatt hittas (TreasureReveal) och tas bort när den klistrats in (StickersSection). Sparas på
 * telefonen per konto, så det överlever en omstart — samma princip som troféernas placering.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { signedInUser } from "@/lib/session";

const key = (userId: string) => `treasures-to-place:v1:${userId}`;

export async function getTreasuresToPlace(userId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Hämtar själv vem som är inloggad — anroparen kan ha ett useAuth-värde som inte hunnit laddas
 * (då sparades tidigare ingenting, och samlingen hade inget att klistra in). */
export async function addTreasureToPlace(collectibleId: string): Promise<void> {
  const user = await signedInUser();
  if (!user) return;
  const userId = user.id;
  const current = await getTreasuresToPlace(userId);
  if (current.includes(collectibleId)) return;
  await AsyncStorage.setItem(key(userId), JSON.stringify([...current, collectibleId])).catch(() => {});
}

export async function removeTreasureToPlace(userId: string, collectibleId: string): Promise<void> {
  const current = await getTreasuresToPlace(userId);
  await AsyncStorage.setItem(key(userId), JSON.stringify(current.filter((id) => id !== collectibleId))).catch(() => {});
}
