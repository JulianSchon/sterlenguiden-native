/**
 * Hela belöningen efter en incheckning, i EN sammanhängande vy, ett steg i taget. Inget går
 * vidare av sig självt — användaren bestämmer tempot med "Fortsätt", som i Duolingo:
 *
 *  1. Stämpeln — platsens kort och passtämpeln (första besöket) / "Välkommen tillbaka".
 *  2. Ditt besök — antalet upptäckta platser rullar upp, kategorin och utmaningarna fylls
 *     (bara när besöket var en ny plats).
 *  3. Topplistan — klättringen i månadens topplista (bara för den som syns i topplistorna, och
 *     när besöket ändrade månadens siffra).
 *  4. Vart härnäst? — de närmaste platserna man inte besökt än, och "Skapa minne" / "Klar".
 *
 * Steg som inte har något att visa hoppas över. Ett tryck under en animation spolar fram den.
 * Bakgrunden — mörkret, guldglöden och den roterande strålkransen — lever kvar genom alla steg,
 * så övergångarna blir mjuka.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Reanimated, {
  Easing, FadeIn, FadeOutUp, useAnimatedStyle, useSharedValue, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react-native";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { isPlaceOpen, usePlaces, type Place } from "@/hooks/usePlaces";
import { useVisits } from "@/hooks/useVisits";
import { useOffers } from "@/hooks/useOffers";
import { useTrophies } from "@/hooks/useTrophies";
import { fetchMonthRows, fetchMyMonthStanding, type LeaderboardEntry } from "@/hooks/useLeaderboard";
import type { Trophy } from "@/lib/achievements";
import { placeMatchesCategory, primaryStatCategory } from "@/lib/categories";
import { distanceMeters } from "@/lib/checkin";
import { RadialGlow } from "@/components/trophies/TrophyMedal";
import { PressableScale } from "@/components/PressableScale";
import { GOLD, GhostButton, GoldButton, GoldRays, Reveal } from "./CelebrationFx";
import { StampScene } from "./StampScene";
import { ProgressScene, type CategoryProgress, type HeroProgress, type ProgressItem } from "./ProgressScene";
import { ClimbScene, MAX_PASSED, type ClimbData } from "./ClimbScene";
import { NextStopScene, type NextStop } from "./NextStopScene";

export interface CelebrationState {
  /** "pending" medan servern bekräftar — kortet hinner resa sig under tiden */
  status: "pending" | "done";
  firstVisit: boolean;
  /** Vilket besök i ordningen på den här platsen (1 = första) */
  visitNumber: number;
  /** Förra besöket på platsen, för "Senast här …" */
  lastVisitAt: string | null;
  /** Troféernas läge FÖRE besöket — jämförs med läget efter för att se vad som rörde sig */
  trophiesBefore: Trophy[];
  uniqueBefore: number;
  /** Min rad i månadens topplista före besöket (hämtas redan medan man håller knappen) */
  monthBefore: Promise<LeaderboardEntry | null> | null;
  visitId: string | null;
}

/** Vart användaren ville gå när belöningen stängdes */
export type CelebrationExit = "memory" | "offers" | { placeId: number };

type Step = "stamp" | "progress" | "climb" | "next";

// Utforskaren först (den alla rör sig i), sedan resten
const GROUP_PRIORITY = ["utforskaren", "kom-igang", "mangsidig", "osterlenlegend"];
const MAX_TROPHY_ROWS = 2;

/** Utmaningarna som besöket flyttade: per grupp den nivå man jobbade mot (den lägsta som inte
 * var klar före besöket) — inte alla nivåer, annars visas Utforskaren silver OCH guld för samma
 * besök. Högst två: de som låstes upp går alltid med, och spelas sist (crescendot). */
function visitProgressItems(before: Trophy[], after: Trophy[]): ProgressItem[] {
  const afterByKey = new Map(after.map((t) => [t.key, t]));
  const items: ProgressItem[] = [];
  for (const groupId of [...new Set(before.map((t) => t.groupId))]) {
    const current = before.find((t) => t.groupId === groupId && !t.done);
    const now = current && afterByKey.get(current.key);
    if (!current || !now || now.progress <= current.progress) continue;
    const next = now.done ? after.find((t) => t.groupId === groupId && !t.done) : undefined;
    items.push({
      key: current.key,
      trophy: now,
      from: current.progress,
      to: now.progress,
      target: now.target,
      unlocked: now.done,
      next: next ? { levelLabel: next.levelLabel, requirementText: next.requirementText } : null,
    });
  }
  const rank = (id: string) => GROUP_PRIORITY.indexOf(id) + 1 || 99;
  return items
    .sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || rank(a.trophy.groupId) - rank(b.trophy.groupId))
    .slice(0, MAX_TROPHY_ROWS)
    .sort((a, b) => Number(a.unlocked) - Number(b.unlocked) || rank(a.trophy.groupId) - rank(b.trophy.groupId));
}

// Högst så här länge väntar belöningen på topplistan — svarar inte servern visas resten ändå
const atMost = <T,>(p: Promise<T | null>, ms = 3000) =>
  Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

