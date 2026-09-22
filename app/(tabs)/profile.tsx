/**
 * Profil – native implementation
 * Spec: native-profile-spec.md
 *
 * Skärmen scrollar INTE – allt ryms på en telefonhöjd.
 * MemberCard är appens viktigaste UI-element: flipbar 3D-karta med animerade guldvågor.
 */
import { useState, useRef, useEffect, useMemo, useCallback, cloneElement } from "react";
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
  BarChart3, Medal, Heart, MapPin, Bookmark, BookOpen, Flame,
} from "lucide-react-native";
import {
  Canvas, RoundedRect, LinearGradient as SkiaLinearGradient,
  RadialGradient as SkiaRadialGradient, vec,
} from "@shopify/react-native-skia";
import { MemberCard } from "@/components/MemberCard";
import { useProfile }   from "@/hooks/useProfile";
import { useAuth }      from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { usePlaces }    from "@/hooks/usePlaces";
import { useOffers }    from "@/hooks/useOffers";
import { useOfferRedemptions } from "@/hooks/useOfferRedemptions";
import { useVisits } from "@/hooks/useVisits";
import { useDismissals } from "@/hooks/useDismissals";
import { useAchievements } from "@/hooks/useAchievements";
import { buildTrophies, computeUserStats } from "@/lib/achievements";
import { offerEligibility, estimateOfferValue, formatKr } from "@/lib/offers";
import { format }  from "date-fns";
import { sv }      from "date-fns/locale";

// ─── Constants ────────────────────────────────────────────────────────────────
const { width: SW } = Dimensions.get("window");
const GOLD    = "#C5A059";
const GOLD_LT = "#D4AF55";
const BG      = "#121212";
const FG      = "#F5F1E8";
const MUTED   = "rgba(245,241,232,0.55)";
const BORDER  = "rgba(255,255,255,0.10)";
const CARD_BG = "#1C1C1C";

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


// ─── PreviewCard ──────────────────────────────────────────────────────────────
// ─── Djup-systemet för alla profilknappar (Lovable-spec) ─────────────────────
// Diagonal gradient #191919 → #121212 + en mycket svag ljuskälla uppe till vänster,
// mjuk bred yttre skugga. Samma recept på alla sex knappar.
// Äkta Skia-gradient (TileGradient nedan), inte SVG: den gamla SVG-varianten
// hade en osynligt svag diagonal gradient (#1E1E1E→#121212 är nästan samma
// färg) och lutade sig i praktiken på en separat "innerHighlight"-box med
// HÅRD kant vid 45% höjd för att se levande ut — resultatet var en tydlig
// rektangel med annat ljus i övre halvan, inte en sammanhängande gradient.
// Skia ger en riktig mjuk radiell ljuskälla ovanpå diagonalen, utan kant.
const TILE_GRADIENT_COLORS: [string, string] = ["#191919", "#121212"];

function TileGradient({ borderRadius = 20 }: { borderRadius?: number }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((e: any) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }, []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {size.width > 0 && size.height > 0 && (
        <Canvas style={{ width: size.width, height: size.height }}>
          <RoundedRect x={0} y={0} width={size.width} height={size.height} r={borderRadius}>
            <SkiaLinearGradient
              start={vec(0, 0)}
              end={vec(size.width, size.height)}
              colors={TILE_GRADIENT_COLORS}
            />
          </RoundedRect>
          <RoundedRect x={0} y={0} width={size.width} height={size.height} r={borderRadius}>
            <SkiaRadialGradient
              c={vec(size.width * 0.18, size.height * 0.12)}
              r={size.width * 0.95}
              colors={["rgba(255,255,255,0.035)", "rgba(255,255,255,0)"]}
            />
          </RoundedRect>
        </Canvas>
      )}
    </View>
  );
}

