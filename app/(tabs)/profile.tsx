/**
 * Profil – native implementation
 * Spec: native-profile-spec.md
 *
 * Skärmen scrollar INTE – allt ryms på en telefonhöjd.
 * MemberCard är appens viktigaste UI-element: flipbar 3D-karta med animerade guldvågor.
 */
import { useState, useRef, useEffect } from "react";
import {
  View, Text, Image, ImageBackground, TouchableOpacity, StyleSheet,
  Dimensions, Animated, Alert,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Svg, {
  Defs, ClipPath,
  LinearGradient as SvgGrad,
  RadialGradient as SvgRadial,
  Stop, Circle, G,
  Path,
  Rect as SvgRect,
} from "react-native-svg";
import {
  Settings, Crown, ChevronRight, ClipboardList,
  BarChart3, Medal, Heart, MapPin, Bookmark, BookOpen, Radio,
} from "lucide-react-native";
import { CARD_VARIANTS, cardColors, getVariant } from "@/lib/cardVariants";
import { useProfile }   from "@/hooks/useProfile";
import { useAuth }      from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { usePlaces }    from "@/hooks/usePlaces";
import * as Haptics from "expo-haptics";
import { format }  from "date-fns";
import { sv }      from "date-fns/locale";

// ─── Constants ────────────────────────────────────────────────────────────────
const { width: SW } = Dimensions.get("window");
const CARD_W  = SW - 32;
const CARD_H  = 200;
const GOLD    = "#C5A059";
const GOLD_LT = "#D4AF55";
const CHARCOAL = "#121212";
const BG      = "#121212";
const FG      = "#F5F1E8";
const MUTED   = "rgba(245,241,232,0.55)";
const BORDER  = "rgba(255,255,255,0.10)";
const CARD_BG = "#1C1C1C";
const MARK_SIZE = Math.round(CARD_H * 0.74);

// PNG-bakgrund för Midnatt-varianten (require måste ligga här för Metro)
const CARD_BG_IMG = require("../../assets/card-bg.png");

// Felande fallback-färger för icke-members
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

// ─── Ö lettermark ─────────────────────────────────────────────────────────────
function OsterlenMark({ size, muted = false, opacity = 1, color }: {
  size: number; muted?: boolean; opacity?: number; color?: string;
}) {
  const cx   = size * 0.50;
  const cy   = size * 0.58;
  const r    = size * 0.37;
  const sw   = Math.max(size * 0.020, 1.5);
  const dotR = size * 0.054;
  const dotY = size * 0.082;
  const dx   = size * 0.138;
  const col  = muted
    ? `rgba(210,195,168,0.16)`
    : color
      ? `rgba(255,255,255,${opacity})`
      : `rgba(215,178,78,${opacity})`;
  const col2 = muted
    ? `rgba(210,195,168,0.08)`
    : color
      ? `rgba(255,255,255,${opacity * 0.48})`
      : `rgba(197,160,89,${opacity * 0.48})`;

  const h1 = [
    `M ${(cx - r * 0.86).toFixed(1)} ${(cy - r * 0.05).toFixed(1)}`,
    `Q ${cx.toFixed(1)} ${(cy - r * 0.31).toFixed(1)}`,
    `${(cx + r * 0.86).toFixed(1)} ${(cy - r * 0.13).toFixed(1)}`,
  ].join(" ");
  const h2 = [
    `M ${(cx - r * 0.73).toFixed(1)} ${(cy + r * 0.22).toFixed(1)}`,
    `Q ${(cx + r * 0.08).toFixed(1)} ${(cy + r * 0.10).toFixed(1)}`,
    `${(cx + r * 0.73).toFixed(1)} ${(cy + r * 0.28).toFixed(1)}`,
  ].join(" ");

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <ClipPath id="mc_oc">
          <Circle cx={cx} cy={cy} r={r - sw * 0.4} />
        </ClipPath>
      </Defs>
      <Circle cx={cx - dx} cy={dotY} r={dotR} fill={col} />
      <Circle cx={cx + dx} cy={dotY} r={dotR} fill={col} />
      <Circle cx={cx} cy={cy} r={r} stroke={col} strokeWidth={sw} fill="none" />
      <G clipPath="url(#mc_oc)">
        <Path d={h1} stroke={col} strokeWidth={sw * 0.88} fill="none" />
        <Path d={h2} stroke={col2} strokeWidth={sw * 0.62} fill="none" />
      </G>
    </Svg>
  );
}

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