export function CheckInCelebration({
  place, state, onClose,
}: {
  place: Place;
  state: CelebrationState;
  onClose: (exit?: CelebrationExit) => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { trophies } = useTrophies();
  const { data: visits = [] } = useVisits();
  const { data: places = [] } = usePlaces();
  // Alla aktiva erbjudanden: tipset om den här platsen, och "Erbjudande" på nästa stopp
  const { data: offers = [] } = useOffers();
  const placeOffers = offers.filter((o) => o.place_id === place.id);

  const [step, setStep] = useState<Step>("stamp");
  const [ready, setReady] = useState(false);
  const [skip, setSkip] = useState(false);
  // undefined = topplistan är inte hämtad än
  const [month, setMonth] = useState<{ before: LeaderboardEntry | null; after: LeaderboardEntry | null; rows: LeaderboardEntry[] }>();
  const [advancing, setAdvancing] = useState(false);
  const monthName = format(new Date(), "LLLL", { locale: sv });

  const backdrop = useSharedValue(0);
  const glow = useSharedValue(0);
  const rays = useSharedValue(0);

  useEffect(() => {
    backdrop.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // När besöket är bekräftat: min rad i månadens topplista efteråt (raden före hämtades redan
  // medan man höll knappen), och har jag klättrat även grannarna runt mig. Uppdaterar också
  // topplistorna överallt i appen.
  useEffect(() => {
    if (state.status !== "done") return;
    queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    let alive = true;
    (async () => {
      const [before, after] = await Promise.all([
        atMost(state.monthBefore ?? Promise.resolve(null)),
        atMost(fetchMyMonthStanding()),
      ]);
      let rows: LeaderboardEntry[] = [];
      if (before && after?.rowPos != null && after.value !== before.value) {
        const passed = before.rowPos != null ? Math.max(0, before.rowPos - after.rowPos) : MAX_PASSED;
        const first = Math.max(1, after.rowPos - 1);
        const last = after.rowPos + Math.max(1, Math.min(passed, MAX_PASSED));
        rows = (await atMost(fetchMonthRows(first, last - first + 1))) ?? [];
      }
      if (alive) setMonth({ before, after, rows });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  // Klättringen visas bara när jag syns i topplistan, siffran ändrades och min rad kom med
  const climb = useMemo((): ClimbData | null => {
    const before = month?.before;
    const after = month?.after;
    if (!before || !after || after.placement == null || after.rowPos == null || after.value === before.value) return null;
    if (!month.rows.some((r) => r.userId === after.userId)) return null;
    return { before, after, rows: month.rows };
  }, [month]);

  const nextStops = useMemo((): NextStop[] => {
    if (place.lat == null || place.lng == null) return [];
    const visited = new Set(visits.map((v) => v.place_id));
    const withOffers = new Set(offers.map((o) => o.place_id));
    return places
      .filter((p) => p.id !== place.id && p.lat != null && p.lng != null && p.checkin_enabled !== false && !visited.has(p.id))
      .map((p) => ({ p, d: distanceMeters(place.lat!, place.lng!, p.lat!, p.lng!) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map(({ p, d }) => ({
        place: p,
        distanceM: d,
        hasOffer: withOffers.has(p.id),
        openNow: isPlaceOpen(p.opening_hours as Record<string, string> | null),
        categoryLabel: primaryStatCategory(p)?.label ?? null,
      }));
  }, [places, visits, offers, place]);

  // Stegen bestäms när man lämnar stämpeln och låses sen, så inget hoppar mitt i
  const flow = useRef<Step[] | null>(null);
  const steps: Step[] = flow.current ?? [
    "stamp",
    ...(state.firstVisit ? (["progress"] as const) : []),
    ...(climb ? (["climb"] as const) : []),
    ...(nextStops.length > 0 ? (["next"] as const) : []),
  ];
  const isLast = steps.indexOf(step) === steps.length - 1;

  // Varje stegs innehåll låses första gången steget visas — så inget hoppar om datan uppdateras
  // igen mitt i animationen (t.ex. när en ny trofé sparas)
  const frozen = useRef<{
    progress?: { hero: HeroProgress; category: CategoryProgress | null; items: ProgressItem[] };
    next?: NextStop[];
  }>({});
  if (step === "progress" && !frozen.current.progress) {
    const cat = primaryStatCategory(place);
    let category: CategoryProgress | null = null;
    if (cat) {
      const byId = new Map(places.map((p) => [p.id, p]));
      const inCat = (id: number) => {
        const p = byId.get(id);
        return !!p && placeMatchesCategory(p, cat.dbValues);
      };
      const before = new Set(visits.map((v) => v.place_id).filter((id) => id !== place.id && inCat(id))).size;
      const total = places.filter((p) => placeMatchesCategory(p, cat.dbValues)).length;
      if (total > 0) category = { label: cat.label, color: cat.color, Icon: cat.Icon, from: before, to: before + 1, total };
    }
    frozen.current.progress = {
      hero: { from: state.uniqueBefore, to: state.uniqueBefore + 1, total: places.length },
      category,
      items: visitProgressItems(state.trophiesBefore, trophies),
    };
  }
  if (step === "next" && !frozen.current.next) frozen.current.next = nextStops;

  async function goNext() {
    if (advancing) return;
    flow.current = steps;
    const nextStep = steps[steps.indexOf(step) + 1];
    if (!nextStep) return;
    setAdvancing(true);
    // Se till att besöket finns i datan innan staplarna räknas ut (brukar redan ha hunnit)
    if (nextStep === "progress" && state.visitId && !visits.some((v) => v.id === state.visitId)) {
      await queryClient.refetchQueries({ queryKey: ["visits"] }).catch(() => {});
    }
    setReady(false);
    setSkip(false);
    setStep(nextStep);
    setAdvancing(false);
  }

  const tapToSkip = () => {
    if (ready) return;
    if (step === "stamp" && state.status !== "done") return;
    setSkip(true);
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const glowSize = width * 1.25;
  const raysSize = width * 1.9;
  const lightY = height * 0.42;
  // På stämpeln väntar knapparna också på topplistan — den avgör vilka steg som kommer
  const buttonsReady = ready && (step !== "stamp" || month !== undefined);

  const buttons = (() => {
    if (!buttonsReady) return null;
    if (!isLast) {
      return (
        <Reveal show>
          <GoldButton label="Fortsätt" onPress={goNext} />
        </Reveal>
      );
    }
    return (
      <>
        {placeOffers.length > 0 && (
          <Reveal show delay={0}>
            <PressableScale style={s.offer} scale={0.98} onPress={() => onClose("offers")}>
              <Text style={s.offerText}>
                {placeOffers.length === 1 ? "Platsen har 1 aktivt erbjudande" : `Platsen har ${placeOffers.length} aktiva erbjudanden`}
              </Text>
              <ChevronRight size={18} color={GOLD} strokeWidth={2} />
            </PressableScale>
          </Reveal>
        )}
        <Reveal show delay={80}>
          <GoldButton label="Skapa minne" onPress={() => onClose("memory")} />
        </Reveal>
        <Reveal show delay={180}>
          <GhostButton label="Klar" onPress={() => onClose()} />
        </Reveal>
      </>
    );
  })();

  const enter = FadeIn.delay(220).duration(420);
  const exit = FadeOutUp.duration(320);
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => onClose()}>
      <View style={s.root}>
        <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]} />

        {/* Ljuset bakom: guldglöd + roterande strålkrans, lever kvar genom alla steg */}
        <View style={[s.lightAnchor, { top: lightY - raysSize / 2, left: (width - raysSize) / 2, width: raysSize, height: raysSize }]} pointerEvents="none">
          <GoldRays size={raysSize} visible={rays} />
        </View>
        <Reanimated.View
          style={[s.lightAnchor, { top: lightY - glowSize / 2, left: (width - glowSize) / 2, width: glowSize, height: glowSize }, glowStyle]}
          pointerEvents="none"
        >
          <RadialGlow size={glowSize} color={GOLD} opacity={0.32} radiusRatio={0.55} />
        </Reanimated.View>

        <Pressable style={[s.stage, { paddingTop: insets.top }]} onPress={tapToSkip}>
          {step === "stamp" && (
            <Reanimated.View key="stamp" style={s.stage} exiting={exit}>
              <StampScene
                place={place}
                firstVisit={state.firstVisit}
                visitNumber={state.visitNumber}
                lastVisitAt={state.lastVisitAt}
                done={state.status === "done"}
                skip={skip}
                rays={rays}
                glow={glow}
                onReady={() => setReady(true)}
              />
            </Reanimated.View>
          )}
          {step === "progress" && frozen.current.progress && (
            <Reanimated.View key="progress" style={s.stage} entering={enter} exiting={exit}>
              <ProgressScene
                hero={frozen.current.progress.hero}
                category={frozen.current.progress.category}
                items={frozen.current.progress.items}
                skip={skip}
                onReady={() => setReady(true)}
              />
            </Reanimated.View>
          )}
          {step === "climb" && climb && (
            <Reanimated.View key="climb" style={s.stage} entering={enter} exiting={exit}>
              <ClimbScene data={climb} monthName={monthName} skip={skip} onReady={() => setReady(true)} />
            </Reanimated.View>
          )}
          {step === "next" && frozen.current.next && (
            <Reanimated.View key="next" style={s.stage} entering={enter}>
              <NextStopScene
                stops={frozen.current.next}
                skip={skip}
                onReady={() => setReady(true)}
                onOpen={(placeId) => onClose({ placeId })}
              />
            </Reanimated.View>
          )}
        </Pressable>

        {/* Fast höjd så scenen inte hoppar när knapparna dyker upp */}
        <View style={[s.buttons, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>{buttons}</View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: "#0B0A08" },
  lightAnchor: { position: "absolute", alignItems: "center", justifyContent: "center" },
  stage: { flex: 1 },
  buttons: { paddingHorizontal: 20, gap: 10, minHeight: 140, justifyContent: "flex-end" },
  offer: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14,
    backgroundColor: "rgba(233,196,106,0.10)", borderWidth: 1, borderColor: "rgba(233,196,106,0.35)",
  },
  offerText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: GOLD },
});
