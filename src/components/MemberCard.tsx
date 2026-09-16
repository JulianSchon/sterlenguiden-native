/**
 * MemberCard — Österlenpassets medlemskort.
 *
 * Appens viktigaste UI-element. Flipbart 3D-kort: framsidan visar namn och
 * variant-design, baksidan är personalens verifiering (roterande guld som inte
 * går att skärmdumpa trovärdigt, live-klocka och verifikationsfoto).
 *
 * Låg i app/(tabs)/profile.tsx tidigare — utflyttad hit för att aktiva
 * erbjudande-vyn ska kunna visa samma baksida.
 */
import { useState, useRef, useEffect } from "react";
import {
  View, Text, Image, ImageBackground, TouchableOpacity, StyleSheet,
  Dimensions, Animated, Alert, Modal, Platform, Easing,
} from "react-native";
import Svg, {
  Defs,
  LinearGradient as SvgGrad,
  RadialGradient as SvgRadial,
  Stop,
  Path,
  Rect as SvgRect,
} from "react-native-svg";
import { Crown, Radio, Camera } from "lucide-react-native";
import { cardColors, getVariant } from "@/lib/cardVariants";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const { width: SW } = Dimensions.get("window");
export const CARD_W = SW - 32;
export const CARD_H = 200;

const GOLD    = "#C5A059";
const GOLD_LT = "#D4AF55";
const FG      = "#F5F1E8";
const MUTED   = "rgba(245,241,232,0.55)";
const MARK_SIZE = Math.round(CARD_H * 0.74);
// Diagonal storlek för roterande gradient-lager (täcker hörnen vid rotation)
const GRAD_SIZE = Math.ceil(Math.sqrt(CARD_W * CARD_W + CARD_H * CARD_H)) + 4;

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
// ─── NFC contactless icon ─────────────────────────────────────────────────────
function NfcIcon({ color = GOLD_LT }: { color?: string }) {
  return (
    <Svg width={18} height={22} viewBox="0 0 18 22">
      <Path d="M 2 20 A 5 5 0 0 1 7 15"
        stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeOpacity={0.45} />
      <Path d="M 2 20 A 10 10 0 0 1 12 10"
        stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeOpacity={0.70} />
      <Path d="M 2 20 A 16 16 0 0 1 18 4"
        stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeOpacity={0.95} />
    </Svg>
  );
}


