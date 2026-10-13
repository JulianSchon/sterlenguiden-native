/**
 * Utmaningar — troféraster, inga flikar.
 *
 * 7 grupper × brons/silver/guld = 21 troféer, med FASTA mål kopplade till
 * saker man gör i appen (besöka, favoritmarkera, lösa in förmåner, svepa
 * i Upptäck) — inte platskategorierna. Se src/lib/achievements.ts för hela
 * listan och resonemanget bakom varje grupp/tal.
 *
 * - Ingen Alla/Pågående/Troférum-flikmeny. Hela rastret är startvyn: en
 *   stor "senaste/närmaste utmärkelse" högst upp, sedan en sektion per
 *   grupp med 3 medaljer i rad. Inget kort/ram runt någonting.
 * - De flesta grupper har riktig trofékonst (ChatGPT-genererade, beskurna
 *   PNG:er i assets/badges/, se BADGE_IMAGES). Grupper utan konst faller
 *   tillbaka på en ritad Skia-medalj (äkta konisk gradient för kanten,
 *   äkta Gaussisk oskärpa för glöden). Låst = mörk siluett av samma
 *   troféform (riktig konst) eller ett stort "?" (Skia-fallbacken) —
 *   aldrig ett hänglås.
 * - Headern flyter genomskinligt och scrollar bort med resten av sidan —
 *   inte en fast/sticky bar som Favoriter/Förmåner/Historik/Statistik.
 * - Placeringen: troféer som klarats sen sidan senast öppnades (listan "att
 *   placera", se trophyMoments/TrophyHost) står först mörka på sin plats.
 *   Sidan scrollar till en i taget och medaljen faller ner i sin plats med en
 *   studs, glöd och vibration — sen ligger den där som vanligt. När den sista
 *   landat scrollar sidan tillbaka upp och "Senaste utmärkelsen" byts synligt
 *   till den nya.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet, Animated, Easing, Modal,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, { Easing as ReEasing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { ArrowLeft, X, Check } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTrophies } from "@/hooks/useTrophies";
import { useAuth } from "@/hooks/useAuth";
import { getTrophiesToPlace, removeTrophyToPlace } from "@/lib/trophyMoments";
import { TrophyMedal, GlowCanvas, prefetchBadgeImages } from "@/components/trophies/TrophyMedal";
import { TIER_PALETTE, GROUP_ORDER, type Trophy } from "@/lib/achievements";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const BG    = "#121212";
const FG    = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD  = "#C5A059";
const GOLD_LT = "#E8C674";

// ─── Den stora utmärkelsen överst — senast upplåsta, eller om inget är
// upplåst än, den du är närmast att klara. Inget kort/ram runt — precis
// som referensbilden, bara medaljen och text direkt på sidbakgrunden.
//
// Bakgrundsljuset bakom medaljen är EN stor mjukt suddig cirkel (GlowCanvas,
// samma teknik som de små medaljglödarna), inte en gradient som tonar över
// hela hero-ytan. Vi testade en helskärms-gradient först, men den satt fast
// högst upp (där boxen börjar) istället för runt medaljen (där den faktiskt
// syns), och kändes för kraftig. Ett tunt, löst lager runt själva medaljen
// — precis som i referensbilden — läser bättre.
// Bytet av "Senaste utmärkelsen" efter en placering: bara en lugn toning, ingen zoom eller studs
// (stora ögonblicket har redan varit, det här bara bekräftar)
const heroSwap = () => {
  "worklet";
  return {
    initialValues: { opacity: 0 },
    animations: { opacity: withTiming(1, { duration: 900, easing: ReEasing.inOut(ReEasing.quad) }) },
  };
};

function FeaturedTrophy({ trophy, medalSize, onPress, onLoad }: { trophy: Trophy; medalSize: number; onPress: () => void; onLoad?: () => void }) {
  const unlocked = trophy.done;
  const glowColor = TIER_PALETTE[trophy.tier].field[0]; // ljusaste tonen i paletten, mest "glow"-lik
  return (
    <Pressable onPress={onPress} style={{ alignItems: "center" }}>
      <View style={feat.eyebrowRow}>
        <Text style={feat.star}>★</Text>
        <Text style={feat.eyebrow}>{unlocked ? "SENASTE UTMÄRKELSEN" : "NÄRMAST ATT LÅSA UPP"}</Text>
      </View>
      <View style={{ marginTop: 28, width: medalSize, height: medalSize, alignItems: "center", justifyContent: "center" }}>
        <GlowCanvas size={medalSize} color={glowColor} opacity={0.1} radiusRatio={0.95} blurRatio={0.4} />
        <TrophyMedal size={medalSize} tier={trophy.tier} Icon={trophy.Icon} unlocked={unlocked} groupId={trophy.groupId} onLoad={onLoad} />
      </View>
      <Text style={feat.name}>{trophy.identity}</Text>
      <Text style={feat.desc}>
        {unlocked ? trophy.levelName : `${trophy.progress}/${trophy.target} — ${trophy.requirementText}`}
      </Text>
    </Pressable>
  );
}

// ─── En troféplats i rastret — bara medalj + text, inget kort runt,
// precis som referensbilden. Låst = "?" i medaljen (kodas i TrophyMedal).
// placement: "waiting" = klar men inte placerad än (visas mörk), "dropping" =
// medaljen faller ner i sin plats just nu; onLanded när den landat.
type Placement = "waiting" | "dropping" | null;
/** Hur länge en medalj faller ner i sin plats (gruppens bock smäller in när den landat) */
const DROP_MS = 420;

