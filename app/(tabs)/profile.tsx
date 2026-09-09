/**
 * Profil – native implementation
 * Spec: native-profile-spec.md
 *
 * Skärmen scrollar INTE – allt ryms på en telefonhöjd.
 * MemberCard är appens viktigaste UI-element: flipbar 3D-karta med animerade guldvågor.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  Dimensions, Animated, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Svg, {
  Defs,
  LinearGradient as SvgGrad,
  RadialGradient as SvgRadial,
  Stop,
  Path,
  Rect as SvgRect,
} from "react-native-svg";
import {
  Settings, Crown, ChevronRight, ClipboardList,
  BarChart3, Medal, Heart, Radio, MapPin, Bookmark, BookOpen,
} from "lucide-react-native";
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
const GOLD_W  = "#d4af37";
const CHARCOAL = "#121212";
const BG      = "#121212";
const FG      = "#F5F1E8";
const MUTED   = "rgba(245,241,232,0.55)";
const BORDER  = "rgba(255,255,255,0.10)";
const CARD_BG = "#1C1C1C";

// ─── Gold wave SVG (member card decoration) ───────────────────────────────────
const WAVE_YS = [60, 78, 96, 114, 132];
function GoldWaves() {
  const paths = WAVE_YS.map((y, i) => {
    const d = `M -20 ${y} Q 120 ${y - 18 + i * 4} 260 ${y + 6 - i * 3} T 420 ${y - 4}`;
    const opacity = 0.85 - i * 0.1;
    return { d, opacity };
  });
  return (
    <Svg
      width={CARD_W}
      height={CARD_H}
      style={StyleSheet.absoluteFill}
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <Defs>
        <SvgGrad id="wg" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%"   stopColor="#D4AF37" stopOpacity={0}    />
          <Stop offset="35%"  stopColor="#D4AF37" stopOpacity={0.35} />
          <Stop offset="65%"  stopColor="#E8C547" stopOpacity={0.55} />
          <Stop offset="100%" stopColor="#D4AF37" stopOpacity={0}    />
        </SvgGrad>
      </Defs>
      {paths.map((p, i) => (
        <Path
          key={i}
          d={p.d}
          stroke="url(#wg)"
          strokeWidth={0.8}
          fill="none"
          opacity={p.opacity}
        />
      ))}
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
          <Stop offset="0%"   stopColor={GOLD_W} stopOpacity={0.06} />
          <Stop offset="100%" stopColor={GOLD_W} stopOpacity={0}    />
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
  avatarUrl,
  onBuyPress,
}: {
  displayName: string;
  isMember: boolean;
  memberSince: string | null;
  avatarUrl?: string | null;
  onBuyPress: () => void;
}) {
  const flipAnim  = useRef(new Animated.Value(0)).current;
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const [isFlipped, setIsFlipped] = useState(false);
  const [time, setTime]           = useState(new Date());

  // Animated light sweep (member only)
  useEffect(() => {
    if (!isMember) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweepAnim, { toValue: 1, duration: 4200, useNativeDriver: true }),
        Animated.delay(5000),
        Animated.timing(sweepAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isMember]);

  const sweepX = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-CARD_W * 1.2, CARD_W * 1.2],
  });

  // 3D flip
  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const backRotate  = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });

  const handlePress = () => {
    if (!isMember) { onBuyPress(); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const toVal = isFlipped ? 0 : 1;
    Animated.spring(flipAnim, {
      toValue: toVal,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setTimeout(() => setIsFlipped((v) => !v), 350);
  };

  // Live clock — only when back is showing
  useEffect(() => {
    if (!isFlipped) return;
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, [isFlipped]);

  const initials = displayName.slice(0, 2).toUpperCase();

  // ── Front ───────────────────────────────────────────────────────────────────
  const Front = (
    <Animated.View
      style={[
        mc.card,
        isMember ? mc.cardMember : mc.cardBronze,
        { transform: [{ perspective: 1200 }, { rotateY: frontRotate }] },
      ]}
    >
      {isMember ? (
        <>
          {/* Decorative circles top-right */}
          <View style={mc.decoCircleLg} />
          <View style={mc.decoCircleSm} />
          {/* Gold right-side glow */}
          <View style={mc.goldGlow} />
          {/* Gold diagonal stripe lines */}
          <View style={mc.stripeLines} />
          {/* SVG gold waves */}
          <GoldWaves />
          {/* Animated light sweep */}
          <Animated.View
            style={[mc.sweep, { transform: [{ translateX: sweepX }, { skewX: "-20deg" }] }]}
          />
          {/* Inner gold border */}
          <View style={mc.innerBorder} />
        </>
      ) : (
        /* Bronze: simple overlay stripes */
        <>
          <View style={mc.bronzeGlow} />
          <View style={mc.bronzeSheen} />
        </>
      )}

      {/* Content */}
      <View style={mc.cardContent}>
        {/* Top row */}
        <View style={mc.cardTop}>
          {/* Avatar chip */}
          <View style={[mc.avatarRing, !isMember && mc.avatarRingDull]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={mc.avatarImg} />
            ) : (
              <View style={[mc.avatarInner, !isMember && mc.avatarInnerDull]}>
                <Text style={[mc.avatarInitials, !isMember && { color: "#888" }]}>{initials}</Text>
              </View>
            )}
          </View>
          {/* Radio icon – member only */}
          {isMember && (
            <View style={mc.radioWrap}>
              <Radio size={20} color={GOLD_W} strokeWidth={1.5} />
            </View>
          )}
        </View>

        {/* Bottom */}
        <View>
          <Text style={[mc.cardName, !isMember && { color: "rgba(255,255,255,0.4)" }]}>
            {displayName.toUpperCase()}
          </Text>
          {memberSince && (
            <Text style={mc.cardSince}>Medlem sedan {memberSince}</Text>
          )}
          {isMember ? (
            <View style={mc.passRow}>
              <Crown size={12} color={GOLD_W} strokeWidth={2} />
              <Text style={mc.passRowText}>ÖSTERLENKORTET</Text>
            </View>
          ) : (
            <Text style={mc.ctaText}>Tryck för att skaffa Österlenkortet →</Text>
          )}
        </View>
      </View>
    </Animated.View>
  );

  // ── Back (live verification) ──────────────────────────────────────────────
  const clockStr = time.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const Back = (
    <Animated.View
      style={[
        mc.card, mc.cardBack,
        { transform: [{ perspective: 1200 }, { rotateY: backRotate }] },
      ]}
    >
      {/* Animated gold background */}
      <View style={StyleSheet.absoluteFill}>
        <View style={mc.backGradA} />
        <View style={mc.backGradB} />
      </View>
      {/* Content */}
      <View style={mc.backContent}>
        <Text style={mc.verifyLabel}>LIVE-VERIFIERING</Text>
        <View style={mc.backAvatarRing}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={mc.backAvatarImg} />
          ) : (
            <View style={mc.backAvatarEmpty}>
              <Text style={{ fontFamily: "PlayfairDisplay_700Bold", fontSize: 28, color: BG }}>{initials}</Text>
            </View>
          )}
        </View>
        <Text style={mc.clockText}>{clockStr}</Text>
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
    width: CARD_W,
    height: CARD_H,
    borderRadius: 20,
    overflow: "hidden",
    backfaceVisibility: "hidden",
  },
  cardMember: { backgroundColor: "#111111" },
  cardBronze: { backgroundColor: "#3d2008" },
  cardBack:   { backgroundColor: "#1a1500" },

  // Member layers
  decoCircleLg: {
    position: "absolute", top: -48, right: -48,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.025)",
  },
  decoCircleSm: {
    position: "absolute", top: -20, right: -20,
    width: 112, height: 112, borderRadius: 56,
    backgroundColor: "rgba(255,255,255,0.018)",
  },
  goldGlow: {
    position: "absolute", top: -40, right: -30,
    width: CARD_W * 0.7, height: CARD_H + 80,
    borderRadius: 999,
    backgroundColor: "rgba(212,175,55,0.07)",
  },
  stripeLines: {
    position: "absolute", inset: 0,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,215,120,0.20)",
    borderRadius: 20,
  },
  sweep: {
    position: "absolute", top: 0, bottom: 0,
    width: 80,
    backgroundColor: "rgba(255,235,150,0.09)",
  },
  innerBorder: {
    position: "absolute", inset: 0,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,215,120,0.28)",
  },

  // Bronze layers
  bronzeGlow: {
    position: "absolute", top: -20, right: -20,
    width: CARD_W * 0.6, height: CARD_H * 0.8,
    borderRadius: 999,
    backgroundColor: "rgba(139,108,62,0.35)",
  },
  bronzeSheen: {
    position: "absolute", top: 0, left: 0, right: 0, height: CARD_H * 0.4,
    backgroundColor: "rgba(255,200,120,0.04)",
  },

  // Content
  cardContent: {
    position: "absolute", inset: 0,
    padding: 24,
    justifyContent: "space-between",
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  avatarRing: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 1.5, borderColor: GOLD_W,
    alignItems: "center", justifyContent: "center",
    shadowColor: GOLD_W, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  avatarRingDull: { borderColor: "rgba(255,255,255,0.12)", shadowOpacity: 0 },
  avatarImg: { width: 46, height: 46, borderRadius: 23 },
  avatarInner: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: "#2a1800",
    alignItems: "center", justifyContent: "center",
  },
  avatarInnerDull: { backgroundColor: "#333" },
  avatarInitials: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 16, color: GOLD_W },
  radioWrap: {
    shadowColor: GOLD_W, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },

  cardName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: "rgba(255,255,255,0.92)",
    letterSpacing: 2.5,
    marginBottom: 4,
  },
  cardSince: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.30)", marginBottom: 8 },
  passRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  passRowText: {
    fontFamily: "Inter_600SemiBold", fontSize: 11,
    color: GOLD_W, letterSpacing: 1.2,
  },
  ctaText: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.35)" },

  // Back
  backGradA: {
    position: "absolute", inset: 0,
    backgroundColor: "#c8980a",
    opacity: 0.85,
  },
  backGradB: {
    position: "absolute", top: -30, right: -30,
    width: CARD_W * 0.7, height: CARD_H + 60,
    borderRadius: 999,
    backgroundColor: "#8b6914",
    opacity: 0.6,
  },
  backContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  verifyLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 11,
    color: "rgba(0,0,0,0.60)", letterSpacing: 2, textTransform: "uppercase",
  },
  backAvatarRing: {
    width: 92, height: 92, borderRadius: 46,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.50)",
    alignItems: "center", justifyContent: "center",
    overflow: "hidden", backgroundColor: "rgba(255,255,255,0.15)",
  },
  backAvatarImg: { width: 92, height: 92, borderRadius: 46 },
  backAvatarEmpty: { width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.25)" },
  clockText: { fontFamily: "Inter_600SemiBold", fontSize: 22, color: "rgba(0,0,0,0.85)", letterSpacing: 1 },
  showText: { fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(0,0,0,0.45)" },
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
  const avatarUrl    = (profile as any)?.avatar_url as string | null | undefined;

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
    Alert.alert("Österlenkortet", "Köpflödet öppnas snart!", [{ text: "OK" }]);
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
          <Text style={s.titleSub}>Din resa på Österlen</Text>
        </View>
        <TouchableOpacity
          style={s.gearBtn}
          onPress={() => router.push("/settings" as any)}
        >
          <Settings size={20} color={MUTED} strokeWidth={1.75} />
        </TouchableOpacity>
      </View>

      {/* ── MemberCard ────────────────────────────────────── */}
      <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
        <MemberCard
          displayName={displayName}
          isMember={isMember}
          memberSince={memberSince}
          avatarUrl={avatarUrl}
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
          onPress={() => {}}
        />
        <SmallButton
          icon={<BarChart3 size={18} color={GOLD} strokeWidth={1.5} />}
          label="Statistik"
          sub="Se din aktivitet"
          onPress={() => {}}
        />
        <SmallButton
          icon={<Medal size={18} color={GOLD} strokeWidth={1.5} />}
          label="Utmaningar"
          sub="0 aktiva"
          onPress={() => {}}
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

      {/* ── Logga ut ──────────────────────────────────────── */}
      <TouchableOpacity onPress={handleSignOut} style={s.signOut}>
        <Text style={s.signOutText}>Logga ut</Text>
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
  titleSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, marginTop: 2 },
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
