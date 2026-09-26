/**
 * Profil: medlemskortet överst (går att vända genom tryck eller svep). Direkt under det
 * två stora ikonknappar för det vi vill leda användaren till: Förmåner (guld, med antal
 * aktiva) och Mitt Österlen (med loggan). Längst ner rader med tunn linje emellan, var
 * och en med en liten förhandsvisning av innehållet till höger: Favoriter (platsbilder),
 * Historik (senaste besöken), Statistik (mest besökta kategorier, med en kant som fylls efter
 * hur mycket man besökt) och Utmaningar (senast klarade, med kant i brons, silver eller guld).
 */
import { useMemo, type ReactNode } from "react";
import { View, Text, Image, Pressable, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Settings, Crown, ChevronRight, ClipboardList, BarChart3, Medal, Heart, type LucideIcon } from "lucide-react-native";
import Svg, { Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { MemberCard } from "@/components/MemberCard";
import { FadeImage } from "@/components/FadeImage";
import { FadeOnChange } from "@/components/FadeOnChange";
import { floatingNavSolidHeight } from "@/components/navigation/FloatingNav";
import { useProfile } from "@/hooks/useProfile";
import { useMembership } from "@/hooks/useMembership";
import { useAvatarUrl, useCardPhotoUrl } from "@/hooks/useAvatarUrl";
import { useAuth } from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { usePlaces } from "@/hooks/usePlaces";
import { useAvailableOffers } from "@/hooks/useAvailableOffers";
import { useVisits } from "@/hooks/useVisits";
import { useTrophies } from "@/hooks/useTrophies";
import { formatKr } from "@/lib/offers";
import { computeCategoryStats, type CategoryStat } from "@/lib/categories";
import { softenColor } from "@/lib/color";
import { TIER_PALETTE, type Trophy } from "@/lib/achievements";
import { BADGE_IMAGES } from "@/components/trophies/TrophyMedal";
import { formatDate } from "@/i18n/dates";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const MAX_THUMBS = 4;
/** Så mycket större än sin höjd blir kortets kant när det vänds (perspektivet), så mycket rum behöver det över sig */
const CARD_HEADROOM = 14;

/** Små kvadratiska bilder (platsernas loggor) som ligger delvis över varandra. */
function Thumbs({ uris }: { uris: string[] }) {
  const s = useThemedStyles(createStyles);
  if (uris.length === 0) return null;
  return (
    <View style={s.thumbs}>
      {uris.slice(0, MAX_THUMBS).map((uri, i) => (
        <View key={`${uri}-${i}`} style={[s.thumb, { marginLeft: i > 0 ? -10 : 0, zIndex: i + 1 }]}>
          <FadeImage uri={uri} />
        </View>
      ))}
    </View>
  );
}

const BOX = 28;
const BOX_RADIUS = 8;
/** Rutorna ligger delvis över varandra, som platsbilderna */
const boxOverlap = (index: number) => ({ marginLeft: index > 0 ? -10 : 0, zIndex: index + 1 });

/**
 * Kategori som en ruta: ikonen i kategorins färg, med en kant i samma färg som fylls runt om efter
 * hur stor del av kategorin som besökts (helt besökt = hela kanten). Kanten börjar uppe i mitten
 * och går medurs.
 */
function CategoryBox({ cat, index }: { cat: CategoryStat; index: number }) {
  const s = useThemedStyles(createStyles);
  const stroke = 2;
  const near = stroke / 2;
  // Lite ljusare och mindre mättad än kategorins egen färg, så kanten inte lyser mot den mörka bakgrunden
  const color = softenColor(cat.color);
  const far = BOX - stroke / 2;
  const radius = BOX_RADIUS - stroke / 2;
  const perimeter = 4 * (far - near - 2 * radius) + 2 * Math.PI * radius;
  // Rundad ruta som börjar uppe i mitten och går medurs
  const outline = [
    `M ${BOX / 2} ${near}`,
    `H ${far - radius}`, `A ${radius} ${radius} 0 0 1 ${far} ${near + radius}`,
    `V ${far - radius}`, `A ${radius} ${radius} 0 0 1 ${far - radius} ${far}`,
    `H ${near + radius}`, `A ${radius} ${radius} 0 0 1 ${near} ${far - radius}`,
    `V ${near + radius}`, `A ${radius} ${radius} 0 0 1 ${near + radius} ${near}`,
    "Z",
  ].join(" ");
  // Minst 1 % så en besökt kategori aldrig ser tom ut
  const percent = cat.visited > 0 ? Math.max(1, cat.percentage) : 0;
  return (
    <View style={[s.box, boxOverlap(index)]}>
      <Svg width={BOX} height={BOX} style={StyleSheet.absoluteFill}>
        <Path d={outline} fill="none" stroke={color} strokeOpacity={0.4} strokeWidth={stroke} />
        <Path
          d={outline} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${(perimeter * percent) / 100} ${perimeter}`} strokeLinecap="round"
        />
      </Svg>
      <cat.Icon size={13} color={color} strokeWidth={2} />
    </View>
  );
}

/** Klar utmaning som en ruta med troféns egen bild; nivån (brons, silver, guld) syns i bilden själv. */
function TrophyBox({ trophy, index }: { trophy: Trophy; index: number }) {
  const s = useThemedStyles(createStyles);
  const palette = TIER_PALETTE[trophy.tier];
  const artwork = BADGE_IMAGES[`${trophy.groupId}-${trophy.tier}`];
  return (
    <View style={[s.box, s.boxNeutral, boxOverlap(index)]}>
      {artwork ? (
        <Image source={artwork} style={s.trophyImage} resizeMode="contain" />
      ) : (
        <trophy.Icon size={13} color={palette.field[1]} strokeWidth={2} />
      )}
    </View>
  );
}

/** Ikonruta med ikonen eller appens logga i, samma stil på knappar och rader. */
function IconTile({ icon: Icon, logo = false, tint, size = 46 }: { icon?: LucideIcon; logo?: boolean; tint?: string; size?: number }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <View style={[s.tile, { width: size, height: size, borderRadius: size * 0.3 }]}>
      {logo ? (
        <Image source={require("../../assets/Osterlenappen-logo.png")} style={{ width: size * 0.56, height: size * 0.63 }} resizeMode="contain" accessibilityIgnoresInvertColors />
      ) : (
        Icon && <Icon size={size * 0.44} color={tint ?? `${colors.text}BF`} strokeWidth={1.6} />
      )}
    </View>
  );
}

/** Stor ikonknapp med rubrik och en kort rad under, två i rad. */
function PrimaryTile({ icon, logo, tint, badge, title, subtitle, onPress }: {
  icon?: LucideIcon;
  logo?: boolean;
  tint?: string;
  /** Antal (t.ex. aktiva förmåner) som en liten guldmärke på ikonen */
  badge?: number;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const s = useThemedStyles(createStyles);
  return (
    <Pressable
      style={({ pressed }) => [s.primary, pressed && s.pressed]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
    >
      <View>
        <IconTile icon={icon} logo={logo} tint={tint} size={58} />
        {badge ? (
          <FadeOnChange style={s.badge} value={badge}>
            <Text style={s.badgeText}>{badge > 99 ? "99+" : badge}</Text>
          </FadeOnChange>
        ) : null}
      </View>
      <Text style={s.primaryTitle} numberOfLines={1}>{title}</Text>
      <FadeOnChange value={subtitle}>
        <Text style={[s.primarySub, tint ? { color: tint } : null]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{subtitle}</Text>
      </FadeOnChange>
    </Pressable>
  );
}

/** En rad direkt mot bakgrunden med tunn linje under (utom sista), alltid lika hög. */
function ProfileRow({ icon, title, subtitle, thumbs, last = false, onPress }: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  thumbs?: ReactNode;
  last?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <Pressable
      style={({ pressed }) => [s.row, !last && s.rowDivider, pressed && s.pressed]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
    >
      <IconTile icon={icon} />
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <FadeOnChange value={subtitle}>
          <Text style={s.subtitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{subtitle}</Text>
        </FadeOnChange>
      </View>
      {thumbs}
      <ChevronRight size={18} color={colors.faint} strokeWidth={2} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: favorites = [] } = useFavorites();
  const { data: places = [] } = usePlaces();
  const { available: activeOffers, savings: offerSavings } = useAvailableOffers();
  const { data: visits = [] } = useVisits();
  const { trophies } = useTrophies();
  const { isMember } = useMembership();
  const avatarUrl = useAvatarUrl();
  const cardPhotoUrl = useCardPhotoUrl();

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "";
  const memberSince = profile?.created_at ? formatDate(profile.created_at, "MMMM yyyy") : null;

  const favPlaces = places.filter((p) => favorites.some((f) => f.place_id === p.id));
  // Favoriter: de fem senast sparade som har en logga (aldrig tomma grå rutor), den senast sparade längst till höger
  const favImages = useMemo(() => {
    const byRecent = [...favorites].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const uris: string[] = [];
    for (const fav of byRecent) {
      const logo = places.find((p) => p.id === fav.place_id)?.logo_url;
      if (logo) uris.push(logo);
      if (uris.length === MAX_THUMBS) break;
    }
    return uris.reverse();
  }, [favorites, places]);

  // Förmåner: bara det som faktiskt går att lösa in just nu, samma regel som förmånssidan
  // Historik: platserna (utan upprepningar) för de fem senaste besöken, med loggan eller annars en bild.
  // Det senaste besöket ligger längst till höger.
  const recentImages = useMemo(() => {
    const seen = new Set<number>();
    const uris: string[] = [];
    for (const visit of visits) {
      if (seen.has(visit.place_id)) continue;
      seen.add(visit.place_id);
      const place = places.find((p) => p.id === visit.place_id);
      const uri = place?.logo_url ?? place?.image_url;
      if (uri) uris.push(uri);
      if (uris.length === MAX_THUMBS) break;
    }
    return uris.reverse();
  }, [visits, places]);

  // Statistik: de mest besökta kategorierna (bara sådana man besökt)
  const topCategories = useMemo(
    () => computeCategoryStats(places, [...new Set(visits.map((v) => v.place_id))]).filter((c) => c.visited > 0).slice(0, MAX_THUMBS),
    [places, visits],
  );

  // Utmaningar: de senast klarade (en som klarats men ännu inte loggats räknas som nyast)
  const doneTrophies = useMemo(() => {
    const at = (tr: Trophy) => (tr.doneAt ? new Date(tr.doneAt).getTime() : Date.now());
    // De fem senaste, med den nyaste längst till höger
    return trophies.filter((tr) => tr.done).sort((a, b) => at(b) - at(a)).slice(0, MAX_THUMBS).reverse();
  }, [trophies]);

  // Samma filter som historiksidan: besök utan matchande plats räknas inte
  const visitCount = visits.filter((v) => places.some((p) => p.id === v.place_id)).length;
  const trophiesDone = trophies.filter((tr) => tr.done).length;

  const offerSubtitle = activeOffers.length === 0 ? t("profile.offers.tileEmpty") : t("profile.offers.tile", { amount: formatKr(offerSavings) });
  const favSubtitle = favPlaces.length === 0 ? t("profile.favorites.empty")
    : favPlaces.length === 1 ? t("profile.favorites.one")
    : t("profile.favorites.count", { count: favPlaces.length });

  return (
    <View style={[s.screen, { paddingTop: Math.max(insets.top, 44), paddingBottom: floatingNavSolidHeight(insets.bottom) }]}>
      <View style={s.titleRow}>
        <Text style={s.pageTitle}>{t("profile.title")}</Text>
        <TouchableOpacity style={s.gearBtn} onPress={() => router.push("/settings" as any)}>
          <Settings size={20} color={colors.muted} strokeWidth={1.75} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        style={s.scroll}
        contentContainerStyle={s.body}
      >
        <MemberCard
          displayName={displayName}
          isMember={isMember}
          memberSince={memberSince}
          cardColor={profile?.card_color}
          avatarUrl={avatarUrl}
          circleColor={profile?.circle_color}
          avatarRing={profile?.avatar_ring}
          profileImageUrl={cardPhotoUrl}
          onBuyPress={() => router.push("/settings/pass-buy" as any)}
        />

        {/* Dit vi vill leda användaren: Förmåner (där pengarna finns) och Mitt Österlen */}
        <View style={s.primaryRow}>
          <PrimaryTile
            icon={Crown}
            tint={colors.goldText}
            badge={activeOffers.length}
            title={t("profile.offers.title")}
            subtitle={offerSubtitle}
            onPress={() => router.push("/offers" as any)}
          />
          <PrimaryTile
            logo
            title={t("profile.myOsterlen.title")}
            subtitle={t("profile.myOsterlen.tile")}
            onPress={() => router.push("/mitt-osterlen" as any)}
          />
        </View>

        {/* Favoriter och hens användning som rader */}
        <View style={s.list}>
          <ProfileRow
            icon={Heart}
            title={t("profile.favorites.title")}
            subtitle={favSubtitle}
            thumbs={<Thumbs uris={favImages} />}
            onPress={() => router.push("/favorites" as any)}
          />
          <ProfileRow
            icon={ClipboardList}
            title={t("profile.history.title")}
            subtitle={visitCount === 1 ? t("profile.history.one") : t("profile.history.count", { count: visitCount })}
            thumbs={<Thumbs uris={recentImages} />}
            onPress={() => router.push("/visits" as any)}
          />
          <ProfileRow
            icon={BarChart3}
            title={t("profile.stats.title")}
            subtitle={t("profile.stats.sub")}
            thumbs={<View style={s.thumbs}>{topCategories.map((cat, i) => <CategoryBox key={cat.id} cat={cat} index={i} />)}</View>}
            onPress={() => router.push("/stats" as any)}
          />
          <ProfileRow
            icon={Medal}
            title={t("profile.challenges.title")}
            subtitle={t("profile.challenges.sub", { done: trophiesDone, total: trophies.length })}
            thumbs={<View style={s.thumbs}>{doneTrophies.map((trophy, i) => <TrophyBox key={trophy.key} trophy={trophy} index={i} />)}</View>}
            last
            onPress={() => router.push("/challenges" as any)}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 16 },
  // zIndex så att kugghjulet fortfarande går att trycka på där listan nedanför sträcker sig upp bakom den
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, zIndex: 2 },
  // Samma typsnitt och stil som Inställningar (versal Montserrat), men större eftersom det här är en huvudsida
  pageTitle: { fontFamily: "Montserrat_700Bold", fontSize: 20, letterSpacing: 2, textTransform: "uppercase", color: c.text },
  // Samma storlek och fyllning som tillbaka-knappen på Inställningar-sidorna
  gearBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.fill, alignItems: "center", justifyContent: "center" },
  // Listan börjar en bit högre upp och innehållet är lika mycket nedskjutet, så det ser likadant ut men
  // kortets övre kant inte klipps när kortet vänds
  scroll: { marginTop: -CARD_HEADROOM },
  body: { gap: 16, paddingTop: CARD_HEADROOM },

  // Ligger direkt mot bakgrunden; bara ett tryck ger en dämpad yta bakom
  pressed: { backgroundColor: c.fill },
  tile: { alignItems: "center", justifyContent: "center", backgroundColor: c.tile, borderWidth: 0.5, borderColor: c.tileBorder },

  // De två stora knapparna ligger mitt emellan kortet och listan, mätt på det som syns: raderna
  // har egen luft ovanför ikonen, så knapparna sitter lägre än de mått som ger lika stora marginaler
  primaryRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  list: { marginTop: 6 },
  primary: { flex: 1, alignItems: "center", gap: 5, paddingVertical: 4, borderRadius: 16 },
  // Samma typsnitt och storlek som raderna på Inställningar-sidorna
  primaryTitle: { fontFamily: "Montserrat_500Medium", fontSize: 14.5, letterSpacing: -0.3, color: c.text, marginTop: 2 },
  primarySub: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: c.muted },
  badge: {
    position: "absolute", top: -6, right: -8, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
    alignItems: "center", justifyContent: "center", backgroundColor: c.gold,
  },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 11.5, color: c.onGold },

  box: {
    width: BOX, height: BOX, borderRadius: BOX_RADIUS, overflow: "hidden", alignItems: "center", justifyContent: "center",
    backgroundColor: c.tile,
  },
  // Samma kant och fyllning som platsbilderna: en ring i bakgrundsfärgen som skiljer rutorna åt
  boxNeutral: { borderWidth: 2, borderColor: c.bg, backgroundColor: c.fill },
  trophyImage: { width: BOX - 8, height: BOX - 8 },
  thumbs: { flexDirection: "row", alignItems: "center" },
  thumb: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: c.bg, overflow: "hidden", backgroundColor: c.fill },

  // Alla rader är exakt lika höga
  row: { flexDirection: "row", alignItems: "center", gap: 12, height: 65, paddingHorizontal: 4 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderStrong },
  title: { fontFamily: "Montserrat_500Medium", fontSize: 14.5, letterSpacing: -0.3, color: c.text },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: c.muted, marginTop: 2 },
});