function TrophyBadge({
  trophy, itemWidth, medalSize, placement, onLanded, onPress, badgeRef, ready, order, onLoad,
}: {
  trophy: Trophy; itemWidth: number; medalSize: number; placement: Placement;
  onLanded: () => void; onPress: () => void; badgeRef: (v: View | null) => void;
  /** Alla medaljer laddade — tåget startar */
  ready: boolean;
  /** Platsen i tåget (uppifrån och ner) */
  order: number;
  onLoad: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const enter = useRef(new Animated.Value(0)).current;
  const drop = useRef(new Animated.Value(0)).current;
  const squash = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const unlocked = trophy.done && placement === null;

  // Tåget: när alla medaljer laddats glider de in en i taget, uppifrån och ner
  useEffect(() => {
    if (!ready) return;
    Animated.sequence([
      Animated.delay(TRAIN_START + order * TRAIN_STEP),
      Animated.spring(enter, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 5 }),
    ]).start();
  }, [ready]);

  // Medaljen faller ner i sin plats: in uppifrån och stor, smäller ner, trycks ihop och studsar,
  // glöden blinkar till — samma känsla som stämpeln vid incheckningen
  useEffect(() => {
    if (placement !== "dropping") return;
    drop.setValue(0);
    Animated.timing(drop, { toValue: 1, duration: DROP_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}), 150);
      Animated.sequence([
        Animated.timing(squash, { toValue: 0.88, duration: 70, useNativeDriver: true }),
        Animated.spring(squash, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 12 }),
      ]).start();
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
      setTimeout(onLanded, 700);
    });
  }, [placement]);

  const onPressIn  = () => Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 50, bounciness: 4 }).start();

  return (
    <Pressable style={{ width: itemWidth, alignItems: "center" }} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View
        style={{
          alignItems: "center",
          opacity: enter,
          transform: [
            { scale: Animated.multiply(scale, enter.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] })) },
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
          ],
        }}
      >
        <View ref={badgeRef} style={{ width: medalSize, height: medalSize }}>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { opacity: glow, transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.25] }) }] }]}
          >
            <GlowCanvas size={medalSize} color={GOLD_LT} opacity={0.6} radiusRatio={0.8} blurRatio={0.22} />
          </Animated.View>
          <Animated.View style={{ transform: [{ scale: squash }] }}>
            <TrophyMedal size={medalSize} tier={trophy.tier} Icon={trophy.Icon} unlocked={unlocked} groupId={trophy.groupId} onLoad={onLoad} />
          </Animated.View>
          {placement === "dropping" && (
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  opacity: drop.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
                  transform: [
                    { translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-medalSize * 0.6, 0] }) },
                    { scale: Animated.multiply(drop.interpolate({ inputRange: [0, 1], outputRange: [2.3, 1] }), squash) },
                  ],
                },
              ]}
            >
              <TrophyMedal size={medalSize} tier={trophy.tier} Icon={trophy.Icon} unlocked groupId={trophy.groupId} />
            </Animated.View>
          )}
        </View>
        <Text style={[badge.name, !unlocked && badge.nameLocked]} numberOfLines={1}>{trophy.levelName}</Text>
        <Text style={badge.desc} numberOfLines={2}>{trophy.requirementText}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Hela sidan — den stora utmärkelsen överst, sedan en sektion per grupp
