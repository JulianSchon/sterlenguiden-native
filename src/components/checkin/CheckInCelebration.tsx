/**
 * Hela belöningen efter en incheckning, i EN sammanhängande vy (inte flera rutor efter varandra):
 *
 *  1. StampScene — platsens kort och passtämpeln (första besöket) / "Välkommen tillbaka".
 *  2. ProgressScene — vad besöket förde med sig: siffran som rullar upp, utmaningarnas staplar
 *     som fylls och klättringen i månadens topplista.
 *  3. Avslut — "Skapa minne" (huvudknappen) eller "Klar", plus ett tips om platsen har
 *     erbjudanden.
 *
 * Inget går vidare av sig självt — när ett steg spelats klart kommer en knapp, och användaren
 * bestämmer tempot (som Duolingo). Ett tryck under en animation spolar fram den. Bakgrunden —
 * mörkret, guldglöden och den roterande strålkransen — lever kvar genom båda stegen, så
 * övergången mellan dem blir mjuk. Ett återbesök som inte flyttade något går direkt till avslutet.
 */
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Reanimated, {
  Easing, FadeIn, FadeOutUp, useAnimatedStyle, useSharedValue, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react-native";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import type { Place } from "@/hooks/usePlaces";
import { useVisits } from "@/hooks/useVisits";
import { useOffers } from "@/hooks/useOffers";
import { useTrophies } from "@/hooks/useTrophies";
import { fetchMyMonthlyVisits } from "@/hooks/useLeaderboard";
import type { Trophy } from "@/lib/achievements";
import { RadialGlow } from "@/components/trophies/TrophyMedal";
import { PressableScale } from "@/components/PressableScale";
import { GOLD, GhostButton, GoldButton, GoldRays, Reveal } from "./CelebrationFx";
import { StampScene } from "./StampScene";
import { ProgressScene, type MonthStat, type ProgressItem } from "./ProgressScene";

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
  /** Min månadssiffra/placering före besöket (hämtas redan medan man håller knappen) */
  monthBefore: Promise<MonthStat | null> | null;
  visitId: string | null;
}

// Utforskaren först (den alla rör sig i), sedan resten
const GROUP_PRIORITY = ["utforskaren", "kom-igang", "mangsidig", "osterlenlegend"];

/** Utmaningarna som besöket flyttade: per grupp den nivå man jobbade mot (den lägsta som inte
 * var klar före besöket) — inte alla nivåer, annars visas Utforskaren silver OCH guld för samma
 * besök. */
function visitProgressItems(before: Trophy[], after: Trophy[]): ProgressItem[] {
  const afterByKey = new Map(after.map((t) => [t.key, t]));
  const items: ProgressItem[] = [];
  for (const groupId of [...new Set(before.map((t) => t.groupId))]) {
    const current = before.find((t) => t.groupId === groupId && !t.done);
    const now = current && afterByKey.get(current.key);
    if (!current || !now || now.progress <= current.progress) continue;
    items.push({ key: current.key, trophy: now, from: current.progress, to: now.progress, target: now.target, unlocked: now.done });
  }
  const rank = (id: string) => (GROUP_PRIORITY.indexOf(id) + 1 || 99);
  return items.sort((a, b) => rank(a.trophy.groupId) - rank(b.trophy.groupId));
}

