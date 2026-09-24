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
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet, Animated, Easing, Modal,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTrophies, useGrantNewTrophies } from "@/hooks/useTrophies";
import { TrophyMedal, GlowCanvas } from "@/components/trophies/TrophyMedal";
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
function FeaturedTrophy({ trophy, medalSize, onPress }: { trophy: Trophy; medalSize: number; onPress: () => void }) {
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
        <TrophyMedal size={medalSize} tier={trophy.tier} Icon={trophy.Icon} unlocked={unlocked} groupId={trophy.groupId} />
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
function TrophyBadge({
  trophy, itemWidth, medalSize, justUnlocked, onPress,
}: { trophy: Trophy; itemWidth: number; medalSize: number; justUnlocked: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const enter = useRef(new Animated.Value(0)).current;
  const celebrate = useRef(new Animated.Value(0)).current;
  const unlocked = trophy.done;

  useEffect(() => {
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 6 }).start();
  }, []);

  // Upplåsningsfirande: guldglöd blinkar till + medaljen studsar till.
  useEffect(() => {
    if (!justUnlocked) return;
    celebrate.setValue(0);
    Animated.timing(celebrate, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.16, useNativeDriver: true, speed: 20, bounciness: 10 }),
      Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 20, bounciness: 6 }),
    ]).start();
  }, [justUnlocked]);

  const onPressIn  = () => Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 50, bounciness: 4 }).start();

  return (
    <Pressable style={{ width: itemWidth, alignItems: "center" }} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View
        style={{
          alignItems: "center",
          opacity: enter,
          transform: [
            { scale },
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
        }}
      >
        <View style={{ width: medalSize, height: medalSize }}>
          <TrophyMedal size={medalSize} tier={trophy.tier} Icon={trophy.Icon} unlocked={unlocked} groupId={trophy.groupId} />
          {justUnlocked && (
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { opacity: celebrate.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 0] }) },
              ]}
            >
              <GlowCanvas size={medalSize} color={GOLD_LT} opacity={0.55} radiusRatio={0.75} blurRatio={0.22} />
            </Animated.View>
          )}
        </View>
        <Text style={[badge.name, !unlocked && badge.nameLocked]} numberOfLines={1}>{trophy.identity}</Text>
        <Text style={badge.desc} numberOfLines={2}>{trophy.requirementText}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Hela sidan — den stora utmärkelsen överst, sedan en sektion per grupp
// (Kom igång, Utforskaren, Samlaren, Förmånsjägaren, Mångsidig, Bläddraren,
// Österlenlegend), 3 medaljer per rad, ingen ram/kort runt.
function TrophyGrid({
  trophies, celebratingKeys, onPress,
}: { trophies: Trophy[]; celebratingKeys: Set<string>; onPress: (t: Trophy) => void }) {
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
    const done = trophies.filter((t) => t.done && t.doneAt);
    if (done.length > 0) {
      return [...done].sort((a, b) => +new Date(b.doneAt!) - +new Date(a.doneAt!))[0];
    }
    // Inget upplåst än — visa den du är närmast att klara istället
    return [...trophies].sort((a, b) => b.percent - a.percent)[0] ?? null;
  }, [trophies]);

  return (
    <View>
      {featured && (
        <View style={{ alignItems: "center", paddingTop: 32 }}>
          <FeaturedTrophy trophy={featured} medalSize={heroMedalSize} onPress={() => onPress(featured)} />
        </View>
      )}

      <View style={{ paddingHorizontal: 16, paddingTop: 44, gap: 44 }}>
        {GROUP_ORDER.map((groupId) => {
          const groupTrophies = grouped[groupId] ?? [];
          if (groupTrophies.length === 0) return null;
          const label = groupTrophies[0].identity;

          return (
            <View key={groupId}>
              <Text style={sec.label}>{label.toUpperCase()}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap, marginTop: 26 }}>
                {groupTrophies.map((t) => (
                  <TrophyBadge
                    key={t.key}
                    trophy={t}
                    itemWidth={itemWidth}
                    medalSize={medalSize}
                    justUnlocked={celebratingKeys.has(t.key)}
                    onPress={() => onPress(t)}
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
                <Text style={dm.progressText}>
                  Klar{trophy.doneAt ? ` ${format(new Date(trophy.doneAt), "d MMMM yyyy", { locale: sv })}` : ""}
                </Text>
              ) : (
                <>
                  <Text style={dm.progressText}>{trophy.requirementText}</Text>
                  <Text style={dm.progressText}>{trophy.progress} av {trophy.target} besökta</Text>
                </>
              )}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { trophies, isLoading } = useTrophies();
  const [selected, setSelected] = useState<Trophy | null>(null);
  const safeTop = Math.max(insets.top, 44);

  // Spara nyklara troféer (datum för när de klarades) — se useGrantNewTrophies
  useGrantNewTrophies(trophies, !isLoading, () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
  );

  // Vilka troféer just låstes upp under den här sessionen — driver
  // guldglöd-firandet i TrophyTile. Ingen fira-animation vid första
  // laddningen, bara på riktiga övergångar från låst till upplåst.
  const isFirstRun = useRef(true);
  const prevDoneRef = useRef(new Set<string>());
  const [celebrating, setCelebrating] = useState<Set<string>>(new Set());
  useEffect(() => {
    const doneKeys = trophies.filter((t) => t.done).map((t) => t.key);
    if (isFirstRun.current) {
      isFirstRun.current = false;
      prevDoneRef.current = new Set(doneKeys);
      return;
    }
    const newlyDone = doneKeys.filter((k) => !prevDoneRef.current.has(k));
    if (newlyDone.length > 0) {
      setCelebrating((prev) => new Set([...prev, ...newlyDone]));
      setTimeout(() => {
        setCelebrating((prev) => {
          const next = new Set(prev);
          newlyDone.forEach((k) => next.delete(k));
          return next;
        });
      }, 1400);
    }
    prevDoneRef.current = new Set(doneKeys);
  }, [trophies]);

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
          showsVerticalScrollIndicator={false}
          // Ingen +96 här — den paddingen fanns för att lämna plats åt den
          // flytande bottennavigeringen, men den renderas bara inuti
          // (tabs)-gruppen. Den här skärmen ligger utanför, navbaren syns
          // aldrig här, så paddingen var ren dödyta.
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
        >
          {/* Headern ligger i scrollflödet, inte fast/sticky ovanpå —
              den ska scrolla bort tillsammans med resten av sidan. */}
          <ChallengesHeader safeTop={safeTop} onBack={() => router.back()} />
          <TrophyGrid
            trophies={trophies}
            celebratingKeys={celebrating}
            onPress={(t) => {
              Haptics.selectionAsync().catch(() => {});
              setSelected(t);
            }}
          />
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
        <Text style={hd.title}>Utmaningar</Text>
      </View>
    </View>
  );
}

const hd = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center",
    height: 72, paddingHorizontal: 16, gap: 12,
  },
  iconBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  title: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: FG },
});

// Sektionsrubrik ovanför varje grupps 3 rutor — samma "eyebrow"-mönster
// (liten ikon + versal guldtext) som används på flera andra sidor i appen.
const sec = StyleSheet.create({
  label: {
    fontFamily: "Inter_600SemiBold", fontSize: 16, color: FG,
    letterSpacing: 0.8,
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
  progressText: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 6, textAlign: "center" },
});
