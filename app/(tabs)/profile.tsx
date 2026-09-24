/**
 * Profil – native implementation
 * Spec: native-profile-spec.md
 *
 * Skärmen scrollar INTE – allt ryms på en telefonhöjd.
 * MemberCard är appens viktigaste UI-element: flipbar 3D-karta med animerade guldvågor.
 */
import { useState, useRef, useCallback } from "react";
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
import { useMembership } from "@/hooks/useMembership";
import { useAuth }      from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { usePlaces }    from "@/hooks/usePlaces";
import { useOffers }    from "@/hooks/useOffers";
import { useOfferRedemptions } from "@/hooks/useOfferRedemptions";
import { useVisits } from "@/hooks/useVisits";
import { useTrophies } from "@/hooks/useTrophies";
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
  return (
    <ScalePress
      onPress={onPress}
      outerStyle={{ flex: 1 }}
      style={[pc.flatCard, isPremium && pc.flatCardPremium]}
    >
      <View style={pc.headerRow}>
        {icon}
        <Text style={pc.title}>{title}</Text>
      </View>
      <Text style={[pc.subtitle, isPremium && pc.subtitlePremium]} numberOfLines={1}>{subtitle}</Text>

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
  // Favoriter/Förmåner — test: bara en tunn ytterlinje, ingen
  // fyllning/gradient/skugga. Innehållet (bilder, siffror) är mer gjort
  // för en avgränsad yta än det avboxade läget vi testade innan.
  flatCard: {
    borderRadius: 20,
    padding: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  // Förmåner: statisk guldkant istället för en andra shimmer-animation
  // (MemberCard har redan en) — det är knappen som faktiskt drar in pengar,
  // så den ska sticka ut permanent, inte bara blinka till då och då.
  flatCardPremium: {
    borderColor: "rgba(197,160,89,0.45)",
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 },
  title:    { fontFamily: "Inter_500Medium", fontSize: 14, color: FG },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: "rgba(255,255,255,0.45)", marginBottom: 10 },
  // Spar-summan är säljargumentet — fet och guldfärgad istället för samma
  // grå ton som Favoriter-texten
  subtitlePremium: { fontFamily: "Inter_600SemiBold", color: GOLD },
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
// Ingen kort-yta längre (ingen bakgrund/kant/skugga) — bara ikonplattan,
// etiketten och undertexten flyter direkt mot sidbakgrunden. Tre identiska
// mörka lådor i rad var det tydligaste "AI-mall"-draget på sidan; en enkel
// ikonrad läser mer som navigation, mindre som tre påhittade innehållskort.
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
    <ScalePress onPress={onPress} outerStyle={{ flex: 1 }} style={sb.btn} scaleTo={0.94}>
      <View style={sb.iconBox}>{icon}</View>
      <Text style={sb.label} numberOfLines={1}>{label}</Text>
      <Text style={sb.sub}  numberOfLines={1}>{sub}</Text>
    </ScalePress>
  );
}

const sb = StyleSheet.create({
  btn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  // Ikonruta — svagt nedsänkt, inte en cirkulär bricka.
  iconBox: {
    width: 44, height: 44,
    borderRadius: 11,
    backgroundColor: "#2B2B2B",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    shadowColor: "#000000",
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 1.5,
  },
  label: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: FG, marginBottom: 2 },
  sub:   { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.45)" },
});

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
  const { trophies } = useTrophies();

  const displayName  = profile?.display_name ?? user?.email?.split("@")[0] ?? "Gäst";
  const { isMember } = useMembership();
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

  // Antal av de 21 troféerna som är klara, inte "aktiva guldnivåer" som
  // Statistiks KPI visar.
  const trophiesDone = trophies.filter((t) => t.done).length;

  const safeTop    = Math.max(insets.top, 44);
  const safeBotPad = Math.max(insets.bottom, 6) + 56;

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
      <View style={{ marginBottom: 28 }}>
        <MemberCard
          displayName={displayName}
          isMember={isMember}
          memberSince={memberSince}
          cardColor={profile?.card_color}
          avatarUrl={(profile as any)?.avatar_url ?? null}
          profileImageUrl={(profile as any)?.profile_image_url ?? null}
          onBuyPress={() => router.push("/settings/pass" as any)}
        />
      </View>

      {/* ── PreviewCards (Favoriter + Förmåner) ──────────── */}
      {/* Tunn ytterlinje, ingen fyllning/skugga (se pc.flatCard). Ingen
          manuell knuff behövs här — de synliga kantlinjerna gav ögat en
          egen referenspunkt, till skillnad från när ytan var helt osynlig. */}
      <View style={[s.row, { marginBottom: 24 }]}>
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

      <View style={s.sectionDivider} />

      {/* ── Tre knappar (Historik / Statistik / Utmaningar) ── */}
      <View style={s.row}>
        <SmallButton
          icon={<ClipboardList size={19} color="rgba(255,255,255,0.70)" strokeWidth={1.5} />}
          label="Historik"
          sub={visitCount === 1 ? "1 besök" : `${visitCount} besök`}
          onPress={() => router.push("/visits" as any)}
        />
        <SmallButton
          icon={<BarChart3 size={19} color="rgba(255,255,255,0.70)" strokeWidth={1.5} />}
          label="Statistik"
          sub="Se din aktivitet"
          onPress={() => router.push("/stats" as any)}
        />
        <SmallButton
          icon={<Medal size={19} color="rgba(255,255,255,0.70)" strokeWidth={1.5} />}
          label="Utmaningar"
          sub={`${trophiesDone}/21 klarade`}
          onPress={() => router.push("/challenges" as any)}
        />
      </View>

      <View style={[s.sectionDivider, { marginBottom: 24 }]} />

      {/* ── Mitt Österlen ─────────────────────────────────── */}
      {/* Bara logga + rubrik/undertext, ingen box, ingen statsremsa. De 4
          statsiffrorna (streak/stickers/listor/minnen) var alla hårdkodade
          "0" — såg lika oäkta ut som resten av sidan gjorde innan
          omdesignen. Blir en ren ingång till den riktiga Mitt Österlen-
          sidan (byggs nästa pass) istället för att låtsas visa data. */}
      <TouchableOpacity
        activeOpacity={0.7}
        style={[s.mittOsterlen, { transform: [{ translateX: 6 }] }]}
        onPress={() => router.push("/mitt-osterlen" as any)}
      >
        <Image
          source={require("../../assets/Osterlenappen-logo.png")}
          style={s.moIcon}
          resizeMode="contain"
        />
        <View style={{ flex: 1 }}>
          <Text style={s.moTitle}>Mitt Österlen</Text>
          <Text style={s.moSub}>Din resa på Österlen</Text>
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

  row: { flexDirection: "row", gap: 12, marginBottom: 8 },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.10)",
    marginBottom: 14,
  },

  // Mitt Österlen — bara en rad (logga + rubrik/undertext + pil), ingen
  // box, ingen statsremsa. Se JSX-kommentaren där den används för varför.
  mittOsterlen: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 4,
  },
  moIcon: { width: 42, height: 42 },
  moTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 17, color: FG, marginBottom: 2 },
  moSub:   { fontFamily: "Inter_400Regular", fontSize: 11.5, color: "rgba(255,255,255,0.50)" },

  signOut: { alignSelf: "center", paddingVertical: 6, marginTop: 2 },
  signOutText: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.25)" },
});