export function CheckInCelebration({
  place, state, onClose,
}: {
  place: Place;
  state: CelebrationState;
  /** "memory" = Skapa minne, "offers" = erbjudandetipset */
  onClose: (next?: "memory" | "offers") => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { trophies, stats } = useTrophies();
  const { data: visits = [] } = useVisits();
  const { data: offers = [] } = useOffers(place.id);

  const [step, setStep] = useState<"stamp" | "progress">("stamp");
  const [ready, setReady] = useState(false);
  const [skip, setSkip] = useState(false);
  // undefined = månadssiffrorna är inte hämtade än
  const [month, setMonth] = useState<{ before: MonthStat | null; after: MonthStat | null }>();
  const [advancing, setAdvancing] = useState(false);
  const monthName = format(new Date(), "LLLL", { locale: sv });

  const backdrop = useSharedValue(0);
  const glow = useSharedValue(0);
  const rays = useSharedValue(0);

  useEffect(() => {
    backdrop.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // När besöket är bekräftat: hämta månadssiffran efteråt (före-siffran hämtades redan medan man
  // höll knappen), och uppdatera topplistorna överallt. Högst 3 s väntan — svarar inte servern
  // visas belöningen ändå, bara utan topplisteraden.
  useEffect(() => {
    if (state.status !== "done") return;
    queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    let alive = true;
    const atMost = <T,>(p: Promise<T | null>) =>
      Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
    Promise.all([atMost(state.monthBefore ?? Promise.resolve(null)), atMost(fetchMyMonthlyVisits())])
      .then(([before, after]) => { if (alive) setMonth({ before, after }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  const monthBefore = month?.before ?? null;
  const monthAfter = month?.after ?? null;
  const monthChanged = !!monthAfter && (monthBefore == null || monthAfter.value !== monthBefore.value);
  const hasProgress = state.firstVisit || monthChanged;

  // Progressens innehåll låses första gången steget visas — så inget hoppar om datan uppdateras
  // igen mitt i animationen (t.ex. när en ny trofé sparas)
  const frozen = useRef<{ hero: { from: number; to: number } | null; items: ProgressItem[]; month: { before: MonthStat | null; after: MonthStat } | null } | null>(null);
  if (step === "progress" && !frozen.current) {
    const after = stats.uniqueVisits > state.uniqueBefore ? stats.uniqueVisits : state.uniqueBefore + 1;
    frozen.current = {
      hero: state.firstVisit ? { from: state.uniqueBefore, to: after } : null,
      items: state.firstVisit ? visitProgressItems(state.trophiesBefore, trophies) : [],
      month: monthAfter && monthChanged ? { before: monthBefore, after: monthAfter } : null,
    };
  }

  async function goToProgress() {
    if (advancing) return;
    setAdvancing(true);
    // Se till att besöket finns i datan innan staplarna räknas ut (brukar redan ha hunnit)
    if (state.visitId && !visits.some((v) => v.id === state.visitId)) {
      await queryClient.refetchQueries({ queryKey: ["visits"] }).catch(() => {});
    }
    setReady(false);
    setSkip(false);
    setStep("progress");
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
  // Knapparna väntar också på månadssiffrorna — annars kan "Klar" hinna visas och sen bytas mot
  // "Fortsätt" när det visar sig att besöket flyttade en i topplistan
  const buttonsReady = ready && (step === "progress" || month !== undefined);
  const showFinal = buttonsReady && (step === "progress" || !hasProgress);

  const buttons = (() => {
    if (!buttonsReady) return null;
    if (!showFinal) {
      return (
        <Reveal show>
          <GoldButton label="Fortsätt" onPress={goToProgress} />
        </Reveal>
      );
    }
    return (
      <>
        {offers.length > 0 && (
          <Reveal show delay={0}>
            <PressableScale style={s.offer} scale={0.98} onPress={() => onClose("offers")}>
              <Text style={s.offerText}>
                {offers.length === 1 ? "Platsen har 1 aktivt erbjudande" : `Platsen har ${offers.length} aktiva erbjudanden`}
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

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => onClose()}>
      <View style={s.root}>
        <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]} />

        {/* Ljuset bakom: guldglöd + roterande strålkrans, lever kvar genom båda stegen */}
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
          {step === "stamp" ? (
            <Reanimated.View key="stamp" style={s.stage} exiting={FadeOutUp.duration(320)}>
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
          ) : (
            <Reanimated.View key="progress" style={s.stage} entering={FadeIn.delay(220).duration(420)}>
              <ProgressScene
                hero={frozen.current?.hero ?? null}
                items={frozen.current?.items ?? []}
                month={frozen.current?.month ?? null}
                monthName={monthName}
                skip={skip}
                onReady={() => setReady(true)}
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
