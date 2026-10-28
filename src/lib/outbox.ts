/**
 * Små saker man gör utan nät — hjärtan på platser och evenemang, svep i Upptäck — sparas i en kö i
 * telefonen och skickas när nätet är tillbaka (som i Instagram), i stället för att hjärtat hoppar
 * tillbaka. Det senaste man gjorde gäller: hjärta och sen av-hjärta utan nät blir av-hjärtat.
 *
 * Kön skickas när appen startar, när den kommer tillbaka från bakgrunden och var 20:e sekund så
 * länge något väntar. Den hör till kontot och töms när man loggar ut.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";
import { isNetworkError } from "@/lib/network";
import { signedInUser } from "@/lib/session";

export type OutboxOp =
  | { kind: "favorite-place"; id: number; save: boolean }
  | { kind: "favorite-event"; id: number; save: boolean }
  | { kind: "discover-like"; id: number }
  | { kind: "discover-dismiss"; id: number };

interface Stored { userId: string; key: string; op: OutboxOp }

const STORAGE_KEY = "outbox:v1";
const keyOf = (op: OutboxOp) => `${op.kind}:${op.id}`;
// Det som påverkas när kön skickats
const AFFECTS: Record<OutboxOp["kind"], string> = {
  "favorite-place": "favorites", "favorite-event": "favorites",
  "discover-like": "discovery_likes", "discover-dismiss": "discovery_dismissals",
};

async function read(): Promise<Stored[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored[]) : [];
  } catch {
    return [];
  }
}
async function write(items: Stored[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
}

/** Själva sparandet. Kastar felet (ett nätfel betyder: försök igen senare) */
async function send(userId: string, op: OutboxOp): Promise<void> {
  const ok = (error: { code?: string } | null) => {
    // Redan sparat (t.ex. två försök) räknas som klart
    if (error && error.code !== "23505") throw error;
  };
  switch (op.kind) {
    case "favorite-place":
    case "favorite-event": {
      const column = op.kind === "favorite-place" ? "place_id" : "event_id";
      if (op.save) {
        const row = op.kind === "favorite-place"
          ? { user_id: userId, place_id: op.id, event_id: null }
          : { user_id: userId, event_id: op.id, place_id: null };
        ok((await supabase.from("favorites").insert(row)).error);
      } else {
        ok((await supabase.from("favorites").delete().eq("user_id", userId).eq(column, op.id)).error);
      }
      return;
    }
    case "discover-like":
      ok((await supabase.from("discovery_likes").insert({ user_id: userId, place_id: op.id })).error);
      return;
    case "discover-dismiss":
      ok((await supabase.from("discovery_dismissals").insert({ user_id: userId, place_id: op.id })).error);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
function retryLater() {
  if (!timer) timer = setInterval(() => { flushOutbox(); }, 20_000);
}

/**
 * Spara nu, eller lägg i kön om nätet saknas. Kastar bara om servern säger nej (då ska knappen
 * gå tillbaka), aldrig för ett nätfel.
 */
export async function sendOrQueue(op: OutboxOp): Promise<void> {
  const user = await signedInUser();
  if (!user) throw new Error("not_authenticated");
  const items = await read();
  const key = keyOf(op);
  // Något äldre om samma sak väntar redan: det här ersätter det, och skickas i ordning med kön
  if (items.some((i) => i.key === key && i.userId === user.id)) {
    await write([...items.filter((i) => i.key !== key), { userId: user.id, key, op }]);
    flushOutbox();
    retryLater();
    return;
  }
  try {
    await send(user.id, op);
    if (items.length > 0) flushOutbox();
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    await write([...items, { userId: user.id, key, op }]);
    retryLater();
  }
}

let flushing = false;
/** Skicka det som väntar (för kontot som är inloggat). Stannar vid första nätfelet */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const user = await signedInUser();
    let items = await read();
    if (!user || items.length === 0) {
      if (items.length === 0 && timer) { clearInterval(timer); timer = null; }
      return;
    }
    const touched = new Set<string>();
    for (const item of items.filter((i) => i.userId === user.id)) {
      try {
        await send(user.id, item.op);
      } catch (e) {
        if (isNetworkError(e)) break;
        // Servern sa nej (t.ex. platsen finns inte längre): släpps, försöks inte igen
      }
      items = items.filter((i) => i.key !== item.key || i.userId !== user.id);
      touched.add(AFFECTS[item.op.kind]);
    }
    await write(items);
    touched.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    if (items.length === 0 && timer) { clearInterval(timer); timer = null; }
  } finally {
    flushing = false;
  }
}

/** Startas en gång när appen startar */
export function startOutbox(): () => void {
  flushOutbox();
  const sub = AppState.addEventListener("change", (state) => { if (state === "active") flushOutbox(); });
  return () => sub.remove();
}

/** Utloggning: det som väntade hör till kontot som loggade ut */
export async function clearOutbox(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  if (timer) { clearInterval(timer); timer = null; }
}
