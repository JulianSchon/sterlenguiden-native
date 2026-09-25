/**
 * MemberCard — Österlenpassets medlemskort.
 *
 * Appens viktigaste UI-element. Flipbart 3D-kort: framsidan visar namn och
 * variant-design, baksidan är personalens verifiering (roterande guld som inte
 * går att skärmdumpa trovärdigt, live-klocka och verifikationsfoto).
 *
 * Kortet ritas i den bredd man ber om (width) och alla mått följer med, så ett
 * mindre kort ritas skarpt i stället för att förminskas i efterhand.
 *
 * Låg i app/(tabs)/profile.tsx tidigare — utflyttad hit för att aktiva
 * erbjudande-vyn ska kunna visa samma baksida.
 */
import { useState, useRef, useEffect, useMemo, type ComponentType, type ReactNode } from "react";
import {
  View, Text, Image, ImageBackground, TouchableOpacity, StyleSheet,
  Dimensions, Animated, Platform, Easing,
} from "react-native";
import Svg, {
  Defs,
  LinearGradient as SvgGrad,
  RadialGradient as SvgRadial,
  Stop,
  Rect as SvgRect,
} from "react-native-svg";
import { Crown, Radio, Camera } from "lucide-react-native";
import { cardColors, getVariant } from "@/lib/cardVariants";
import { initialsOf, toneOnTone } from "@/lib/color";
import { AvatarRing } from "@/components/profile/AvatarRing";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const { width: SW } = Dimensions.get("window");
/** Kortets standardstorlek (hela skärmbredden minus sidomarginaler) */
export const CARD_W = SW - 32;
export const CARD_H = 200;

// Fallback-färger för icke-members
const NON_MEMBER_COLORS = {
  text:           "rgba(255,255,255,0.30)",
  muted:          "rgba(255,255,255,0.20)",
  accent:         "rgba(200,185,160,0.45)",
  avatarBorder:   "rgba(200,185,160,0.30)",
  avatarBg:       "rgba(255,255,255,0.05)",
  avatarInitials: "rgba(255,255,255,0.30)",
  border:         "rgba(200,185,160,0.08)",
  sweep:          "rgba(255,255,255,0.02)",
};

