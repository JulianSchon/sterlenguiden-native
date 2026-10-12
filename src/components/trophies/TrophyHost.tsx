/**
 * Vakten över hela appen som märker när en utmaning blir klar — var man än är och vad som än
 * klarade den (en favorit, ett inlöst erbjudande, en lista, ett svep i Upptäck, ett besök) — och
 * spelar utmaningsögonblicket (TrophyCelebration). Ligger i rotlayouten, bredvid personalskärmen.
 *
 * Den är också den enda som sparar nyklara troféer i achievements-tabellen (datumet de klarades).
 * Varje ny trofé läggs dessutom på listan "att placera", så den får sitt placeringsögonblick nästa
 * gång Utmaningar öppnas.
 *
 * Det som redan var klart när appen startade (klarat förut men aldrig registrerat) firas inte —
 * man har ju inte gjort något just nu — utan placeras bara på Utmaningar nästa gång man går dit.
 * Firandet kommer heller inte i exakt samma ögonblick som datan uppdateras, utan en kort stund
 * efter, så det man gjorde (hjärtat, fliken som stängs) hinner landa först.
 *
 * Firandet väntar medan något viktigare visas (personalskärmen för ett aktivt erbjudande,
 * incheckningens belöning — se trophyMoments). Utmaningar som incheckningens belöning redan visat
 * upplåsas där firas inte igen. Klarar man flera samtidigt spelas de efter varandra ("1 av 2").
 *
 * Samma vakt firar nya profilringar (RingCelebration) — efter utmaningarna, aldrig samtidigt, så
 * två helskärmar aldrig krockar. En ring räknas som ny när regeln (antal skatter, alla
 * utmaningar) uppfylls medan appen är igång; det som redan var upplåst vid start firas inte.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { useGrantNewTrophies, useTrophies } from "@/hooks/useTrophies";
import type { Trophy } from "@/lib/achievements";
import type { AvatarRingDef } from "@/lib/avatarRings";
import { useRingUnlocks } from "@/hooks/useRingUnlocks";
import { addTrophiesToPlace, useTrophyMomentsHeld, wasTrophyCelebrated } from "@/lib/trophyMoments";
import { TrophyCelebration } from "./TrophyCelebration";
import { RingCelebration } from "./RingCelebration";

const TIERS = ["bronze", "silver", "gold"];

export function TrophyHost() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { trophies, allLoaded } = useTrophies();
  const held = useTrophyMomentsHeld();
  // Bara när allt verkligen är hämtat — annars ser klara troféer ut som nya, eller tvärtom
  const ready = !!user && allLoaded;
  useGrantNewTrophies(trophies, ready);

  const [queue, setQueue] = useState<Trophy[]>([]);
  const [shown, setShown] = useState(0);
  // Utmaningar placerar ALLA nya troféer — har man gått dit behöver resten av kön inte spelas
  const dropRest = useRef(false);
  // silent = första genomgången för kontot: det som redan var klart då firas inte
  const seen = useRef<{ userId: string | null; keys: Set<string>; silent: boolean }>({ userId: null, keys: new Set(), silent: true });

  // Nya klara troféer (klara men inte sparade än) → kön och placeringslistan
  useEffect(() => {
    if (!ready || !user) return;
    if (seen.current.userId !== user.id) {
      seen.current = { userId: user.id, keys: new Set(), silent: true };
      setQueue([]);
    }
    const silent = seen.current.silent;
    seen.current.silent = false;
    const fresh = trophies.filter((t) => t.done && !t.doneAt && !seen.current.keys.has(t.key));
    if (fresh.length === 0) return;
    fresh.forEach((t) => seen.current.keys.add(t.key));
    addTrophiesToPlace(user.id, fresh.map((t) => t.key));
    if (silent) return;
    const order = (t: Trophy) => TIERS.indexOf(t.tier);
    setQueue((q) => [...q, ...[...fresh].sort((a, b) => order(a) - order(b))]);
  }, [trophies, ready, user]);

  // Det som redan firats i incheckningens belöning plockas bort först när ingenting håller kvar
  // firandet (belöningen markerar dem innan den släpper)
  const visible = held ? [] : queue.filter((t) => !wasTrophyCelebrated(t.key));
  const current = visible[0] ?? null;
  const total = shown + visible.length;

  // En kort paus innan firandet visas
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setArmed(current.key), 650);
    return () => clearTimeout(t);
  }, [current?.key]);

  const finish = () => {
    if (dropRest.current) {
      dropRest.current = false;
      setQueue([]);
      return;
    }
    setShown((n) => n + 1);
    setQueue((q) => q.filter((t) => t.key !== current?.key && !wasTrophyCelebrated(t.key)));
  };
  // ─── Profilringar ─────────────────────────────────────────────────────────
  const rings = useRingUnlocks();
  const [ringQueue, setRingQueue] = useState<AvatarRingDef[]>([]);
  const ringSeen = useRef<{ userId: string | null; ids: Set<string>; silent: boolean }>({ userId: null, ids: new Set(), silent: true });
  const unlockedKey = rings.unlocked.map((r) => r.id).join(",");
  useEffect(() => {
    if (!user || !rings.ready) return;
    if (ringSeen.current.userId !== user.id) {
      ringSeen.current = { userId: user.id, ids: new Set(), silent: true };
      setRingQueue([]);
    }
    const silent = ringSeen.current.silent;
    ringSeen.current.silent = false;
    const fresh = rings.unlocked.filter((r) => r.rule.kind !== "free" && !ringSeen.current.ids.has(r.id));
    fresh.forEach((r) => ringSeen.current.ids.add(r.id));
    if (!silent && fresh.length > 0) setRingQueue((q) => [...q, ...fresh]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockedKey, rings.ready, user]);

  const ringCurrent = !current && !held ? ringQueue[0] ?? null : null;
  const [ringArmed, setRingArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!ringCurrent) return;
    const t = setTimeout(() => setRingArmed(ringCurrent.id), 650);
    return () => clearTimeout(t);
  }, [ringCurrent?.id]);

  // När kön tömts börjar räkningen "1 av 2" om nästa gång
  useEffect(() => {
    if (queue.length === 0 && shown > 0) setShown(0);
  }, [queue.length, shown]);

  if (!current) {
    if (!ringCurrent || ringArmed !== ringCurrent.id) return null;
    const reason = ringCurrent.rule.kind === "treasures"
      ? `Du har hittat ${ringCurrent.rule.count} av Österlens skatter.`
      : "Du har klarat alla utmaningar.";
    return (
      <RingCelebration
        key={ringCurrent.id}
        ring={ringCurrent}
        reason={reason}
        onClose={() => setRingQueue((q) => q.filter((r) => r.id !== ringCurrent.id))}
      />
    );
  }
  if (armed !== current.key) return null;
  const next = trophies.find((t) => t.groupId === current.groupId && !t.done) ?? null;

  return (
    <TrophyCelebration
      key={current.key}
      trophy={current}
      next={next}
      position={total > 1 ? { index: shown + 1, total } : null}
      onNavigate={() => {
        dropRest.current = true;
        if (pathname !== "/challenges") router.push("/challenges" as any);
      }}
      onClose={finish}
    />
  );
}
