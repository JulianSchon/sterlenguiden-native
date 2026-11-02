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
function stopRetrying() {
  if (timer) { clearInterval(timer); timer = null; }
}

/**
 * Kön läses och skrivs en gång i taget. Det tar en stund (telefonens lagring), och två ändringar
 * samtidigt — ett hjärta medan kön skickas — skrev annars över varandra, så det senaste man gjort
 * kunde försvinna.
 */
let lock: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn);
  lock = run.catch(() => {});
  return run;
}
function changeQueue(change: (items: Stored[]) => Stored[]): Promise<Stored[]> {
  return locked(async () => {
    const before = await read();
    const after = change(before);
    if (after !== before) await write(after);
    return after;
  });
}

const sameOp = (a: OutboxOp, b: OutboxOp) =>
  a.kind === b.kind && a.id === b.id && ("save" in a ? "save" in b && a.save === b.save : true);

/** Det senaste man gjort med varje sak, så ett äldre försök som misslyckas aldrig ersätter ett nyare */
const latest = new Map<string, number>();
let turns = 0;

/**
 * Spara nu, eller lägg i kön om nätet saknas. Kastar bara om servern säger nej (då ska knappen
 * gå tillbaka), aldrig för ett nätfel.
 */
export async function sendOrQueue(op: OutboxOp): Promise<void> {
  const user = await signedInUser();
  if (!user) throw new Error("not_authenticated");
  const key = keyOf(op);
  const entry: Stored = { userId: user.id, key, op };
  const isSame = (i: Stored) => i.userId === user.id && i.key === key;
  const turn = ++turns;
  latest.set(`${user.id}:${key}`, turn);
  // Något äldre om samma sak väntar redan: det här ersätter det, och skickas i ordning med kön
  let queued = false;
  const items = await changeQueue((list) => {
    if (!list.some(isSame)) return list;
    queued = true;
    return [...list.filter((i) => !isSame(i)), entry];
  });
  if (queued) {
    flushOutbox();
    retryLater();
    return;
  }
  try {
    await send(user.id, op);
    if (items.length > 0) flushOutbox();
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    // Har man hunnit göra något nyare med samma sak gäller det i stället
    if (latest.get(`${user.id}:${key}`) !== turn) return;
    await changeQueue((list) => [...list.filter((i) => !isSame(i)), entry]);
    retryLater();
  }
}

let flushing = false;
/** Skicka det som väntar (för kontot som är inloggat). Stannar vid första nätfelet */
async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  let again = false;
  try {
    const user = await signedInUser();
    const items = await read();
    if (!user || items.length === 0) {
      if (items.length === 0) stopRetrying();
      return;
    }
    const sent: Stored[] = [];
    let offline = false;
    for (const item of items.filter((i) => i.userId === user.id)) {
      try {
        await send(user.id, item.op);
      } catch (e) {
        if (isNetworkError(e)) { offline = true; break; }
        // Servern sa nej (t.ex. platsen finns inte längre): släpps, försöks inte igen
      }
      sent.push(item);
    }
    // Bara det som skickades tas bort. Det man gjort under tiden (ett nytt hjärta, eller samma sak
    // ändrad igen) ligger kvar och skickas nästa gång
    const left = await changeQueue((list) => {
      const rest = list.filter((i) => !sent.some((s) => s.userId === i.userId && s.key === i.key && sameOp(s.op, i.op)));
      return rest.length === list.length ? list : rest;
    });
    new Set(sent.map((s) => AFFECTS[s.op.kind])).forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    if (!left.some((i) => i.userId === user.id)) stopRetrying();
    // Något lades till medan kön skickades: det skickas direkt (utan nät försöks det igen om en stund)
    else if (!offline) again = true;
  } finally {
    flushing = false;
  }
  if (again) flushOutbox();
}

/** Startas en gång när appen startar */
export function startOutbox(): () => void {
  flushOutbox();
  const sub = AppState.addEventListener("change", (state) => { if (state === "active") flushOutbox(); });
  return () => sub.remove();
}

/** Utloggning: det som väntade hör till kontot som loggade ut */
export async function clearOutbox(): Promise<void> {
  stopRetrying();
  latest.clear();
  await locked(() => AsyncStorage.removeItem(STORAGE_KEY)).catch(() => {});
}
