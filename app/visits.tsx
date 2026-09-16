/**
 * Historik ("Dina besök") — tidslinje över besökta platser.
 * Spec: native-history-spec.md
 *
 * uniqueCount (unika platser) driver milstolpen, visitedPlaces.length
 * (alla besök, dubbletter inräknade) visas bara som "X besök" i metaraden.
 */
import { useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, Pressable, ScrollView, Image, StyleSheet, Animated, Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Compass, Sparkles, CalendarDays, MapPin } from "lucide-react-native";
import Svg, {
  Defs, LinearGradient as SvgGrad, RadialGradient as SvgRadial, Stop, Rect as SvgRect,
} from "react-native-svg";
import { useVisits, type Visit } from "@/hooks/useVisits";
import { usePlaces, type Place } from "@/hooks/usePlaces";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const BG      = "#121212";
const CARD    = "#1C1C1C";
const FG      = "#F5F1E8";
const MUTED   = "rgba(245,241,232,0.55)";
const GOLD    = "#C5A059";
const GOLD_LT = "#E8C674";

const MILESTONE_STEPS = [5, 10, 25, 50, 100];

interface VisitedPlace extends Visit {
  place: Place;
}

export default function VisitsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: visits = [], isLoading: visitsLoading } = useVisits();
  const { data: places = [], isLoading: placesLoading } = usePlaces();
  const isLoading = visitsLoading || placesLoading;
  const safeTop = Math.max(insets.top, 44);

  // Besök utan matchande plats göms helt
  const visitedPlaces: VisitedPlace[] = visits
    .map((v) => ({ ...v, place: places.find((p) => p.id === v.place_id) ?? null }))
    .filter((v): v is VisitedPlace => !!v.place);

  const uniqueCount = new Set(visitedPlaces.map((v) => v.place_id)).size;
  const totalPlaces = places.length;
  const lastVisit = visitedPlaces[0] ?? null;
  const lastVisitLabel = lastVisit ? format(new Date(lastVisit.visited_at), "d MMM", { locale: sv }) : null;

  const milestones = MILESTONE_STEPS.filter((m) => m < totalPlaces).concat(totalPlaces || 100);
  const nextMilestone = milestones.find((m) => m > uniqueCount) ?? totalPlaces;
  const milestoneProgress = nextMilestone > 0
    ? Math.min(100, Math.round((uniqueCount / nextMilestone) * 100)) : 0;

  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: milestoneProgress,
      duration: 1000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [milestoneProgress]);
  const fillWidth = progressAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[hd.header, { paddingTop: safeTop }]}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgGrad id="visitsHeaderFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor={BG} stopOpacity={1}    />
              <Stop offset="55%"  stopColor={BG} stopOpacity={0.98} />
              <Stop offset="100%" stopColor={BG} stopOpacity={0.78} />
            </SvgGrad>
          </Defs>
          <SvgRect width="100%" height="100%" fill="url(#visitsHeaderFade)" />
        </Svg>
        <View style={hd.row}>
          <TouchableOpacity style={hd.iconBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={hd.title}>Dina besök</Text>
        </View>
      </View>

      {isLoading && (
        <View style={{ padding: 16, gap: 12 }}>
          {[0, 1, 2].map((i) => <View key={i} style={sk.box} />)}
        </View>
      )}

      {!isLoading && visitedPlaces.length === 0 && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 20 }}>
          <EmptyState onExplore={() => router.push("/(tabs)/explore" as any)} />
        </ScrollView>
      )}

      {!isLoading && visitedPlaces.length > 0 && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
        >
          {/* ── Sammanfattningskort ── */}
          <View style={hc.card}>
            <Svg width={140} height={140} style={hc.glow} pointerEvents="none">
              <Defs>
                <SvgRadial id="visitsGlow" cx="70%" cy="20%" rx="60%" ry="60%">
                  <Stop offset="0%"   stopColor={GOLD} stopOpacity={0.08} />
                  <Stop offset="100%" stopColor={GOLD} stopOpacity={0}    />
                </SvgRadial>
              </Defs>
              <SvgRect width="100%" height="100%" fill="url(#visitsGlow)" />
            </Svg>
            <View pointerEvents="none" style={hc.innerHighlight} />

            <Text style={hc.eyebrow}>DINA BESÖK</Text>
            <Text style={hc.headline}>
              {uniqueCount} av {totalPlaces || "—"} platser upptäckta
            </Text>

            <View style={hc.metaRow}>
              <View style={hc.metaItem}>
                <MapPin size={12} color={GOLD} strokeWidth={1.5} />
                <Text style={hc.metaText}>{visitedPlaces.length} besök</Text>
              </View>
              {lastVisitLabel && (
                <View style={hc.metaItem}>
                  <CalendarDays size={12} color={GOLD} strokeWidth={1.5} />
                  <Text style={hc.metaText}>Senast {lastVisitLabel}</Text>
                </View>
              )}
            </View>

            <View style={hc.milestoneRow}>
              <View style={hc.metaItem}>
                <Sparkles size={12} color={GOLD} strokeWidth={1.5} />
                <Text style={hc.milestoneLabel}>Nästa milstolpe</Text>
              </View>
              <Text style={hc.milestoneValue}>{uniqueCount}/{nextMilestone}</Text>
            </View>
            <View style={hc.track}>
              <Animated.View style={[hc.fillWrap, { width: fillWidth }]}>
                <Svg width="100%" height="100%">
                  <Defs>
                    <SvgGrad id="milestoneFill" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0%"   stopColor={GOLD} />
                      <Stop offset="100%" stopColor={GOLD_LT} />
                    </SvgGrad>
                  </Defs>
                  <SvgRect width="100%" height="100%" fill="url(#milestoneFill)" />
                </Svg>
              </Animated.View>
            </View>
          </View>

          {/* ── Tidslinje ── */}
          <View style={{ position: "relative", marginTop: 4 }}>
            <Svg width={1} height="100%" style={tl.line} pointerEvents="none">
              <Defs>
                <SvgGrad id="timelineLine" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%"   stopColor={GOLD} stopOpacity={0.6}  />
                  <Stop offset="100%" stopColor={GOLD} stopOpacity={0.15} />
                </SvgGrad>
              </Defs>
              <SvgRect width={1} height="100%" fill="url(#timelineLine)" />
            </Svg>
            <View style={{ gap: 12 }}>
              {visitedPlaces.map((v, i) => (
                <TimelineRow
                  key={v.id}
                  visit={v}
                  index={i}
                  onPress={() => router.push(`/place/${v.place.id}` as any)}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Tomt läge ────────────────────────────────────────────────────────────────
function EmptyState({ onExplore }: { onExplore: () => void }) {
  return (
    <View style={{ position: "relative" }}>
      <Svg width={1} height="100%" style={es.line} pointerEvents="none">
        <Defs>
          <SvgGrad id="emptyLine" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%"   stopColor={GOLD} stopOpacity={0.5}  />
            <Stop offset="100%" stopColor={GOLD} stopOpacity={0.05} />
          </SvgGrad>
        </Defs>
        <SvgRect width={1} height="100%" fill="url(#emptyLine)" />
      </Svg>
      <View style={es.dot} />
      <View style={es.card}>
        <View pointerEvents="none" style={es.innerHighlight} />
        <View style={es.iconBox}>
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgGrad id="emptyIconGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%"   stopColor={GOLD} stopOpacity={0.14} />
                <Stop offset="100%" stopColor={GOLD} stopOpacity={0.06} />
              </SvgGrad>
            </Defs>
            <SvgRect width="100%" height="100%" fill="url(#emptyIconGrad)" />
          </Svg>
          <Compass size={18} color={GOLD} strokeWidth={1.5} />
        </View>
        <Text style={es.title}>Din Österlenresa börjar här</Text>
        <Text style={es.desc}>
          När du checkar in på platser dyker de upp i din personliga tidslinje.
        </Text>
        <TouchableOpacity style={es.btn} onPress={onExplore} activeOpacity={0.85}>
          <Text style={es.btnText}>Utforska platser</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── En rad i tidslinjen ────────────────────────────────────────────────────────
function TimelineRow({
  visit,
  index,
  onPress,
}: {
  visit: VisitedPlace;
  index: number;
  onPress: () => void;
}) {
  const animate = index < 15;
  const enter = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animate) return;
    Animated.timing(enter, {
      toValue: 1,
      duration: 260,
      delay: index * 30,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  const onPressIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();

  const imageUrl = visit.place.image_url?.split(",")[0]?.trim() || null;

  return (
    <View style={{ paddingLeft: 24 }}>
      <View style={tl.dot} />
      <Animated.View
        style={{
          opacity: enter,
          transform: [
            { translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
            { scale },
          ],
        }}
      >
        <Pressable style={tl.row} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
          <View pointerEvents="none" style={tl.innerHighlight} />
          <View style={tl.dateCol}>
            <Text style={tl.date}>{format(new Date(visit.visited_at), "d MMM yyyy", { locale: sv })}</Text>
            <Text style={tl.time}>{format(new Date(visit.visited_at), "HH.mm", { locale: sv })}</Text>
          </View>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={tl.thumb} />
          ) : (
            <View style={[tl.thumb, tl.thumbPlaceholder]}>
              <MapPin size={16} color={GOLD} strokeWidth={1.5} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={tl.name} numberOfLines={2}>{visit.place.name}</Text>
            {!!visit.place.categories && (
              <Text style={tl.cat} numberOfLines={1}>{visit.place.categories}</Text>
            )}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────
const hd = StyleSheet.create({
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
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

const sk = StyleSheet.create({
  box: { height: 80, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)" },
});

const hc = StyleSheet.create({
  card: {
    borderRadius: 16, padding: 20, marginBottom: 20,
    overflow: "hidden",
    backgroundColor: CARD,
    borderWidth: 0.5, borderColor: "rgba(197,160,89,0.22)",
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 20, elevation: 5,
  },
  glow: { position: "absolute", top: -20, right: -20 },
  innerHighlight: {
    position: "absolute", top: 0, left: 0, right: 0, height: "40%",
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderTopWidth: 1, borderLeftWidth: 1, borderColor: "rgba(255,255,255,0.04)",
  },
  eyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: GOLD, letterSpacing: 1.8, textTransform: "uppercase" },
  headline: { fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 20, color: FG, marginTop: 4, lineHeight: 25 },
  metaRow: { flexDirection: "row", gap: 16, marginTop: 12 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.65)" },
  milestoneRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 16,
  },
  milestoneLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.55)" },
  milestoneValue: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, color: GOLD,
    fontVariant: ["tabular-nums"],
  },
  track: {
    height: 1, borderRadius: 999, backgroundColor: "rgba(197,160,89,0.12)",
    marginTop: 6, overflow: "hidden",
  },
  fillWrap: { height: "100%", borderRadius: 999, overflow: "hidden" },
});

const tl = StyleSheet.create({
  line: { position: "absolute", left: 5, top: 8, bottom: 8 },
  dot: {
    position: "absolute", left: 0, top: 20,
    width: 11, height: 11, borderRadius: 5.5,
    backgroundColor: GOLD,
    shadowColor: GOLD, shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 16,
    borderRadius: 16, padding: 16,
    backgroundColor: CARD,
    borderWidth: 1, borderColor: "rgba(197,160,89,0.12)",
    overflow: "hidden",
  },
  innerHighlight: {
    position: "absolute", top: 0, left: 0, right: 0, height: "50%",
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderTopWidth: 1, borderLeftWidth: 1, borderColor: "rgba(255,255,255,0.03)",
  },
  dateCol: { width: 72 },
  date: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: FG },
  time: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 4 },
  thumb: { width: 64, height: 64, borderRadius: 12 },
  thumbPlaceholder: { backgroundColor: "rgba(197,160,89,0.08)", alignItems: "center", justifyContent: "center" },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: FG, lineHeight: 18 },
  cat: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 4 },
});

const es = StyleSheet.create({
  line: { position: "absolute", left: 5, top: 32, bottom: 40 },
  dot: {
    position: "absolute", left: 0, top: 24,
    width: 11, height: 11, borderRadius: 5.5,
    backgroundColor: GOLD,
    shadowColor: GOLD, shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  card: {
    marginLeft: 24, borderRadius: 16, padding: 24,
    backgroundColor: CARD,
    borderWidth: 1, borderColor: "rgba(197,160,89,0.18)",
    overflow: "hidden",
  },
  innerHighlight: {
    position: "absolute", top: 0, left: 0, right: 0, height: "35%",
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderTopWidth: 1, borderLeftWidth: 1, borderColor: "rgba(255,255,255,0.03)",
  },
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    borderWidth: 0.5, borderColor: "rgba(197,160,89,0.35)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 12, overflow: "hidden",
  },
  title: { fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 17, color: FG },
  desc: {
    fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED,
    lineHeight: 19.5, marginTop: 4,
  },
  btn: {
    alignSelf: "flex-start", marginTop: 16,
    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 0.5, borderColor: "rgba(197,160,89,0.35)",
    backgroundColor: "rgba(197,160,89,0.06)",
  },
  btnText: { fontFamily: "Inter_500Medium", fontSize: 12, color: GOLD },
});