// ─── ScalePress: fjäderanimerad tryckåterkoppling + djup-yta för profil-kort ──
// shadowStyle bär den svarta lyft-skuggan (INGEN overflow/clipping — annars skär iOS bort skuggan).
// glow är valfri extra JSX (t.ex. en SVG-radialglöd) som renderas bakom kortet, oklippt.
// style bär bakgrund/border/radius/overflow-hidden och klipper faktiska innehållet.
// gradient=true byter den platta ytan mot LinearGradient + invändig högdager (Lovable-djupet).
function ScalePress({
  onPress,
  style,
  shadowStyle,
  glow,
  outerStyle,
  gradient,
  children,
  scaleTo = 0.96,
}: {
  onPress: () => void;
  style?: any;
  shadowStyle?: any;
  glow?: React.ReactNode;
  outerStyle?: any;
  gradient?: boolean;
  children: React.ReactNode;
  scaleTo?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () =>
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 50, bounciness: 6 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 6 }).start();
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={outerStyle}
    >
      <Animated.View style={[shadowStyle, { transform: [{ scale }] }]}>
        {glow}
        {gradient ? (
          <View style={style}>
            <TileGradient />
            {children}
          </View>
        ) : (
          <View style={style}>{children}</View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

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
        Animated.timing(shimX, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.delay(4000),
        Animated.timing(shimX, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isPremium]);

  const shimTranslate = shimX.interpolate({ inputRange: [0, 1], outputRange: [-200, 200] });

  return (
    <ScalePress
      onPress={onPress}
      outerStyle={{ flex: 1 }}
      shadowStyle={pc.card}
      glow={isPremium ? <View style={pc.goldGlow} pointerEvents="none" /> : undefined}
      gradient
      style={[pc.cardInner, isPremium && pc.cardInnerPremium]}
    >
      {isPremium && (
        <Animated.View
          style={[pc.shimmer, { transform: [{ translateX: shimTranslate }, { skewX: "-18deg" }] }]}
          pointerEvents="none"
        >
          <Svg width={70} height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgGrad id="pcShimmer" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0%"   stopColor="#FFEB96" stopOpacity={0}    />
                <Stop offset="45%"  stopColor="#FFEB96" stopOpacity={0.10} />
                <Stop offset="55%"  stopColor="#FFEB96" stopOpacity={0.10} />
                <Stop offset="100%" stopColor="#FFEB96" stopOpacity={0}    />
              </SvgGrad>
            </Defs>
            <SvgRect x={0} y={0} width={70} height="100%" fill="url(#pcShimmer)" />
          </Svg>
        </Animated.View>
      )}

      <View style={pc.headerRow}>
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
    </ScalePress>
  );
}

const pc = StyleSheet.create({
  // Skugg-lager — ingen overflow/clipping här, annars skär iOS bort skuggan.
  // Bred, diskret skugga (Lovable-spec): 0 4px 14px -10px rgba(0,0,0,0.6)
  card: {
    borderRadius: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 7,
    elevation: 3,
  },
  // Ambient guldglöd bakom premium-kortet (Förmåner)
  goldGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 9,
    elevation: 3,
  },
  // Innehålls-lager (LinearGradient) — radius/overflow-hidden (klipper shimmer/bilder)
  cardInner: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  cardInnerPremium: {
    borderWidth: 0.5,
    borderColor: "rgba(197,160,89,0.32)",
  },
  shimmer: {
    position: "absolute",
    top: 0, bottom: 0,
    width: 70,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 },
  title:    { fontFamily: "Inter_500Medium", fontSize: 13, color: FG },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 10.5, color: "rgba(255,255,255,0.45)", marginBottom: 10 },
  thumbRow: { flexDirection: "row", alignItems: "center", marginTop: "auto" as any },
  thumb: {
    width: 32, height: 32, borderRadius: 10,
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
    <ScalePress onPress={onPress} outerStyle={{ flex: 1 }} shadowStyle={sb.shadow} gradient style={sb.btn}>
      <View style={sb.iconBox}>{icon}</View>
      <Text style={sb.label} numberOfLines={1}>{label}</Text>
      <Text style={sb.sub}  numberOfLines={1}>{sub}</Text>
    </ScalePress>
  );
}

const sb = StyleSheet.create({
  // Skugg-lager — samma breda, diskreta skugga som övriga knappar
  shadow: {
    borderRadius: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 7,
    elevation: 3,
  },
  btn: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  // Ikonruta — svagt nedsänkt, inte en cirkulär bricka
  iconBox: {
    width: 40, height: 40,
    borderRadius: 10,
    backgroundColor: "#2B2B2B",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    shadowColor: "#000000",
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 1.5,
  },
  label: { fontFamily: "Inter_500Medium", fontSize: 13, color: FG, marginBottom: 2 },
  sub:   { fontFamily: "Inter_400Regular", fontSize: 10.5, color: "rgba(255,255,255,0.45)" },
});

