/**
 * Vakten över hela appen som märker när en utmaning blir klar — var man än är och vad som än
 * klarade den (en favorit, ett inlöst erbjudande, en lista, ett svep i Upptäck, ett besök) — och
 * spelar utmaningsögonblicket (TrophyCelebration). Ligger i rotlayouten, bredvid personalskärmen.
 *
 * Den är också den enda som sparar nyklara troféer i achievements-tabellen (datumet de klarades).
 * Varje ny trofé läggs dessutom på listan "att placera", så den får sitt placeringsögonblick nästa
 * gång Utmaningar öppnas.
 *
 * Firandet väntar medan något viktigare visas (personalskärmen för ett aktivt erbjudande,
 * incheckningens belöning — se trophyMoments). Utmaningar som incheckningens belöning redan visat
 * upplåsas där firas inte igen. Klarar man flera samtidigt spelas de efter varandra ("1 av 2").
 */
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { useAchievements } from "@/hooks/useAchievements";
import { useGrantNewTrophies, useTrophies } from "@/hooks/useTrophies";
import type { Trophy } from "@/lib/achievements";
import { addTrophiesToPlace, useTrophyMomentsHeld, wasTrophyCelebrated } from "@/lib/trophyMoments";
import { TrophyCelebration } from "./TrophyCelebration";

const TIERS = ["bronze", "silver", "gold"];

export function TrophyHost() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { trophies, isLoading } = useTrophies();
  const { isSuccess: achievementsLoaded } = useAchievements();
  const held = useTrophyMomentsHeld();
  // Bara när loggen över klarade troféer verkligen är hämtad — annars ser ALLA klara ut som nya
  const ready = !!user && !isLoading && achievementsLoaded;
  useGrantNewTrophies(trophies, ready);

  const [queue, setQueue] = useState<Trophy[]>([]);
  const [shown, setShown] = useState(0);
  // Utmaningar placerar ALLA nya troféer — har man gått dit behöver resten av kön inte spelas
  const dropRest = useRef(false);
  const seen = useRef<{ userId: string | null; keys: Set<string> }>({ userId: null, keys: new Set() });

  // Nya klara troféer (klara men inte sparade än) → kön och placeringslistan
  useEffect(() => {
    if (!ready || !user) return;
    if (seen.current.userId !== user.id) {
      seen.current = { userId: user.id, keys: new Set() };
      setQueue([]);
    }
    const fresh = trophies.filter((t) => t.done && !t.doneAt && !seen.current.keys.has(t.key));
    if (fresh.length === 0) return;
    fresh.forEach((t) => seen.current.keys.add(t.key));
    addTrophiesToPlace(user.id, fresh.map((t) => t.key));
    const order = (t: Trophy) => TIERS.indexOf(t.tier);
    setQueue((q) => [...q, ...[...fresh].sort((a, b) => order(a) - order(b))]);
  }, [trophies, ready, user]);

  // Det som redan firats i incheckningens belöning plockas bort först när ingenting håller kvar
  // firandet (belöningen markerar dem innan den släpper)
  const visible = held ? [] : queue.filter((t) => !wasTrophyCelebrated(t.key));
  const current = visible[0] ?? null;
  const total = shown + visible.length;

  const finish = () => {
    if (dropRest.current) {
      dropRest.current = false;
      setQueue([]);
      return;
    }
    setShown((n) => n + 1);
    setQueue((q) => q.filter((t) => t.key !== current?.key && !wasTrophyCelebrated(t.key)));
  };
  // När kön tömts börjar räkningen "1 av 2" om nästa gång
  useEffect(() => {
    if (queue.length === 0 && shown > 0) setShown(0);
  }, [queue.length, shown]);

  if (!current) return null;
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
