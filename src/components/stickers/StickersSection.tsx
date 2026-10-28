/**
 * "Österlens skatter" (samlarobjekten) på Mitt Österlen: skatterna i ett rutnät, 3 per rad.
 * Hittade i färg, övriga som mörka skymtar. Tryck öppnar kartan med skattens kort.
 *
 * Visar bara 2 rader (6 st) till att börja med — "Visa fler" fäller ut resten.
 *
 * Inklistringen: skatter som hittats sen samlingen senast visades (listan "att klistra in", se
 * treasurePlacement) står först mörka på sin plats. Sidan scrollar dit, och skatten flyger in
 * stor och snett från ovan, smäller ner i sin ruta, trycks ihop och sätter sig lite snett — som
 * ett klistermärke. En i taget.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import Reanimated, {
  Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/hooks/useAuth";
import { useCollectibles, useCollected, type Collectible } from "@/hooks/useCollectibles";
import { getTreasuresToPlace, removeTreasureToPlace } from "@/lib/treasurePlacement";
import { holdTrophyMoments } from "@/lib/trophyMoments";
import { PressableScale } from "@/components/PressableScale";
import { StickerArt } from "./StickerArt";
import i18n from "i18next";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const PURPLE = "#A78BFA";
const COLLAPSED_COUNT = 6;
const ART = 68;

export function StickersSection({ scrollTo }: { scrollTo?: (y: number) => void }) {
  const s = useThemedStyles(createStyles);
  const router = useRouter();
  const { user } = useAuth();
  const { height: winH } = useWindowDimensions();
  const { data: collectibles = [], isSuccess: loaded } = useCollectibles();
  const { data: collected = new Map<string, string>(), isSuccess: collectedLoaded } = useCollected();
  const [expanded, setExpanded] = useState(false);

  // ─── Inklistringen ─────────────────────────────────────────────────────────
  const [waiting, setWaiting] = useState<string[]>([]);
  const [dropping, setDropping] = useState<string | null>(null);
  const sectionY = useRef(0);
  const gridY = useRef(0);
  const cellY = useRef<Record<string, number>>({});
  const firstDrop = useRef(true);
  const mountedAt = useRef(Date.now());
  // Inklistringen startar först när rutornas bilder faktiskt laddats (högst 3 s) — annars
  // scrollade sidan ner till rutor som ännu var tomma
  const loadedIds = useRef(new Set<string>());
  const visibleIds = useRef<string[]>([]);
  const [imagesReady, setImagesReady] = useState(false);
  const markLoaded = useCallback((id: string) => {
    loadedIds.current.add(id);
    if (visibleIds.current.length > 0 && visibleIds.current.every((v) => loadedIds.current.has(v))) setImagesReady(true);
  }, []);

  useEffect(() => {
    if (!user || !loaded || !collectedLoaded) return;
    let alive = true;
    getTreasuresToPlace(user.id).then((ids) => {
      if (!alive) return;
      const order = (id: string) => collectibles.findIndex((c) => c.id === id);
      // Allt på listan räknas som hittat (det lades dit precis när skatten hittades) — samlingens
      // egen data kan ligga en stund efter
      const pending = ids.filter((id) => order(id) >= 0).sort((a, b) => order(a) - order(b));
      if (pending.some((id) => order(id) >= COLLAPSED_COUNT)) setExpanded(true);
      setWaiting(pending);
    });
    return () => { alive = false; };
    // Läses en gång när sidan öppnats och datan laddats
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loaded, collectedLoaded]);

  // Nästa i tur: scrolla så rutan syns lite ovanför mitten, och släpp skatten. Den första väntar
  // tills sidan hunnit byggas klart och firandets mörka bakgrund tonats bort
  useEffect(() => {
    if (waiting.length === 0 || imagesReady) return;
    const t = setTimeout(() => setImagesReady(true), 3000);
    return () => clearTimeout(t);
  }, [waiting.length, imagesReady]);

  useEffect(() => {
    if (dropping || waiting.length === 0 || !imagesReady) return;
    const id = waiting[0];
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => {
      scrollTo?.(sectionY.current + gridY.current + (cellY.current[id] ?? 0) - winH * 0.38);
      timers.push(setTimeout(() => setDropping(id), 650));
    }, firstDrop.current ? Math.max(700, 1800 - (Date.now() - mountedAt.current)) : 350));
    firstDrop.current = false;
    return () => timers.forEach(clearTimeout);
  }, [waiting, dropping, imagesReady, scrollTo, winH]);

  // Medan inklistringen pågår väntar övriga belöningar (t.ex. en ny profilring) — och en stund
  // efter att sista skatten landat, så den hinner sätta sig innan nästa firande tar över skärmen
  const placing = waiting.length > 0 || dropping !== null;
  useEffect(() => {
    if (!placing) return;
    const release = holdTrophyMoments();
    return () => { setTimeout(release, 900); };
  }, [placing]);

  const handleLanded = () => {
    const id = dropping;
    if (!id) return;
    if (user) removeTreasureToPlace(user.id, id);
    setDropping(null);
    setWaiting((w) => w.filter((x) => x !== id));
  };

  if (collectibles.length === 0) return null;

  const have = collectibles.filter((c) => collected.has(c.id)).length;
  const visible = expanded ? collectibles : collectibles.slice(0, COLLAPSED_COUNT);
  visibleIds.current = visible.map((c) => c.id);
  const canExpand = collectibles.length > COLLAPSED_COUNT;

  return (
    <View style={s.section} onLayout={(e) => { sectionY.current = e.nativeEvent.layout.y; }}>
      <View style={s.head}>
        <Text style={s.title}>{i18n.t("treasure.collection")}</Text>
        <Text style={s.count}>{i18n.t("treasure.ofTotal", { count: have, total: collectibles.length })}</Text>
      </View>
      <View style={s.grid} onLayout={(e) => { gridY.current = e.nativeEvent.layout.y; }}>
        {visible.map((c) => (
          <StickerCell
            key={c.id}
            collectible={c}
            has={collected.has(c.id) || waiting.includes(c.id)}
            placement={dropping === c.id ? "dropping" : waiting.includes(c.id) ? "waiting" : null}
            onLanded={handleLanded}
            onLayout={(e) => { cellY.current[c.id] = e.nativeEvent.layout.y; }}
            onLoaded={() => markLoaded(c.id)}
            onPress={() => router.push({ pathname: "/map", params: { sticker: c.id } })}
          />
        ))}
      </View>
      {canExpand && (
        <PressableScale style={s.moreBtn} scale={0.97} onPress={() => setExpanded((e) => !e)}>
          <Text style={s.moreBtnText}>{i18n.t(expanded ? "place.showFewer" : "rewards.showMore")}</Text>
          {expanded ? (
            <ChevronUp size={16} color={PURPLE} strokeWidth={2.2} />
          ) : (
            <ChevronDown size={16} color={PURPLE} strokeWidth={2.2} />
          )}
        </PressableScale>
      )}
    </View>
  );
}

/** En ruta i samlingen. "waiting" = hittad men inte inklistrad än (visas mörk), "dropping" =
 * skatten klistras in just nu.
 *
 * Ingenting byts ut mitt i: den färgade bilden som ska falla ner finns redan på plats (osynlig)
 * medan rutan väntar, den landar RAK exakt där den ska sitta, och efter landningen är det samma
 * bild som ligger kvar — den mörka under tonas bara bort. Att byta bild i landningsögonblicket
 * syntes som ett hack. */