// ─── MemberCard ───────────────────────────────────────────────────────────────
export function MemberCard({
  displayName,
  isMember,
  memberSince,
  cardColor,
  avatarUrl,
  circleColor,
  avatarRing,
  ringComponent: Ring = AvatarRing,
  profileImageUrl,
  onBuyPress,
  showBackOnly = false,
  startOnBack = false,
  disableFlip = false,
  onCardPress,
  width = CARD_W,
}: {
  displayName: string;
  isMember: boolean;
  memberSince: string | null;
  cardColor?: string | null;
  avatarUrl?: string | null;
  /** Användarens valda cirkelfärg när ingen profilbild finns */
  circleColor?: string | null;
  /** Profilringen runt profilbilden (se src/lib/avatarRings.ts) */
  avatarRing?: string | null;
  /** Eget ringlager i stället för AvatarRing, för sidor där ringen ska kunna bytas utan omritning */
  ringComponent?: ComponentType<{ ring?: string | null; size: number; children: ReactNode }>;
  profileImageUrl?: string | null;
  onBuyPress: () => void;
  /** Låser kortet till baksidan utan flip — används av aktiva erbjudande-vyn,
   *  där kortet bara är personalens verifieringsunderlag. */
  showBackOnly?: boolean;
  /** Visar baksidan först men går fortfarande att vända (bara för medlemmar). */
  startOnBack?: boolean;
  /** Låser kortet till framsidan — inget flip vid tryck för medlemmar.
   *  Används där kortet bara ska visas (t.ex. Förmåner-sidans hero),
   *  inte fungera som verifieringsyta. onBuyPress gäller fortfarande
   *  för icke-medlemmar (samma "tryck för att aktivera"-flöde som vanligt). */
  disableFlip?: boolean;
  /** Tryck när disableFlip är på och man ÄR medlem — t.ex. navigera till profilen. */
  onCardPress?: () => void;
  /** Kortets bredd; höjden och alla mått följer med. */
  width?: number;
}) {
  const k = width / CARD_W;
  const cardW = width;
  const cardH = CARD_H * k;
  const mc = useMemo(() => createStyles(k, cardW, cardH), [k, cardW, cardH]);
  // Diagonal storlek för roterande gradient-lager (täcker hörnen vid rotation)
  const gradSize = Math.ceil(Math.sqrt(cardW * cardW + cardH * cardH)) + 4;

  // flipAnim 1 = baksidan vänd mot betraktaren (backRotate landar på 360°)
  const flipAnim  = useRef(new Animated.Value(showBackOnly || (startOnBack && isMember) ? 1 : 0)).current;
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const [isFlipped, setIsFlipped]           = useState(showBackOnly || (startOnBack && isMember));
  const [time, setTime]                     = useState(new Date());
  const gradRotAnim                         = useRef(new Animated.Value(0)).current;

  // Variant + färgpalett
  const variant = isMember ? getVariant(cardColor) : null;
  const hasPng  = !!(variant?.bgImage);          // alla varianter med bgImage får PNG
  const colors  = variant ? cardColors(variant) : NON_MEMBER_COLORS;
  const baseBg  = isMember ? (variant?.bg ?? "#0A0A0A") : "#110D07";

  // Medlemskapet laddas efter första bilden; då ska kortet ändå landa på baksidan
  useEffect(() => {
    if (!startOnBack || !isMember) return;
    flipAnim.setValue(1);
    setIsFlipped(true);
  }, [startOnBack, isMember]);

  // Light sweep (member only)
  useEffect(() => {
    if (!isMember) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweepAnim, { toValue: 1, duration: 4500, useNativeDriver: true }),
        Animated.delay(6500),
        Animated.timing(sweepAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isMember]);

  const sweepX = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-cardW, cardW * 1.5],
  });

  // 3D flip
  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const backRotate  = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });

  const handlePress = () => {
    if (!isMember) { onBuyPress(); return; }
    if (disableFlip) { onCardPress?.(); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const toVal = isFlipped ? 0 : 1;
    Animated.spring(flipAnim, { toValue: toVal, friction: 8, tension: 10, useNativeDriver: true }).start();
    setTimeout(() => setIsFlipped((v) => !v), 350);
  };

  // Roterande guldgradient — körs alltid (oavsett flip) så att baksidan
  // aldrig ser gradienten "hoppa" till 0° när kortet vänds
  useEffect(() => {
    const spin = () => {
      gradRotAnim.setValue(0);
      Animated.timing(gradRotAnim, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) spin();
      });
    };
    spin();
    return () => gradRotAnim.stopAnimation();
  }, []);

  const gradRotate = gradRotAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Live clock — only when back is showing
  useEffect(() => {
    if (!isFlipped) return;
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, [isFlipped]);

  // ── Front ─────────────────────────────────────────────────────────────────
  const Front = (
    <Animated.View
      style={[
        mc.card,
        { transform: [{ perspective: 1200 }, { rotateY: frontRotate }] },
      ]}
    >
      {/* ── Bakgrund ─────────────────────────────────────── */}
      {/* Solid base (alltid) */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: baseBg }]} />

      {/* PNG-bakgrund – varianter med bgImage */}
      {isMember && hasPng && variant?.bgImage && (
        <ImageBackground
          source={variant.bgImage}
          style={StyleSheet.absoluteFill}
          imageStyle={{ borderRadius: 16 * k }}
          resizeMode="cover"
        />
      )}

      {/* SVG-gradient – alla andra varianter */}
      {isMember && !hasPng && variant && (
        <Svg style={StyleSheet.absoluteFill} width={cardW} height={cardH}>
          <Defs>
            <SvgGrad id="fg" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={variant.bg} />
              <Stop offset="100%" stopColor={variant.bg2} />
            </SvgGrad>
            {variant.glow ? (
              <SvgRadial id="fr" cx="75%" cy="25%" rx="65%" ry="65%">
                <Stop offset="0%" stopColor={variant.glow} stopOpacity={1} />
                <Stop offset="100%" stopColor={variant.glow} stopOpacity={0} />
              </SvgRadial>
            ) : null}
          </Defs>
          <SvgRect x={0} y={0} width={cardW} height={cardH} fill="url(#fg)" />
          {variant.glow ? (
            <SvgRect x={0} y={0} width={cardW} height={cardH} fill="url(#fr)" />
          ) : null}
        </Svg>
      )}

      {/* Shimmer-sweep — gradient transparent→vit→transparent, inga hårda kanter */}
      {isMember && (
        <Animated.View
          style={[mc.sweep, { transform: [{ translateX: sweepX }, { skewX: "-20deg" }] }]}
          pointerEvents="none"
        >
          <Svg width={160 * k} height={cardH} style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgGrad id="shimmer" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0%"   stopColor="#fff" stopOpacity={0}    />
                <Stop offset="35%"  stopColor="#fff" stopOpacity={0.07} />
                <Stop offset="50%"  stopColor="#fff" stopOpacity={0.13} />
                <Stop offset="65%"  stopColor="#fff" stopOpacity={0.07} />
                <Stop offset="100%" stopColor="#fff" stopOpacity={0}    />
              </SvgGrad>
            </Defs>
            <SvgRect x={0} y={0} width={160 * k} height={cardH} fill="url(#shimmer)" />
          </Svg>
        </Animated.View>
      )}

      {/* Kortinnehåll */}
      <View style={mc.content}>
        {/* Övre rad: avatar + Radio-ikon */}
        <View style={mc.topRow}>
          <View style={[mc.avatarShadow, { shadowColor: "#000" }]}>
            <Ring ring={avatarRing} size={64 * k}>
              <View style={mc.avatarRing}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={mc.avatarImg} />
                ) : (
                  <View style={[mc.avatarInner, { backgroundColor: circleColor ?? colors.avatarBg }]}>
                    <Text style={[mc.avatarInitials, { color: circleColor ? toneOnTone(circleColor) : colors.avatarInitials }]}>
                      {initialsOf(displayName)}
                    </Text>
                  </View>
                )}
              </View>
            </Ring>
          </View>
          <Radio size={20 * k} color={colors.accent} strokeWidth={1.5} style={{ marginTop: 4 * k }} />
        </View>

        {/* Nedre rad: namn, datum, pass-etikett */}
        <View style={{ gap: 4 * k }}>
          {/* Namn — ShareTechMono, text-shadow anpassad till kortets ljusnivå */}
          <Text style={[
            mc.name,
            { color: colors.text },
            variant?.light
              ? { textShadowColor: "rgba(255,255,255,0.50)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }
              : { textShadowColor: "rgba(0,0,0,0.50)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
          ]} numberOfLines={1}>
            {displayName.toUpperCase()}
          </Text>
          {isMember && memberSince ? (
            <Text style={[mc.since, { color: colors.muted }]}>Sedan {memberSince}</Text>
          ) : null}
          {isMember ? (
            <View style={mc.passRow}>
              <Crown size={12 * k} color={colors.accent} strokeWidth={2} />
              <Text style={[mc.passLabel, { color: colors.accent }]}>ÖSTERLENPASSET</Text>
            </View>
          ) : (
            <Text style={mc.ctaHint}>Tryck för att aktivera →</Text>
          )}
        </View>
      </View>

    </Animated.View>
  );

  // ── Back ──────────────────────────────────────────────────────────────────
  const clockStr = format(time, "HH:mm:ss", { locale: sv });

  const Back = (
    <Animated.View
      style={[
        mc.card,
        { transform: [{ perspective: 1200 }, { rotateY: backRotate }] },
      ]}
    >
      {/* ── Roterande guldgradient — GPU-driven, native driver ── */}
      {/* Kvadratisk yta (diagonalen) roterar bakom kortet */}
      <Animated.View
        style={{
          position: "absolute",
          width: gradSize,
          height: gradSize,
          top: (cardH - gradSize) / 2,
          left: (cardW - gradSize) / 2,
          transform: [{ rotate: gradRotate }],
        }}
        pointerEvents="none"
      >
        <Svg width={gradSize} height={gradSize}>
          <Defs>
            <SvgGrad id="gold_bg" x1="0" y1="0.5" x2="1" y2="0.5">
              <Stop offset="0%"   stopColor="#D4AF37" />
              <Stop offset="33%"  stopColor="#B8860B" />
              <Stop offset="67%"  stopColor="#8B6914" />
              <Stop offset="100%" stopColor="#D4AF37" />
            </SvgGrad>
          </Defs>
          <SvgRect x={0} y={0} width={gradSize} height={gradSize} fill="url(#gold_bg)" />
        </Svg>
      </Animated.View>

      {/* Subtilt highlight-lager för djup */}
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.07)" }]}
        pointerEvents="none"
      />

      {/* ── Innehåll — centrerad kolumn, alla element med samma gap ── */}
      <View style={mc.backCol}>

        <Text style={mc.liveLabel}>LIVE-VERIFIERING</Text>

        {/* Profilbild-cirkel */}
        {/* Kortfotot ändras under Österlenpasset (en gång i månaden), inte här */}
        <View style={mc.backCircle}>
          {profileImageUrl ? (
            <Image source={{ uri: profileImageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={mc.backCirclePlaceholder}>
              <Camera size={24 * k} color="rgba(0,0,0,0.60)" strokeWidth={1.5} />
              <Text style={mc.uploadText}>Foto saknas</Text>
            </View>
          )}
        </View>

        <Text style={mc.backMemberName} numberOfLines={1}>{displayName}</Text>
        <Text style={mc.liveClock}>{clockStr}</Text>

        {/* Instruktion — i flex-flödet, samma gap som övriga element */}
        <Text style={mc.liveInstruction}>Visa vid kassan • Tryck för att vända</Text>

      </View>

    </Animated.View>
  );

  return (
    <View style={{ width: cardW, height: cardH }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={1}
        disabled={showBackOnly}
        style={{ width: cardW, height: cardH }}
      >
        {!showBackOnly && Front}
        {isMember && Back}
      </TouchableOpacity>
    </View>
  );
}

/** Alla mått är ritade för standardbredden (k = 1) och skalas med k. */
const createStyles = (k: number, cardW: number, cardH: number) => StyleSheet.create({
  card: {
    position: "absolute",
    width: cardW, height: cardH,
    borderRadius: 16 * k,
    overflow: "hidden",
    backfaceVisibility: "hidden",
  },

  sweep: {
    position: "absolute", top: 0, bottom: 0, width: 160 * k,
    // Ingen backgroundColor — SVG-gradienten inuti sköter färgen
  },

  // Kortinnehåll
  content: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    padding: 24 * k,
    justifyContent: "space-between",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  // Avatar
  avatarShadow: {
    borderRadius: 32 * k,
    shadowOffset: { width: 0, height: 6 * k },
    shadowOpacity: 0.70,
    shadowRadius: 18 * k,
    elevation: 10,
  },
  avatarRing: {
    width: 64 * k, height: 64 * k, borderRadius: 32 * k,
    overflow: "hidden",
  },
  avatarImg: { width: 64 * k, height: 64 * k },
  avatarInner: {
    width: 64 * k, height: 64 * k,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  avatarInitials: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20 * k,
    color: "#F5F1E8",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Text — kortfonter
  name: {
    fontFamily: "ShareTechMono_400Regular",
    fontSize: 18 * k,
    color: "rgba(255,255,255,0.95)",
    letterSpacing: 2.5 * k,
    textShadowColor: "rgba(0,0,0,0.40)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  since: {
    fontFamily: "ShareTechMono_400Regular",
    fontSize: 11 * k,
    color: "rgba(255,255,255,0.40)",
    letterSpacing: 0.8 * k,
    textShadowColor: "rgba(0,0,0,0.30)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  passRow: { flexDirection: "row", alignItems: "center", gap: 5 * k },
  passLabel: {
    fontFamily: "ShareTechMono_400Regular",
    fontSize: 11 * k,
    color: "#E8C547",
    letterSpacing: 1.2 * k,
    textShadowColor: "rgba(0,0,0,0.30)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  ctaHint: {
    fontFamily: "ShareTechMono_400Regular",
    fontSize: 11 * k,
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 0.5 * k,
  },

  // ── Back – centrerad kolumn ──────────────────────────────────────────────
  backCol: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: 8 * k, paddingHorizontal: 24 * k, paddingVertical: 10 * k,
  },
  liveLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12 * k,
    color: "rgba(0,0,0,0.70)",
    letterSpacing: 2.4 * k,
    textTransform: "uppercase",
  },
  backCircle: {
    width: 80 * k, height: 80 * k, borderRadius: 40 * k,
    borderWidth: 2 * k, borderColor: "rgba(255,255,255,0.50)",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.80)",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 8 * k, shadowOffset: { width: 0, height: 4 * k },
  },
  backCirclePlaceholder: {
    alignItems: "center", gap: 4 * k,
  },
  uploadText: {
    fontFamily: "Inter_500Medium",
    fontSize: 8 * k,
    color: "rgba(0,0,0,0.50)",
  },
  backMemberName: {
    fontFamily: "Inter_500Medium",
    fontSize: 11 * k,
    color: "rgba(0,0,0,0.60)",
    letterSpacing: 0.5 * k,
    marginTop: -4 * k,
  },
  liveClock: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 24 * k,
    fontWeight: "700",
    color: "rgba(0,0,0,0.90)",
  },
  liveInstruction: {
    fontFamily: "Inter_400Regular",
    fontSize: 10 * k,
    color: "rgba(0,0,0,0.55)",
    textAlign: "center",
    letterSpacing: 0.2 * k,
  },
});