// ─── Background SVG radial glow ───────────────────────────────────────────────
function BgGlow() {
  return (
    <Svg
      width={SW}
      height={192}
      style={{ position: "absolute", top: 0, left: 0 }}
      pointerEvents="none"
    >
      <Defs>
        <SvgRadial id="bg" cx="50%" cy="0%" rx="70%" ry="100%">
          <Stop offset="0%"   stopColor={GOLD_LT} stopOpacity={0.055} />
          <Stop offset="100%" stopColor={GOLD_LT} stopOpacity={0}    />
        </SvgRadial>
      </Defs>
      <SvgRect width="100%" height="100%" fill="url(#bg)" />
    </Svg>
  );
}

// ─── MemberCard ───────────────────────────────────────────────────────────────
function MemberCard({
  displayName,
  isMember,
  memberSince,
  cardColor,
  avatarUrl,
  onBuyPress,
}: {
  displayName: string;
  isMember: boolean;
  memberSince: string | null;
  cardColor?: string | null;
  avatarUrl?: string | null;
  onBuyPress: () => void;
}) {
  const flipAnim  = useRef(new Animated.Value(0)).current;
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const [isFlipped, setIsFlipped] = useState(false);
  const [time, setTime]           = useState(new Date());

  // Variant + färgpalett
  const variant = isMember ? getVariant(cardColor) : null;
  const hasPng  = variant?.id === "midnight"; // enda varianten med PNG hittills
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const toVal = isFlipped ? 0 : 1;
    Animated.spring(flipAnim, { toValue: toVal, friction: 8, tension: 10, useNativeDriver: true }).start();
    setTimeout(() => setIsFlipped((v) => !v), 350);
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

      {/* PNG – Midnatt */}
      {isMember && hasPng && (
        <ImageBackground
          source={CARD_BG_IMG}
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

      {/* Ljus-sweep */}
      {isMember && (
        <Animated.View style={[
          mc.sweep,
          { backgroundColor: colors.sweep, transform: [{ translateX: sweepX }, { skewX: "-18deg" }] },
        ]} />
      )}

      {/* Kortinnehåll */}
      <View style={mc.content}>
        {/* Övre rad: avatar + Radio-ikon */}
        <View style={mc.topRow}>
          <View style={[mc.avatarRing, { borderColor: colors.avatarBorder }]}>
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
          <Radio size={20} color={colors.accent} strokeWidth={1.5} style={{ marginTop: 4 }} />
        </View>

        {/* Nedre rad: namn, datum, pass-etikett */}
        <View style={{ gap: 4 }}>
          <Text style={[mc.name, { color: colors.text }]} numberOfLines={1}>
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

      {/* Inner border */}
      <View style={[mc.innerBorder, { borderColor: colors.border }]} />
    </Animated.View>
  );

  // ── Back ──────────────────────────────────────────────────────────────────
  const clockStr = format(time, "HH:mm:ss", { locale: sv });

  const Back = (
    <Animated.View
      style={[
        mc.card,
        { backgroundColor: "#0C0A02" },
        { transform: [{ perspective: 1200 }, { rotateY: backRotate }] },
      ]}
    >
      {/* Watermark Ö */}
      <View style={[mc.markWrap, { opacity: 0.18 }]} pointerEvents="none">
        <OsterlenMark size={MARK_SIZE} opacity={1} />
      </View>
      {/* Inner border */}
      <View style={[mc.innerBorder, { borderColor: "rgba(215,178,78,0.18)" }]} />
      {/* Content */}
      <View style={mc.backContent}>
        <Text style={mc.verifyLabel}>VERIFIERING</Text>
        <Text style={mc.clockText}>{clockStr}</Text>
        <Text style={mc.backName}>{displayName.toUpperCase()}</Text>
        <View style={mc.backSep} />
        <Text style={mc.showText}>Visa vid kassan</Text>
      </View>
    </Animated.View>
  );

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={1} style={{ height: CARD_H }}>
      {Front}
      {isMember && Back}
    </TouchableOpacity>
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
    position: "absolute", top: 0, bottom: 0, width: 100,
    backgroundColor: "rgba(255,235,160,0.045)",
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
  avatarRing: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 1, borderColor: "#D4AF37",
    overflow: "hidden",
  },
  avatarImg: { width: 48, height: 48 },
  avatarInner: {
    width: 48, height: 48,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  avatarInitials: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 16,
    color: "#F5F1E8",
  },

  // Text
  name: {
    fontFamily: "Inter_500Medium",
    fontSize: 18,
    color: "rgba(255,255,255,0.95)",
    letterSpacing: 2.16,
  },
  since: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    letterSpacing: 0.28,
  },
  passRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  passLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#E8C547",
    letterSpacing: 0.88,
    textTransform: "uppercase",
  },
  ctaHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 0.2,
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

  // Back
  backContent: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 6,
  },
  verifyLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    color: "rgba(215,178,78,0.60)",
    letterSpacing: 3.5,
  },
  clockText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 34,
    color: "rgba(215,178,78,0.92)",
    letterSpacing: 2.5,
  },
  backName: {
    fontFamily: "Inter_400Regular",
    fontSize: 10.5,
    color: "rgba(215,178,78,0.50)",
    letterSpacing: 2.5,
    marginTop: 2,
  },
  backSep: {
    width: 56, height: 0.75,
    backgroundColor: "rgba(215,178,78,0.22)",
    marginVertical: 4,
  },
  showText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "rgba(215,178,78,0.40)",
    letterSpacing: 0.5,
  },
});