// (Kom igång, Utforskaren, Samlaren, Förmånsjägaren, Mångsidig, Bläddraren,
// Österlenlegend), 3 medaljer per rad, ingen ram/kort runt.
function TrophyGrid({
  trophies, waiting, heroHidden, heroAnimate, dropping, onLanded, onPress, badgeRefs, ready, onMedalLoaded,
}: {
  /** Alla medaljbilder laddade — tåget startar */
  ready: boolean;
  onMedalLoaded: (key: string) => void;
  trophies: Trophy[];
  /** Klara men ännu inte placerade — visas mörka tills det är deras tur */
  waiting: Set<string>;
  /** Placerade nyss, men ska inte synas som "Senaste utmärkelsen" förrän sidan scrollat upp igen */
  heroHidden: Set<string>;
  /** "Senaste utmärkelsen" byts med en zoom (bara efter en placering, inte när sidan öppnas) */
  heroAnimate: boolean;
  dropping: string | null;
  onLanded: () => void;
  onPress: (t: Trophy) => void;
  badgeRefs: React.MutableRefObject<Record<string, View | null>>;
}) {
  const { width: winW } = useWindowDimensions();
  const pageW = winW - 32; // 16px sidmarginal, som resten av appens sidor
  const gap = 16;
  const itemWidth = (pageW - gap * 2) / 3;
  const medalSize = Math.round(itemWidth * 0.86); // större symboler i rastret

  const heroMedalSize = Math.min(180, Math.round(winW * 0.44)); // hero-medaljen, större än rastrets men inte skärmsprängande

  const grouped = useMemo(() => {
    const map: Record<string, Trophy[]> = {};
    trophies.forEach((t) => {
      (map[t.groupId] ??= []).push(t);
    });
    return map;
  }, [trophies]);

  const featured = useMemo(() => {
    // De som väntar på sin placering visas inte här än — de ska få sitt ögonblick i rastret först
    const done = trophies.filter((t) => t.done && t.doneAt && !waiting.has(t.key) && !heroHidden.has(t.key));
    if (done.length > 0) {
      return [...done].sort((a, b) => +new Date(b.doneAt!) - +new Date(a.doneAt!))[0];
    }
    // Inget upplåst än — visa den du är närmast att klara istället
    return [...trophies].sort((a, b) => b.percent - a.percent)[0] ?? null;
  }, [trophies, waiting, heroHidden]);

  // Tågets första vagn: den stora utmärkelsen överst
  const heroIn = useSharedValue(0);
  useEffect(() => {
    if (ready) heroIn.value = withTiming(1, { duration: 420, easing: ReEasing.out(ReEasing.cubic) });
  }, [ready, heroIn]);
  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroIn.value,
    transform: [{ scale: 0.9 + heroIn.value * 0.1 }],
  }));

  // Varje medaljs plats i tåget, uppifrån och ner
  let order = 0;

  // Gruppens bock: alla tre klara och placerade — eller "landing" när den sista faller just nu
  const groupCheck = (group: Trophy[]): "hidden" | "shown" | "landing" => {
    if (!group.every((t) => t.done)) return "hidden";
    const pending = group.filter((t) => waiting.has(t.key));
    if (pending.length === 0) return "shown";
    return pending.length === 1 && pending[0].key === dropping ? "landing" : "hidden";
  };

  return (
    <View>
      {featured && (
        <Reanimated.View
          key={featured.key}
          entering={heroAnimate ? heroSwap : undefined}
          style={[{ alignItems: "center", paddingTop: 32 }, heroStyle]}
        >
          <FeaturedTrophy trophy={featured} medalSize={heroMedalSize} onPress={() => onPress(featured)} onLoad={() => onMedalLoaded("hero")} />
        </Reanimated.View>
      )}

      <View style={{ paddingHorizontal: 16, paddingTop: 44, gap: 44 }}>
        {GROUP_ORDER.map((groupId) => {
          const groupTrophies = grouped[groupId] ?? [];
          if (groupTrophies.length === 0) return null;
          const label = groupTrophies[0].identity;

          const firstOrder = order;
          return (
            <View key={groupId}>
              <SectionLabel
                text={label.toUpperCase()}
                ready={ready}
                order={firstOrder}
                check={groupCheck(groupTrophies)}
              />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap, marginTop: 26 }}>
                {groupTrophies.map((t) => (
                  <TrophyBadge
                    key={t.key}
                    trophy={t}
                    itemWidth={itemWidth}
                    medalSize={medalSize}
                    placement={dropping === t.key ? "dropping" : waiting.has(t.key) ? "waiting" : null}
                    onLanded={onLanded}
                    badgeRef={(v) => { badgeRefs.current[t.key] = v; }}
                    onPress={() => onPress(t)}
                    ready={ready}
                    order={order++}
                    onLoad={() => onMedalLoaded(t.key)}
                  />
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Detaljmodal ────────────────────────────────────────────────────────────────
const DONE_GREEN = "#4ADE80";
/** Framstegets färg efter hur nära man är: glider från rött via orange och gult till grönt, så att
 * 59 av 60 redan är nästan grönt */
const progressColor = (ratio: number) => `hsl(${Math.round(Math.max(0, Math.min(1, ratio)) * 115)}, 85%, 60%)`;

function TrophyDetailModal({ trophy, onClose }: { trophy: Trophy | null; onClose: () => void }) {
  return (
    <Modal visible={!!trophy} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={dm.overlay} onPress={onClose}>
        <Pressable style={dm.card} onPress={(e) => e.stopPropagation()}>
          {trophy && (
            <>
              <TouchableOpacity style={dm.closeBtn} onPress={onClose}>
                <X size={22} color={MUTED} strokeWidth={2} />
              </TouchableOpacity>

              <View style={{ marginTop: 8 }}>
                <TrophyMedal size={140} tier={trophy.tier} Icon={trophy.Icon} unlocked={trophy.done} groupId={trophy.groupId} />
              </View>

              <View style={[dm.ribbon, { backgroundColor: TIER_PALETTE[trophy.tier].rim }]}>
                <Text style={dm.ribbonText}>{trophy.levelLabel.toUpperCase()}</Text>
              </View>

              <Text style={dm.identity}>{trophy.identity}</Text>
              <Text style={dm.levelName}>{trophy.levelName}</Text>
              <Text style={dm.tagline}>{trophy.tagline}</Text>

              <View style={dm.divider} />

              {trophy.done ? (
                <Text style={[dm.progressText, { color: DONE_GREEN, fontFamily: "Inter_600SemiBold" }]}>
                  Klar{trophy.doneAt ? ` ${format(new Date(trophy.doneAt), "d MMMM yyyy", { locale: sv })}` : ""}
                </Text>
              ) : (
                trophy.parts ? (
                  // Österlenlegend: delmålen var för sig, klara i grönt med bock
                  <View style={dm.parts}>
                    {trophy.parts.map((p) => (
                      <View key={p.label} style={dm.partRow}>
                        <View style={[dm.partCheck, p.done && dm.partCheckDone]}>
                          {p.done && <Check size={12} color="#0B0B0D" strokeWidth={3.2} />}
                        </View>
                        <Text style={[dm.partText, p.done && { color: DONE_GREEN }]}>{p.label}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <>
                    <Text style={dm.progressText}>{trophy.requirementText}</Text>
                    {/* Siffrorna i en färg efter hur nära man är: röd, orange, gul */}
                    <Text style={dm.progressLine}>
                      <Text style={[dm.progressNumbers, { color: progressColor(trophy.progress / trophy.target) }]}>
                        {trophy.progress} av {trophy.target}
                      </Text>
                      {" "}{trophy.progressUnit}
                    </Text>
                  </>
                )
              )}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
/**
 * Gruppens rubrik — tonas in tillsammans med gruppens första medalj i tåget. Är hela gruppen klar
 * står en grön bock bredvid. Placeras gruppens sista trofé just nu (efter ett firande) smäller
 * bocken in i samma ögonblick som medaljen landar.
 */
function SectionLabel({ text, ready, order, check }: {
  text: string; ready: boolean; order: number;
  /** "shown" = gruppen klar, "landing" = blir klar när medaljen som faller nu landar */
  check: "hidden" | "shown" | "landing";
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const checkIn = useRef(new Animated.Value(check === "shown" ? 1 : 0)).current;
  useEffect(() => {
    if (!ready) return;
    Animated.timing(opacity, { toValue: 1, duration: 300, delay: TRAIN_START + order * TRAIN_STEP, useNativeDriver: true }).start();
  }, [ready]);
  useEffect(() => {
    if (check === "shown") { checkIn.setValue(1); return; }
    if (check !== "landing") { checkIn.setValue(0); return; }
    // Medaljen faller i 420 ms — bocken smäller in när den landar
    checkIn.setValue(0);
    Animated.sequence([
      Animated.delay(DROP_MS),
      Animated.spring(checkIn, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 14 }),
    ]).start();
  }, [check]);
  return (
    <Animated.View style={[sec.labelRow, { opacity }]}>
      <Text style={sec.label}>{text}</Text>
      {check !== "hidden" && (
        <Animated.View
          style={[sec.check, {
            opacity: checkIn,
            transform: [{ scale: checkIn.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) }],
          }]}
        >
          <Check size={13} color="#0B0B0D" strokeWidth={3.4} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

// Tåget: när sidan öppnas väntar medaljerna tills deras bilder laddats — högst en kort stund, så
// sidan aldrig står tom (bilderna hämtas redan på Profil, se prefetchBadgeImages) — sen glider den
// stora utmärkelsen och medaljerna in en i taget uppifrån och ner
const TRAIN_START = 40;
const TRAIN_STEP = 35;
const MAX_WAIT = 300;

export default function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { trophies, isLoading } = useTrophies();
  const { user } = useAuth();
  const { height: winH } = useWindowDimensions();
  const [selected, setSelected] = useState<Trophy | null>(null);
  const safeTop = Math.max(insets.top, 44);

  // Medaljbilderna som laddats — när alla (rastret + den stora överst) är klara startar tåget
  const [ready, setReady] = useState(false);
  const loaded = useRef(new Set<string>());
  const onMedalLoaded = (key: string) => {
    loaded.current.add(key);
    if (!ready && loaded.current.size >= trophies.length + 1) setReady(true);
  };
  useEffect(() => { prefetchBadgeImages(); }, []);
  useEffect(() => {
    if (isLoading) return;
    const t = setTimeout(() => setReady(true), MAX_WAIT);
    return () => clearTimeout(t);
  }, [isLoading]);


  // ─── Placeringen: nya troféer faller ner i sina platser, en i taget ──────────
  // (TrophyHost sparar nyklara troféer i databasen och lägger dem på listan "att placera")
  const [waiting, setWaiting] = useState<string[]>([]);
  const [dropping, setDropping] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const badgeRefs = useRef<Record<string, View | null>>({});
  // Den första väntar lite längre — kommer man från firandet hinner dess mörka bakgrund tona bort
  const firstDrop = useRef(true);

  useEffect(() => {
    if (!user || isLoading) return;
    let alive = true;
    getTrophiesToPlace(user.id).then((keys) => {
      if (!alive) return;
      const order = (k: string) => trophies.findIndex((t) => t.key === k);
      // Bara sådant som faktiskt är klart, i sidans ordning (uppifrån och ner)
      setWaiting(keys.filter((k) => trophies.find((t) => t.key === k)?.done).sort((x, y) => order(x) - order(y)));
    });
    return () => { alive = false; };
    // Läses en gång när sidan öppnats och troféerna laddats
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading]);

  // Nästa i tur: scrolla så platsen syns lite ovanför mitten, och släpp medaljen
  useEffect(() => {
    if (!ready || dropping || waiting.length === 0) return;
    const key = waiting[0];
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => {
      const badge = badgeRefs.current[key];
      const content = contentRef.current;
      if (badge && content) {
        badge.measureLayout(content, (_x, y) => {
          scrollRef.current?.scrollTo({ y: Math.max(0, y - winH * 0.38), animated: true });
        }, () => {});
      }
      timers.push(setTimeout(() => setDropping(key), 650));
    }, firstDrop.current ? 900 + TRAIN_START + trophies.length * TRAIN_STEP : 350));
    firstDrop.current = false;
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, dropping, winH, ready]);

  const [heroHidden, setHeroHidden] = useState<string[]>([]);
  const [heroAnimate, setHeroAnimate] = useState(false);

  const handleLanded = () => {
    const key = dropping;
    if (!key) return;
    if (user) removeTrophyToPlace(user.id, key);
    setDropping(null);
    setHeroHidden((h) => [...h, key]);
    setWaiting((w) => w.filter((k) => k !== key));
  };

  // Alla placerade: tillbaka upp, och "Senaste utmärkelsen" byts till den nya
  useEffect(() => {
    if (waiting.length > 0 || dropping || heroHidden.length === 0) return;
    const up = setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 600);
    const reveal = setTimeout(() => {
      setHeroAnimate(true);
      setHeroHidden([]);
      Haptics.selectionAsync().catch(() => {});
    }, 1150);
    return () => { clearTimeout(up); clearTimeout(reveal); };
  }, [waiting.length, dropping, heroHidden.length]);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {isLoading ? (
        <View style={{ flex: 1 }}>
          <ChallengesHeader safeTop={safeTop} onBack={() => router.back()} />
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED }}>Laddar utmaningar…</Text>
          </View>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          // Ingen +96 här — den paddingen fanns för att lämna plats åt den
          // flytande bottennavigeringen, men den renderas bara inuti
          // (tabs)-gruppen. Den här skärmen ligger utanför, navbaren syns
          // aldrig här, så paddingen var ren dödyta.
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
        >
          {/* Headern ligger i scrollflödet, inte fast/sticky ovanpå —
              den ska scrolla bort tillsammans med resten av sidan. */}
          <View ref={contentRef}>
            <ChallengesHeader safeTop={safeTop} onBack={() => router.back()} />
            <TrophyGrid
              trophies={trophies}
              waiting={new Set(waiting)}
              heroHidden={new Set(heroHidden)}
              heroAnimate={heroAnimate}
              dropping={dropping}
              onLanded={handleLanded}
              badgeRefs={badgeRefs}
              ready={ready}
              onMedalLoaded={onMedalLoaded}
              onPress={(t) => {
                Haptics.selectionAsync().catch(() => {});
                setSelected(t);
              }}
            />
          </View>
        </ScrollView>
      )}

      <TrophyDetailModal trophy={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

// Genomskinlig header, inget svart fält bakom — till skillnad från
// Favoriter/Förmåner/Historik/Statistik är den INTE fast/sticky, den ligger
// i scrollflödet och scrollar bort tillsammans med resten av sidan.
function ChallengesHeader({ safeTop, onBack }: { safeTop: number; onBack: () => void }) {
  return (
    <View style={{ paddingTop: safeTop }}>
      <View style={hd.row}>
        <TouchableOpacity style={hd.iconBtn} onPress={onBack}>
          <ArrowLeft size={24} color={FG} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={hd.title}>UTMANINGAR</Text>
      </View>
    </View>
  );
}

const hd = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center",
    height: 64, paddingHorizontal: 16, gap: 12,
  },
  iconBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  // Samma rubrik som Mitt Österlen och övriga sidor
  title: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, color: FG },
});

// Sektionsrubrik ovanför varje grupps 3 rutor — samma "eyebrow"-mönster
// (liten ikon + versal guldtext) som används på flera andra sidor i appen.
const sec = StyleSheet.create({
  labelRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: {
    fontFamily: "Inter_600SemiBold", fontSize: 16, color: FG,
    letterSpacing: 0.8,
  },
  // Hela gruppen klar
  check: {
    width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
    backgroundColor: "#4ADE80",
  },
});

const feat = StyleSheet.create({
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  star: { fontSize: 12, color: GOLD },
  eyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 11.5, color: FG, letterSpacing: 1.4 },
  name: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 26, color: FG, marginTop: 18, textAlign: "center" },
  desc: {
    fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED,
    marginTop: 6, textAlign: "center",
  },
});

const badge = StyleSheet.create({
  name: {
    fontFamily: "Inter_600SemiBold", fontSize: 13, color: FG,
    marginTop: 12, textAlign: "center",
  },
  nameLocked: { color: "rgba(255,255,255,0.40)" },
  desc: {
    fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.40)",
    marginTop: 4, textAlign: "center", lineHeight: 14,
  },
});

const dm = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  card: {
    width: "100%", maxWidth: 340, borderRadius: 24,
    backgroundColor: "#1A1A1A", padding: 24, paddingTop: 32,
    alignItems: "center",
    borderWidth: 0.5, borderColor: "rgba(197,160,89,0.25)",
    shadowColor: "#000", shadowOffset: { width: 0, height: 30 }, shadowOpacity: 0.85, shadowRadius: 40, elevation: 12,
  },
  closeBtn: {
    position: "absolute", top: 14, right: 14,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
  },
  ribbon: {
    marginTop: 20, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999,
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.15)",
  },
  ribbonText: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: "#fdf6e3", letterSpacing: 1.8, textTransform: "uppercase" },
  identity: { fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 22, color: FG, marginTop: 12, textAlign: "center" },
  levelName: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: GOLD, letterSpacing: 2.2, textTransform: "uppercase", marginTop: 4 },
  tagline: {
    fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.65)",
    textAlign: "center", maxWidth: 260, marginTop: 12,
  },
  divider: { width: 64, height: 1, backgroundColor: "rgba(197,160,89,0.35)", marginVertical: 20 },
  progressText: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 6, textAlign: "center" },
  progressLine: { fontFamily: "Inter_500Medium", fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 8, textAlign: "center" },
  progressNumbers: { fontFamily: "Montserrat_700Bold", fontSize: 15 },
  parts: { gap: 10, marginTop: 4, alignSelf: "center" },
  partRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  partCheck: {
    width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)",
  },
  partCheckDone: { backgroundColor: DONE_GREEN, borderColor: DONE_GREEN },
  partText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "rgba(255,255,255,0.45)" },
});
