/**
 * Aktiv erbjudande-vy — personalens verifieringsskärm.
 *
 * Helskärm som låser appen i 60 sekunder. Inget går att göra utom att visa
 * skärmen för kassören: vad erbjudandet är, en rörlig timerring med sekunderna stort,
 * samt medlemskortets baksida med live-klocka som äkthetsbevis. Personalen jämför den
 * klockan med sin egen: en inspelning visar en gammal tid.
 *
 * Visas av ActiveOfferHost (rotlayouten), inte av panelen, så den överlever en omstart.
 * Nedräkningen utgår ALLTID från activatedAt, aldrig från en lokal räknare —
 * annars skulle tiden pausas när appen läggs i bakgrunden och erbjudandet
 * kunna hållas aktivt hur länge som helst.
 *
 * Skärmen är alltid svart (även i ljust läge) och alltid på svenska: den är till för personalen.
 */
import { useEffect, useMemo, useState } from "react";
import { View, Text, Image, StyleSheet, Animated as RNAnimated, Easing as RNEasing } from "react-native";
import Animated, {
  Easing, FadeIn, ZoomIn, useDerivedValue, useSharedValue, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { Clock } from "lucide-react-native";
import { Canvas, Circle, Group, Path, Rect, RadialGradient, LinearGradient, Skia, vec } from "@shopify/react-native-skia";
import { MemberCard } from "@/components/MemberCard";
import { useProfile } from "@/hooks/useProfile";
import { useAvatarUrl, useCardPhotoUrl } from "@/hooks/useAvatarUrl";
import { useAuth } from "@/hooks/useAuth";
import { ACTIVE_SECS, splitSavings } from "@/lib/offers";
import { preventScreenCapture } from "@/lib/screenCapture";
import { findCategory, withAlpha } from "@/theme/categories";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const GOLD    = "#C5A059";
const GOLD_LT = "#E8C674";
const GOLD_HI = "#F2D88A";
const WARN    = "#F59E0B"; // sista sekunderna
const FG      = "#F5F1E8";

const RING     = 210;
const STROKE   = 8;
const RADIUS   = (RING - STROKE) / 2;
const WARN_SECS = 10;
const EXPIRED_HOLD_MS = 1600; // "Utgånget" visas en stund innan skärmen försvinner

/** Ringens bana: en hel cirkel som Skia ritar en del av (start/end 0–1) */
const RING_PATH = Skia.Path.Make();
RING_PATH.addCircle(RING / 2, RING / 2, RADIUS);

function secsLeft(activatedAt: number): number {
  const elapsed = (Date.now() - activatedAt) / 1000;
  return Math.max(0, Math.ceil(ACTIVE_SECS - elapsed));
}

export function ActiveOfferView({
  visible,
  activatedAt,
  placeName,
  placeLogoUrl,
  dealText,
  category,
  savingsLabel,
  onClose,
}: {
  visible: boolean;
  /** Tidsstämpel (ms) när erbjudandet aktiverades */
  activatedAt: number;
  placeName: string;
  placeLogoUrl: string | null;
  dealText: string;
  category?: string | null;
  savingsLabel?: string | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const avatarUrl = useAvatarUrl();
  const cardPhotoUrl = useCardPhotoUrl();

  const [remaining, setRemaining] = useState(() => secsLeft(activatedAt));
  const expired = remaining <= 0;
  const pulseAnim = useMemo(() => new RNAnimated.Value(0), []);
  const tint = findCategory(category ?? null)?.screen ?? GOLD;
  const parts = savingsLabel ? splitSavings(savingsLabel) : null;

  // Nedräkning — läser klockan, räknar inte själv
  useEffect(() => {
    if (!visible) return;
    setRemaining(secsLeft(activatedAt));
    const id = setInterval(() => {
      const left = secsLeft(activatedAt);
      setRemaining(left);
      if (left <= 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [visible, activatedAt]);

  // Tiden är slut: "Utgånget" står kvar en stund så personalen hinner se det, sedan försvinner skärmen
  useEffect(() => {
    if (!visible || !expired) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    const id = setTimeout(onClose, EXPIRED_HOLD_MS);
    return () => clearTimeout(id);
  }, [visible, expired]);

  // En bekräftande vibration när skärmen visas för första gången (inte när den öppnas igen efter en omstart)
  useEffect(() => {
    if (visible && secsLeft(activatedAt) >= ACTIVE_SECS - 3) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [visible]);

  // Skärmdumpar och skärminspelning stängs av så länge skärmen visas (kräver ett bygge med expo-screen-capture)
  useEffect(() => {
    if (!visible) return;
    return preventScreenCapture();
  }, [visible]);

  // Ringen töms jämnt över den tid som faktiskt återstår, på UI-tråden
  const progress = useSharedValue(1);
  useEffect(() => {
    if (!visible) return;
    const leftMs = Math.max(0, activatedAt + ACTIVE_SECS * 1000 - Date.now());
    progress.value = leftMs / (ACTIVE_SECS * 1000);
    progress.value = withTiming(0, { duration: leftMs, easing: Easing.linear });
  }, [visible, activatedAt]);
  const ringEnd = useDerivedValue(() => progress.value);

  // Pulserande prick + "AKTIVT ERBJUDANDE"
  useEffect(() => {
    if (!visible) return;
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulseAnim, { toValue: 1, duration: 800, easing: RNEasing.inOut(RNEasing.quad), useNativeDriver: true }),
        RNAnimated.timing(pulseAnim, { toValue: 0, duration: 800, easing: RNEasing.inOut(RNEasing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible]);
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "Medlem";
  const memberSince = profile?.created_at
    ? format(new Date(profile.created_at), "MMMM yyyy", { locale: sv })
    : null;

  if (!visible) return null;

  // De sista sekunderna blir ringen och siffran bärnstensfärgade
  const warn = !expired && remaining <= WARN_SECS;
  const ringGradient = warn ? [WARN, WARN] : [GOLD_HI, GOLD];

  return (
    <Animated.View
      entering={FadeIn.duration(260)}
      style={[a.screen, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
    >
      {/* Skärmen är alltid svart, så statusfältet ska alltid vara ljust */}
      <StatusBar style="light" />

      {/* Bakgrund i Skia: kategorins färg lyser svagt uppifrån, guld bakom ringen */}
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Rect x={0} y={0} width={4000} height={4000}>
          <RadialGradient c={vec(200, 0)} r={420} colors={[withAlpha(tint, 0.32), withAlpha(tint, 0)]} />
        </Rect>
        <Rect x={0} y={0} width={4000} height={4000}>
          <RadialGradient c={vec(200, 400)} r={280} colors={["rgba(197,160,89,0.12)", "rgba(197,160,89,0)"]} />
        </Rect>
      </Canvas>

      {/* ── Vad erbjudandet är ── */}
      <View style={a.identity}>
        <View style={a.logoWrap}>
          {placeLogoUrl ? (
            <Image source={{ uri: placeLogoUrl }} style={a.logo} resizeMode="cover" />
          ) : (
            <Text style={a.logoFallback}>{placeName.charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <Text style={a.placeName} numberOfLines={1}>{placeName}</Text>

        <View style={a.statusRow}>
          <RNAnimated.View style={[a.pulseDot, { opacity: pulseOpacity }, expired && { backgroundColor: WARN }]} />
          <Text style={[a.statusLabel, expired && { color: WARN }]}>
            {expired ? "UTGÅNGET" : "AKTIVT ERBJUDANDE"}
          </Text>
        </View>

        <Text style={a.dealText} numberOfLines={2}>{dealText}</Text>
        {parts && (
          <View style={a.savingsRow}>
            {!!parts.before && <Text style={a.savingsSmall}>{parts.before}</Text>}
            <Text style={a.savingsBig}>{parts.big}</Text>
            {!!parts.after && <Text style={a.savingsSmall}>{parts.after}</Text>}
          </View>
        )}
      </View>

      {/* ── Timerring med sekunderna stort i mitten ── */}
      <Animated.View entering={ZoomIn.springify().damping(15).delay(120)} style={a.ringWrap}>
        <Canvas style={{ width: RING, height: RING }}>
          {/* Spår */}
          <Circle cx={RING / 2} cy={RING / 2} r={RADIUS} style="stroke" strokeWidth={STROKE} color="rgba(255,255,255,0.07)" />
          {/* Skenet bakom ringen */}
          <Circle cx={RING / 2} cy={RING / 2} r={RADIUS + 20}>
            <RadialGradient
              c={vec(RING / 2, RING / 2)}
              r={RADIUS + 20}
              colors={[warn ? "rgba(245,158,11,0.16)" : "rgba(232,198,116,0.12)", "rgba(0,0,0,0)"]}
            />
          </Circle>
          {/* Förloppet: startar högst upp och töms medurs */}
          <Group origin={vec(RING / 2, RING / 2)} transform={[{ rotate: -Math.PI / 2 }]}>
            <Path path={RING_PATH} style="stroke" strokeWidth={STROKE} strokeCap="round" start={0} end={ringEnd}>
              <LinearGradient start={vec(0, 0)} end={vec(RING, RING)} colors={ringGradient} />
            </Path>
          </Group>
        </Canvas>
        <View style={a.ringCenter} pointerEvents="none">
          <Text style={[a.seconds, warn && { color: WARN }]}>{remaining}</Text>
          <Text style={a.secondsLabel}>SEKUNDER KVAR</Text>
        </View>
      </Animated.View>

      {/* ── Kontrollen personalen gör ── */}
      <View style={a.verifyChip}>
        <Clock size={14} color={GOLD_LT} strokeWidth={2} />
        <Text style={a.verify}>Kontrollera att klockan på kortet stämmer med din egen</Text>
      </View>

      {/* ── Medlemskortets baksida = äkthetsbeviset ── */}
      <View style={a.cardWrap}>
        <MemberCard
          showBackOnly
          displayName={displayName}
          isMember
          memberSince={memberSince}
          cardColor={profile?.card_color}
          avatarUrl={avatarUrl}
          profileImageUrl={cardPhotoUrl}
          onBuyPress={() => {}}
        />
      </View>
    </Animated.View>
  );
}

const a = StyleSheet.create({
  // Överlägg ovanpå hela appen (monteras av ActiveOfferHost i rotlayouten) och
  // täcker allt, inklusive panelen och navigeringen
  screen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    backgroundColor: "#000",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  identity: { alignItems: "center", gap: 5 },
  logoWrap: {
    width: 60, height: 60, borderRadius: 30,
    overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(230,199,122,0.45)",
    backgroundColor: "#141416",
    alignItems: "center", justifyContent: "center",
    marginBottom: 6,
  },
  logo: { width: "100%", height: "100%", transform: [{ scale: 1.2 }] },
  logoFallback: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 24, color: GOLD_LT },
  placeName: { fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: -0.2, color: FG },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD_LT },
  statusLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: GOLD_LT, letterSpacing: 2.8 },
  dealText: {
    fontFamily: "Montserrat_700Bold", fontSize: 21, letterSpacing: -0.4, lineHeight: 27, color: "#FFFFFF",
    textAlign: "center", marginTop: 6,
  },
  savingsRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 2 },
  savingsBig: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 30, color: GOLD_LT },
  savingsSmall: { fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(255,255,255,0.75)" },

  ringWrap: { alignItems: "center", justifyContent: "center", marginTop: 22 },
  ringCenter: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  seconds: {
    fontFamily: "Montserrat_700Bold", fontSize: 64, lineHeight: 70, color: GOLD_LT,
    fontVariant: ["tabular-nums"],
  },
  secondsLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 2.4, color: "rgba(255,255,255,0.5)", marginTop: -2 },

  // Personalens kontroll: en inspelning visar en gammal tid, som inte stämmer med deras egen klocka
  verifyChip: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    backgroundColor: "rgba(232,198,116,0.10)", borderWidth: 1, borderColor: "rgba(232,198,116,0.28)",
  },
  verify: { fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.85)" },

  cardWrap: { marginTop: "auto" as any, width: "100%", alignItems: "center" },
});