// ─── PreviewCard ──────────────────────────────────────────────────────────────
function PreviewCard({
  icon,
  title,
  subtitle,
  images,
  emptyText,
  isPremium,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  images: (string | null)[];
  emptyText: string;
  isPremium?: boolean;
  onPress: () => void;
}) {
  const shimX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isPremium) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimX, { toValue: 1, duration: 3600, useNativeDriver: true }),
        Animated.delay(6000),
        Animated.timing(shimX, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isPremium]);

  const shimTranslate = shimX.interpolate({ inputRange: [0, 1], outputRange: [-200, 200] });

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[pc.card, isPremium && pc.cardPremium]}
    >
      {isPremium && (
        <Animated.View
          style={[pc.shimmer, { transform: [{ translateX: shimTranslate }, { skewX: "-18deg" }] }]}
        />
      )}
      {/* Icon + title */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
        {icon}
        <Text style={pc.title}>{title}</Text>
      </View>
      <Text style={pc.subtitle} numberOfLines={1}>{subtitle}</Text>

      {/* Stacked image thumbnails */}
      <View style={pc.thumbRow}>
        {images.length > 0 ? (
          images.slice(0, 5).map((uri, i) => (
            <View
              key={i}
              style={[pc.thumb, { marginLeft: i > 0 ? -10 : 0, zIndex: i + 1 }, isPremium && pc.thumbGold]}
            >
              {uri ? (
                <Image source={{ uri }} style={pc.thumbImg} />
              ) : (
                <View style={[pc.thumbImg, { backgroundColor: "#2A2A2A" }]} />
              )}
            </View>
          ))
        ) : (
          <Text style={pc.emptyText}>{emptyText}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const pc = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  cardPremium: {
    borderColor: "rgba(197,160,89,0.32)",
    shadowColor: GOLD,
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  shimmer: {
    position: "absolute",
    top: 0, bottom: 0,
    width: 60,
    backgroundColor: "rgba(255,235,150,0.08)",
  },
  title:    { fontFamily: "Inter_600SemiBold", fontSize: 13, color: FG },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 10.5, color: "rgba(255,255,255,0.45)", marginBottom: 12 },
  thumbRow: { flexDirection: "row", alignItems: "center", marginTop: "auto" as any },
  thumb: {
    width: 32, height: 32, borderRadius: 9,
    borderWidth: 2, borderColor: BG,
    overflow: "hidden", backgroundColor: "#333",
  },
  thumbGold: {
    shadowColor: GOLD, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  thumbImg: { width: "100%", height: "100%" },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 10.5, color: "rgba(255,255,255,0.25)" },
});

// ─── SmallButton ──────────────────────────────────────────────────────────────
function SmallButton({
  icon,
  label,
  sub,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={sb.btn}>
      <View style={sb.iconTile}>{icon}</View>
      <Text style={sb.label} numberOfLines={1}>{label}</Text>
      <Text style={sb.sub}  numberOfLines={1}>{sub}</Text>
    </TouchableOpacity>
  );
}

const sb = StyleSheet.create({
  btn: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  iconTile: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: "rgba(197,160,89,0.12)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 10,
  },
  label: { fontFamily: "Inter_500Medium", fontSize: 13, color: FG, marginBottom: 2 },
  sub:   { fontFamily: "Inter_400Regular", fontSize: 10, color: MUTED },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { data: profile }     = useProfile();
  const { data: favorites = [] } = useFavorites();
  const { data: places = [] }    = usePlaces();

  const displayName  = profile?.display_name ?? user?.email?.split("@")[0] ?? "Gäst";
  const isMember     = !!(profile?.is_member);
  const memberSince  = profile?.created_at
    ? format(new Date(profile.created_at), "MMMM yyyy", { locale: sv })
    : null;
  // Favorite places → thumbnails
  const favPlaces    = places.filter((p) => favorites.some((f) => f.place_id === p.id));
  const favImages    = favPlaces.slice(0, 5).map((p) => p.logo_url ?? (p.image_url?.split(",")[0].trim() ?? null));
  const favCount     = favPlaces.length;

  // Offer images (placeholder until business_stories hook exists)
  const offerImages  = places
    .filter((p) => p.image_url)
    .slice(0, 5)
    .map((p) => p.image_url?.split(",")[0].trim() ?? null);

  const safeTop    = Math.max(insets.top, 44);
  const safeBotPad = Math.max(insets.bottom, 6) + 56;

  const handleBuyPress = () => {
    // TODO: Navigate to paywall when built
    Alert.alert("Österlenpasset", "Köpflödet öppnas snart!", [{ text: "OK" }]);
  };

  const handleSignOut = () => {
    Alert.alert("Logga ut", "Är du säker?", [
      { text: "Avbryt", style: "cancel" },
      { text: "Logga ut", style: "destructive", onPress: signOut },
    ]);
  };

  return (
    <View style={[s.screen, { paddingTop: safeTop + 8, paddingBottom: safeBotPad }]}>
      {/* Background glow */}
      <BgGlow />

      {/* ── Title row ─────────────────────────────────────── */}
      <View style={s.titleRow}>
        <View>
          <Text style={s.title}>Min Profil</Text>
          <Text style={s.titleSub}>Varje plats. Varje minne.</Text>
        </View>
        <TouchableOpacity
          style={s.gearBtn}
          onPress={() => router.push("/settings" as any)}
        >
          <Settings size={20} color={MUTED} strokeWidth={1.75} />
        </TouchableOpacity>
      </View>

      {/* ── MemberCard ────────────────────────────────────── */}
      <View style={{ marginBottom: 16 }}>
        <MemberCard
          displayName={displayName}
          isMember={isMember}
          memberSince={memberSince}
          cardColor={profile?.card_color}
          avatarUrl={(profile as any)?.avatar_url ?? null}
          onBuyPress={handleBuyPress}
        />
      </View>

      {/* ── PreviewCards (Favoriter + Förmåner) ──────────── */}
      <View style={s.row}>
        <PreviewCard
          icon={<Heart size={14} color={GOLD} strokeWidth={2} />}
          title="Favoriter"
          subtitle={favCount > 0 ? `${favCount} sparade platser` : "Dina sparade guldkorn"}
          images={favImages}
          emptyText="Lägg till favoriter"
          onPress={() => router.push("/favorites" as any)}
        />
        <PreviewCard
          icon={<Crown size={14} color={GOLD} strokeWidth={2} />}
          title="Förmåner"
          subtitle={isMember ? "Aktiva erbjudanden" : "Spara pengar med ditt kort"}
          images={offerImages}
          emptyText="Nya förmåner är på väg"
          isPremium
          onPress={() => {}}
        />
      </View>

      {/* ── Tre knappar (Historik / Statistik / Utmaningar) ── */}
      <View style={s.row}>
        <SmallButton
          icon={<ClipboardList size={18} color={GOLD} strokeWidth={1.5} />}
          label="Historik"
          sub="Dina besök"
          onPress={() => router.push("/visits" as any)}
        />
        <SmallButton
          icon={<BarChart3 size={18} color={GOLD} strokeWidth={1.5} />}
          label="Statistik"
          sub="Se din aktivitet"
          onPress={() => router.push("/stats" as any)}
        />
        <SmallButton
          icon={<Medal size={18} color={GOLD} strokeWidth={1.5} />}
          label="Utmaningar"
          sub="0 aktiva"
          onPress={() => router.push("/challenges" as any)}
        />
      </View>

      {/* ── Mitt Österlen-kort ────────────────────────────── */}
      <TouchableOpacity activeOpacity={0.88} style={s.mittOsterlen} onPress={() => {}}>
        {/* Corner glow */}
        <View style={s.moCornerGlow} />
        {/* Left image */}
        <View style={s.moImgWrap}>
          <View style={s.moImgPlaceholder}>
            <MapPin size={20} color={GOLD} strokeWidth={1.5} />
          </View>
        </View>
        {/* Text */}
        <View style={{ flex: 1 }}>
          <Text style={s.moTitle}>Mitt Österlen</Text>
          <Text style={s.moSub}>Dina listor, resor & planering</Text>
          <View style={s.moMeta}>
            <MapPin size={11} color={GOLD} strokeWidth={2} />
            <Text style={s.moMetaText}>0 resor</Text>
            <View style={s.moDot} />
            <Bookmark size={11} color={GOLD} strokeWidth={2} />
            <Text style={s.moMetaText}>0 listor</Text>
            <View style={s.moDot} />
            <BookOpen size={11} color={GOLD} strokeWidth={2} />
            <Text style={s.moMetaText}>0 minnen</Text>
          </View>
        </View>
        <ChevronRight size={20} color="rgba(255,255,255,0.30)" strokeWidth={2} />
      </TouchableOpacity>

    </View>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 16,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title:    { fontFamily: "PlayfairDisplay_700Bold", fontSize: 24, color: FG },
  titleSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: "#A09880", marginTop: 2 },
  gearBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: BORDER,
  },

  row: { flexDirection: "row", gap: 12, marginBottom: 12 },

  // Mitt Österlen
  mittOsterlen: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: CARD_BG,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(197,160,89,0.18)",
    marginBottom: 8,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  moCornerGlow: {
    position: "absolute", top: -20, right: -20,
    width: 120, height: 80, borderRadius: 999,
    backgroundColor: "rgba(197,160,89,0.07)",
  },
  moImgWrap: { width: 44, height: 44 },
  moImgPlaceholder: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "rgba(197,160,89,0.12)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 0.5, borderColor: "rgba(197,160,89,0.35)",
  },
  moTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 16, color: FG, marginBottom: 2 },
  moSub:   { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.50)", marginBottom: 6 },
  moMeta:  { flexDirection: "row", alignItems: "center", gap: 4 },
  moMetaText: { fontFamily: "Inter_400Regular", fontSize: 9.5, color: "rgba(255,255,255,0.65)" },
  moDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.20)" },

  signOut: { alignSelf: "center", paddingVertical: 6, marginTop: 2 },
  signOutText: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.25)" },
});