function StickerCell({
  collectible, has, placement, onLanded, onLayout, onLoaded, onPress,
}: {
  collectible: Collectible;
  has: boolean;
  placement: "waiting" | "dropping" | null;
  onLanded: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
  onLoaded: () => void;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const drop = useSharedValue(0);
  const squash = useSharedValue(1);
  // Har klistrats in under det här besöket på sidan: den nedfallna bilden ligger kvar för gott
  const [settled, setSettled] = useState(false);
  const placing = placement !== null || settled;
  const shown = has && !placing;

  const landed = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}), 140);
    squash.value = withSequence(withTiming(0.86, { duration: 70 }), withSpring(1, { damping: 9, stiffness: 260 }));
    setSettled(true);
    setTimeout(onLanded, 650);
  };

  useEffect(() => {
    if (placement !== "dropping") return;
    drop.value = 0;
    drop.value = withTiming(1, { duration: 440, easing: Easing.in(Easing.quad) }, (fin) => {
      if (fin) runOnJS(landed)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement]);

  const dropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drop.value, [0, 0.25], [0, 1], "clamp"),
    transform: [
      { translateY: interpolate(drop.value, [0, 1], [-ART * 1.4, 0]) },
      { scale: interpolate(drop.value, [0, 1], [2.4, 1]) * squash.value },
      { rotate: `${interpolate(drop.value, [0, 1], [-28, 0])}deg` },
    ],
  }));
  const darkStyle = useAnimatedStyle(() => ({
    opacity: 1 - interpolate(drop.value, [0.9, 1], [0, 1], "clamp"),
    transform: [{ scale: squash.value }],
  }));

  return (
    <TouchableOpacity style={s.cell} activeOpacity={0.8} onPress={onPress} onLayout={onLayout}>
      <View style={{ width: ART, height: ART }}>
        {placing ? (
          <>
            <Reanimated.View style={[StyleSheet.absoluteFill, darkStyle]}>
              <StickerArt imagePath={collectible.imagePath} size={ART} silhouette onLoaded={onLoaded} />
            </Reanimated.View>
            <Reanimated.View style={[StyleSheet.absoluteFill, dropStyle]} pointerEvents="none">
              <StickerArt imagePath={collectible.imagePath} size={ART} silhouette={false} />
            </Reanimated.View>
          </>
        ) : (
          <StickerArt imagePath={collectible.imagePath} size={ART} silhouette={!shown} onLoaded={onLoaded} />
        )}
      </View>
      <Text style={[s.name, (shown || settled) && { color: colors.text }]} numberOfLines={2}>{collectible.name}</Text>
    </TouchableOpacity>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  section: { marginTop: 32 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 16 },
  // Playfair bort — bara för personnamn i appen numera, sektionsrubriker delar Montserrat
  title: { fontFamily: "Montserrat_700Bold", fontSize: 18, letterSpacing: -0.2, color: c.text },
  count: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: PURPLE },
  // 3 per rad (var 4) så 6 stycken blir exakt två rader innan "Visa fler"
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8, marginTop: 14 },
  cell: { width: "33.333%", alignItems: "center", paddingHorizontal: 4, paddingVertical: 8 },
  name: { fontFamily: "Inter_500Medium", fontSize: 11.5, color: c.muted, textAlign: "center", marginTop: 6 },
  moreBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: 6, marginHorizontal: 16, paddingVertical: 12, borderRadius: 12,
    backgroundColor: "rgba(167,139,250,0.10)", borderWidth: 1, borderColor: "rgba(167,139,250,0.25)",
  },
  moreBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: PURPLE },
});