// ─── MoStat: en stat-cell i Mitt Österlen-remsan (ikon + siffra + etikett) ────
// Tonas ner till grått tills värdet är > 0 — signalerar "inte påbörjat" utan att gömma siffran
function MoStat({ icon, value, label }: { icon: React.ReactElement<any>; value: string; label: string }) {
  const active = value !== "0";
  const tint = active ? GOLD : "rgba(255,255,255,0.30)";
  return (
    <View style={s.moStat}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {cloneElement(icon, { color: tint })}
        <Text style={[s.moStatValue, !active && s.moStatValueMuted]}>{value}</Text>
      </View>
      <Text style={s.moStatLabel}>{label}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { data: profile }     = useProfile();
  const { data: favorites = [] } = useFavorites();
  const { data: places = [] }    = usePlaces();
  const { data: offers = [] }    = useOffers();
  const { data: redemptions = [] } = useOfferRedemptions();
  const { data: visits = [] }    = useVisits();
  const { data: dismissedIds = [] } = useDismissals();
  const { data: achievements = [] } = useAchievements();

  const displayName  = profile?.display_name ?? user?.email?.split("@")[0] ?? "Gäst";
  const isMember     = !!(profile?.is_member);
  const memberSince  = profile?.created_at
    ? format(new Date(profile.created_at), "MMMM yyyy", { locale: sv })
    : null;
  // Favorite places → thumbnails (bara platser med logo_url — aldrig tomma/grå rutor)
  const favPlaces    = places.filter((p) => favorites.some((f) => f.place_id === p.id));
  const favImages    = favPlaces.map((p) => p.logo_url).filter((url): url is string => !!url).slice(0, 5);
  const favCount     = favPlaces.length;

  // Bara det som faktiskt går att lösa in just nu — samma regel som
  // förmånssidans hero, annars läses "spara X kr" som vilseledande efter
  // att ett erbjudande redan är inlöst
  const activeOffers = offers.filter((o) => offerEligibility(o, redemptions).canUse);
  const offerImages = activeOffers
    .map((o) => o.image_url ?? o.place?.logo_url ?? null)
    .filter((url): url is string => !!url)
    .slice(0, 5);
  const offerCount   = activeOffers.length;
  const offerSavings = activeOffers.reduce((sum, o) => sum + estimateOfferValue(o), 0);

  // Samma filter som historiksidan — besök utan matchande plats räknas inte med
  const visitCount = visits.filter((v) => places.some((p) => p.id === v.place_id)).length;

  // Samma räknemotor som Utmaningar/Statistik (src/lib/achievements.ts) —
  // antal av de 21 troféerna som är klara, inte "aktiva guldnivåer" som
  // Statistiks KPI visar.
  const achievementStats = useMemo(
    () => computeUserStats(visits, places, favorites.length, redemptions, dismissedIds),
    [visits, places, favorites.length, redemptions, dismissedIds]
  );
  const trophiesDone = useMemo(
    () => buildTrophies(achievementStats, achievements).filter((t) => t.done).length,
    [achievementStats, achievements]
  );

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
      <View style={{ marginBottom: 18 }}>
        <MemberCard
          displayName={displayName}
          isMember={isMember}
          memberSince={memberSince}
          cardColor={profile?.card_color}
          avatarUrl={(profile as any)?.avatar_url ?? null}
          profileImageUrl={(profile as any)?.profile_image_url ?? null}
          onBuyPress={handleBuyPress}
        />
      </View>

      {/* ── PreviewCards (Favoriter + Förmåner) ──────────── */}
      <View style={s.row}>
        <PreviewCard
          icon={<Heart size={18} color={GOLD} strokeWidth={2} />}
          title="Favoriter"
          subtitle={favCount > 0 ? `${favCount} sparade platser` : "Dina sparade guldkorn"}
          images={favImages}
          emptyText="Lägg till favoriter"
          onPress={() => router.push("/favorites" as any)}
        />
        <PreviewCard
          icon={<Crown size={18} color={GOLD} strokeWidth={2} />}
          title="Förmåner"
          subtitle={
            offerCount > 0
              ? `${offerCount} ${offerCount === 1 ? "aktiv" : "aktiva"} · spara ${formatKr(offerSavings)}`
              : "Spara pengar med ditt kort"
          }
          images={offerImages}
          emptyText="Nya förmåner är på väg"
          isPremium
          onPress={() => router.push("/offers" as any)}
        />
      </View>

      {/* ── Tre knappar (Historik / Statistik / Utmaningar) ── */}
      <View style={s.row}>
        <SmallButton
          icon={<ClipboardList size={18} color="rgba(255,255,255,0.70)" strokeWidth={1.5} />}
          label="Historik"
          sub={visitCount === 1 ? "1 besök" : `${visitCount} besök`}
          onPress={() => router.push("/visits" as any)}
        />
        <SmallButton
          icon={<BarChart3 size={18} color="rgba(255,255,255,0.70)" strokeWidth={1.5} />}
          label="Statistik"
          sub="Se din aktivitet"
          onPress={() => router.push("/stats" as any)}
        />
        <SmallButton
          icon={<Medal size={18} color="rgba(255,255,255,0.70)" strokeWidth={1.5} />}
          label="Utmaningar"
          sub={`${trophiesDone}/21 klarade`}
          onPress={() => router.push("/challenges" as any)}
        />
      </View>

      {/* ── Mitt Österlen-kort ────────────────────────────── */}
      <ScalePress onPress={() => {}} shadowStyle={s.moShadow} gradient style={s.mittOsterlen}>
        {/* Svagt guldsken övre högra hörnet — ~8% opacitet, ger djup ovanpå gradienten */}
        <Svg width={140} height={140} style={s.moGoldCorner} pointerEvents="none">
          <Defs>
            <SvgRadial id="moGoldCorner" cx="65%" cy="35%" rx="60%" ry="60%">
              <Stop offset="0%"   stopColor={GOLD} stopOpacity={0.08} />
              <Stop offset="100%" stopColor={GOLD} stopOpacity={0}    />
            </SvgRadial>
          </Defs>
          <SvgRect width="100%" height="100%" fill="url(#moGoldCorner)" />
        </Svg>

        {/* Header */}
        <View style={s.moHeaderRow}>
          <View style={[sb.iconBox, { marginBottom: 0 }]}>
            <Image
              source={require("../../assets/Osterlenappen-logo.png")}
              style={{ width: 22, height: 22 }}
              resizeMode="contain"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.moTitle}>Mitt Österlen</Text>
            <Text style={s.moSub}>Din resa på Österlen</Text>
          </View>
          <ChevronRight size={20} color="rgba(255,255,255,0.30)" strokeWidth={2} />
        </View>

        <View style={s.moDivider} />

        {/* Statistik-remsa */}
        <View style={s.moStatRow}>
          <MoStat icon={<Flame size={14} strokeWidth={2} />} value="0" label="Streak" />
          <View style={s.moStatSep} />
          <MoStat icon={<MapPin size={14} strokeWidth={2} />} value="0" label="Stickers" />
          <View style={s.moStatSep} />
          <MoStat icon={<Bookmark size={14} strokeWidth={2} />} value="0" label="Listor" />
          <View style={s.moStatSep} />
          <MoStat icon={<BookOpen size={14} strokeWidth={2} />} value="0" label="Minnen" />
        </View>
      </ScalePress>

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

  // Mitt Österlen — samma bas som övriga knappar men lite mer premiumkänsla
  moShadow: {
    borderRadius: 20,
    marginBottom: 8,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  mittOsterlen: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(197,160,89,0.18)",
    overflow: "hidden",
  },
  // Svagt guldsken i övre högra hörnet — knappt synligt, ger extra djup
  moGoldCorner: {
    position: "absolute",
    top: -30, right: -30,
    width: 140, height: 140,
  },
  moHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  moTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 15, color: FG, marginBottom: 1 },
  moSub:   { fontFamily: "Inter_400Regular", fontSize: 10.5, color: "rgba(255,255,255,0.50)" },
  moDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: 9,
  },
  moStatRow: { flexDirection: "row", alignItems: "center" },
  moStatSep: { width: StyleSheet.hairlineWidth, height: 20, backgroundColor: "rgba(255,255,255,0.10)" },
  moStat: { flex: 1, alignItems: "center", gap: 2 },
  moStatValue: { fontFamily: "Inter_700Bold", fontSize: 14, color: FG },
  moStatValueMuted: { color: "rgba(255,255,255,0.35)" },
  moStatLabel: {
    fontFamily: "Inter_400Regular", fontSize: 8.5, color: "rgba(255,255,255,0.45)",
    textTransform: "uppercase", letterSpacing: 0.5,
  },

  signOut: { alignSelf: "center", paddingVertical: 6, marginTop: 2 },
  signOutText: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.25)" },
});