// ─── MemberCard ───────────────────────────────────────────────────────────────
export function MemberCard({
  displayName,
  isMember,
  memberSince,
  cardColor,
  avatarUrl,
  profileImageUrl,
  onBuyPress,
  showBackOnly = false,
  disableFlip = false,
  onCardPress,
}: {
  displayName: string;
  isMember: boolean;
  memberSince: string | null;
  cardColor?: string | null;
  avatarUrl?: string | null;
  profileImageUrl?: string | null;
  onBuyPress: () => void;
  /** Låser kortet till baksidan utan flip — används av aktiva erbjudande-vyn,
   *  där kortet bara är personalens verifieringsunderlag. */
  showBackOnly?: boolean;
  /** Låser kortet till framsidan — inget flip vid tryck för medlemmar.
   *  Används där kortet bara ska visas (t.ex. Förmåner-sidans hero),
   *  inte fungera som verifieringsyta. onBuyPress gäller fortfarande
   *  för icke-medlemmar (samma "tryck för att aktivera"-flöde som vanligt). */
  disableFlip?: boolean;
  /** Tryck när disableFlip är på och man ÄR medlem — t.ex. navigera till profilen. */
  onCardPress?: () => void;
}) {
  // flipAnim 1 = baksidan vänd mot betraktaren (backRotate landar på 360°)
  const flipAnim  = useRef(new Animated.Value(showBackOnly ? 1 : 0)).current;
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const [isFlipped, setIsFlipped]           = useState(showBackOnly);
  const [time, setTime]                     = useState(new Date());
  const gradRotAnim                         = useRef(new Animated.Value(0)).current;
  const [showUploadModal, setShowUploadModal] = useState(false);
  const firstModalShown = useRef(false);

  // Variant + färgpalett
  const variant = isMember ? getVariant(cardColor) : null;
  const hasPng  = !!(variant?.bgImage);          // alla varianter med bgImage får PNG
  const colors  = variant ? cardColors(variant) : NON_MEMBER_COLORS;
  const baseBg  = isMember ? (variant?.bg ?? "#0A0A0A") : "#110D07";

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
    outputRange: [-CARD_W, CARD_W * 1.5],
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

  // Förstagångs-modal: ny medlem utan verifikationsbild.
  // Hoppas över i showBackOnly — en modal får aldrig poppa upp mitt i en
  // pågående erbjudandeaktivering, då personalen står och tittar på skärmen.
  useEffect(() => {
    if (showBackOnly) return;
    if (isMember && !profileImageUrl && isFlipped && !firstModalShown.current) {
      firstModalShown.current = true;
      const t = setTimeout(() => setShowUploadModal(true), 700);
      return () => clearTimeout(t);
    }
  }, [isMember, profileImageUrl, isFlipped, showBackOnly]);

  // Fotoknapp-handler
  const handlePhotoPress = () => {
    if (showBackOnly) return;
    if (profileImageUrl) {
      Alert.alert(
        "Bilden är låst 🔒",
        "Din verifikationsbild är permanent efter uppladdning. Kontakta support om du behöver ändra den.",
        [{ text: "Okej" }]
      );
      return;
    }
    setShowUploadModal(true);
  };

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
          imageStyle={{ borderRadius: 16 }}
          resizeMode="cover"
        />
      )}

      {/* SVG-gradient – alla andra varianter */}
      {isMember && !hasPng && variant && (
        <Svg style={StyleSheet.absoluteFill} width={CARD_W} height={CARD_H}>
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
          <SvgRect x={0} y={0} width={CARD_W} height={CARD_H} fill="url(#fg)" />
          {variant.glow ? (
            <SvgRect x={0} y={0} width={CARD_W} height={CARD_H} fill="url(#fr)" />
          ) : null}
        </Svg>
      )}

      {/* Shimmer-sweep — gradient transparent→vit→transparent, inga hårda kanter */}
      {isMember && (
        <Animated.View
          style={[mc.sweep, { transform: [{ translateX: sweepX }, { skewX: "-20deg" }] }]}
          pointerEvents="none"
        >
          <Svg width={160} height={CARD_H} style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgGrad id="shimmer" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0%"   stopColor="#fff" stopOpacity={0}    />
                <Stop offset="35%"  stopColor="#fff" stopOpacity={0.07} />
                <Stop offset="50%"  stopColor="#fff" stopOpacity={0.13} />
                <Stop offset="65%"  stopColor="#fff" stopOpacity={0.07} />
                <Stop offset="100%" stopColor="#fff" stopOpacity={0}    />
              </SvgGrad>
            </Defs>
            <SvgRect x={0} y={0} width={160} height={CARD_H} fill="url(#shimmer)" />
          </Svg>
        </Animated.View>
      )}

      {/* Kortinnehåll */}
      <View style={mc.content}>
        {/* Övre rad: avatar + Radio-ikon */}
        <View style={mc.topRow}>
          <View style={[mc.avatarShadow, { shadowColor: "#000" }]}>
            <View style={mc.avatarRing}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={mc.avatarImg} />
              ) : (
                <View style={[mc.avatarInner, { backgroundColor: colors.avatarBg }]}>
                  <Text style={[mc.avatarInitials, { color: colors.avatarInitials }]}>
                    {displayName.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <Radio size={20} color={colors.accent} strokeWidth={1.5} style={{ marginTop: 4 }} />
        </View>

        {/* Nedre rad: namn, datum, pass-etikett */}
        <View style={{ gap: 4 }}>
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
              <Crown size={12} color={colors.accent} strokeWidth={2} />
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
          width: GRAD_SIZE,
          height: GRAD_SIZE,
          top: (CARD_H - GRAD_SIZE) / 2,
          left: (CARD_W - GRAD_SIZE) / 2,
          transform: [{ rotate: gradRotate }],
        }}
        pointerEvents="none"
      >
        <Svg width={GRAD_SIZE} height={GRAD_SIZE}>
          <Defs>
            <SvgGrad id="gold_bg" x1="0" y1="0.5" x2="1" y2="0.5">
              <Stop offset="0%"   stopColor="#D4AF37" />
              <Stop offset="33%"  stopColor="#B8860B" />
              <Stop offset="67%"  stopColor="#8B6914" />
              <Stop offset="100%" stopColor="#D4AF37" />
            </SvgGrad>
          </Defs>
          <SvgRect x={0} y={0} width={GRAD_SIZE} height={GRAD_SIZE} fill="url(#gold_bg)" />
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
        <TouchableOpacity
          style={mc.backCircle}
          onPress={handlePhotoPress}
          activeOpacity={0.88}
        >
          {profileImageUrl ? (
            <Image source={{ uri: profileImageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={mc.backCirclePlaceholder}>
              <Camera size={24} color="rgba(0,0,0,0.60)" strokeWidth={1.5} />
              <Text style={mc.uploadText}>Ladda upp</Text>
            </View>
          )}
        </TouchableOpacity>

        <Text style={mc.backMemberName} numberOfLines={1}>{displayName}</Text>
        <Text style={mc.liveClock}>{clockStr}</Text>

        {/* Instruktion — i flex-flödet, samma gap som övriga element */}
        <Text style={mc.liveInstruction}>Visa vid kassan • Tryck för att vända</Text>

      </View>

    </Animated.View>
  );

  // ── Upload modal ───────────────────────────────────────────────────────────
  const UploadModal = (
    <Modal
      visible={showUploadModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowUploadModal(false)}
    >
      <View style={mc.modalOverlay}>
        <View style={mc.modalCard}>
          {/* Kamera-ikon i guldcirkel */}
          <View style={mc.modalIconCircle}>
            <Camera size={32} color="#0C0A02" strokeWidth={1.5} />
          </View>

          <Text style={mc.modalTitle}>Lägg till din verifikationsbild</Text>
          <Text style={mc.modalBody}>
            Personalen ser din bild direkt när du visar kortet. Bilden låses permanent efter uppladdning.
          </Text>

          {/* Primär guldknapp */}
          <TouchableOpacity
            style={mc.modalPrimaryBtn}
            activeOpacity={0.85}
            onPress={() => {
              setShowUploadModal(false);
              Alert.alert("Bilduppladdning", "Aktiveras i nästa appuppdatering — håll utkik! 📸");
            }}
          >
            <Text style={mc.modalPrimaryText}>Öppna kameran</Text>
          </TouchableOpacity>

          {/* Sekundär länk */}
          <TouchableOpacity style={mc.modalSecBtn} onPress={() => setShowUploadModal(false)}>
            <Text style={mc.modalSecText}>Gör det senare</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={{ height: CARD_H }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={1}
        disabled={showBackOnly}
        style={{ height: CARD_H }}
      >
        {!showBackOnly && Front}
        {isMember && Back}
      </TouchableOpacity>
      {!showBackOnly && UploadModal}
    </View>
  );
}

const mc = StyleSheet.create({
  card: {
    position: "absolute",
    width: CARD_W, height: CARD_H,
    borderRadius: 16,
    overflow: "hidden",
    backfaceVisibility: "hidden",
  },

  sweep: {
    position: "absolute", top: 0, bottom: 0, width: 160,
    // Ingen backgroundColor — SVG-gradienten inuti sköter färgen
  },

  // Kortinnehåll
  content: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    padding: 24,
    justifyContent: "space-between",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  // Avatar
  avatarShadow: {
    borderRadius: 32,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.70,
    shadowRadius: 18,
    elevation: 10,
  },
  avatarRing: {
    width: 64, height: 64, borderRadius: 32,
    overflow: "hidden",
  },
  avatarImg: { width: 64, height: 64 },
  avatarInner: {
    width: 64, height: 64,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  avatarInitials: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20,
    color: "#F5F1E8",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Text — kortfonter
  name: {
    fontFamily: "ShareTechMono_400Regular",
    fontSize: 18,
    color: "rgba(255,255,255,0.95)",
    letterSpacing: 2.5,
    textShadowColor: "rgba(0,0,0,0.40)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  since: {
    fontFamily: "ShareTechMono_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.40)",
    letterSpacing: 0.8,
    textShadowColor: "rgba(0,0,0,0.30)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  passRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  passLabel: {
    fontFamily: "ShareTechMono_400Regular",
    fontSize: 11,
    color: "#E8C547",
    letterSpacing: 1.2,
    textShadowColor: "rgba(0,0,0,0.30)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  ctaHint: {
    fontFamily: "ShareTechMono_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 0.5,
  },

  innerBorder: {
    position: "absolute",
    top: 8, left: 8, right: 8, bottom: 8,
    borderRadius: 10,
    borderWidth: 0.75,
  },

  // Back – Ö watermark position
  markWrap: {
    position: "absolute",
    right: -MARK_SIZE * 0.07,
    top: (CARD_H - MARK_SIZE) / 2,
  },

  // ── Back – centrerad kolumn ──────────────────────────────────────────────
  backCol: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: 8, paddingHorizontal: 24, paddingVertical: 10,
  },
  liveLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "rgba(0,0,0,0.70)",
    letterSpacing: 2.4,
    textTransform: "uppercase",
  },
  backCircle: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.50)",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.80)",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  backCirclePlaceholder: {
    alignItems: "center", gap: 4,
  },
  uploadText: {
    fontFamily: "Inter_500Medium",
    fontSize: 8,
    color: "rgba(0,0,0,0.50)",
  },
  backMemberName: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "rgba(0,0,0,0.60)",
    letterSpacing: 0.5,
    marginTop: -4,
  },
  liveClock: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 24,
    fontWeight: "700",
    color: "rgba(0,0,0,0.90)",
  },
  liveInstruction: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "rgba(0,0,0,0.55)",
    textAlign: "center",
    letterSpacing: 0.2,
  },

  // ── Upload modal ──────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center", justifyContent: "flex-end",
    paddingBottom: 40, paddingHorizontal: 20,
  },
  modalCard: {
    width: "100%", backgroundColor: "#1A1610",
    borderRadius: 28, padding: 28,
    alignItems: "center", gap: 12,
    borderWidth: 1, borderColor: "rgba(197,160,89,0.20)",
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 30, shadowOffset: { width: 0, height: -8 },
  },
  modalIconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: GOLD, alignItems: "center", justifyContent: "center",
    marginBottom: 4,
    shadowColor: GOLD, shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
  },
  modalTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20,
    color: FG,
    textAlign: "center",
  },
  modalBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    lineHeight: 19,
  },
  modalPrimaryBtn: {
    width: "100%", height: 52, borderRadius: 16,
    backgroundColor: GOLD,
    alignItems: "center", justifyContent: "center",
    marginTop: 4,
  },
  modalPrimaryText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#0C0A02",
  },
  modalSecBtn: {
    paddingVertical: 8,
  },
  modalSecText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: MUTED,
  },

  // Gamla back-stilar (används ej längre men behåller för ev. backward-compat)
  backContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  verifyLabel: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: "rgba(215,178,78,0.60)", letterSpacing: 3.5 },
  clockText:   { fontFamily: "Inter_600SemiBold", fontSize: 22, color: "rgba(215,178,78,0.92)", letterSpacing: 1.5 },
  backName:    { fontFamily: "Inter_500Medium", fontSize: 13, color: "rgba(215,178,78,0.80)", letterSpacing: 1.5 },
  backSep:     { width: 44, height: 0.75, backgroundColor: "rgba(215,178,78,0.22)", marginVertical: 4 },
  showText:    { fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(215,178,78,0.40)", letterSpacing: 0.5 },
});
