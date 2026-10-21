/**
 * Toppen på Hem, utan stor bild: dagens datum, hälsningen ("God morgon, Viktor") och profilbilden
 * med streaken uppe till höger (ett tryck: Mitt Österlen). Under hälsningen en rad med det som
 * händer just nu: vädret där man är (eller i Simrishamn om man inte är på Österlen) och hur många
 * ställen som har öppet — ett tryck på den visar dem i Sök.
 *
 * Raden sköter sin egen data (vädret, platserna), så den ritar inte om resten av Hem.
 */
import { memo, useMemo } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight } from "lucide-react-native";
import { useProfile } from "@/hooks/useProfile";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { usePlaces, type Place } from "@/hooks/usePlaces";
import { useWeather, weatherIcon, type Weather } from "@/hooks/useWeather";
import { AvatarRing } from "@/components/profile/AvatarRing";
import { StreakPill } from "@/components/streak/StreakPill";
import { useOpenColors } from "@/components/search/SearchParts";
import { useTheme } from "@/theme/ThemeProvider";
import { initialsOf, toneOnTone } from "@/lib/color";
import { distanceMeters } from "@/lib/checkin";
import { formatDate } from "@/i18n/dates";
import { openInfo } from "@/lib/search";
import { openSearch } from "@/lib/searchShortcuts";

const AVATAR = 52;
/** Simrishamn: vädret visas därifrån om man inte är på Österlen */
const SIMRISHAMN = { lat: 55.5565, lng: 14.3503 };
/** Så långt från Simrishamn man räknas vara "på Österlen" */
const OSTERLEN_KM = 60;

const NO_PLACES: Place[] = [];

/** Tidsberoende hälsning */
function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "God morgon";
  if (h >= 12 && h < 15) return "God dag";
  if (h >= 15 && h < 18) return "God eftermiddag";
  return "God kväll";
}

export const HomeHeader = memo(function HomeHeader({ location }: { location: { lat: number; lng: number } | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data: profile } = useProfile();
  const avatarUrl = useAvatarUrl();
  const firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? null;
  const today = formatDate(new Date(), "EEEE d MMMM").toUpperCase();

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 10 }]}>
      <View style={s.top}>
        <View style={{ flex: 1 }}>
          <Text style={[s.date, { color: colors.muted }]}>{today}</Text>
          <Text style={[s.greeting, { color: colors.text }]} numberOfLines={2}>
            {greeting()}{firstName ? `, ${firstName}` : ""}
          </Text>
        </View>
        {/* Streaken och profilbilden — ett enda tryck som leder till Mitt Österlen */}
        <TouchableOpacity style={s.avatarGroup} onPress={() => router.push("/mitt-osterlen" as never)} activeOpacity={0.85}>
          <View style={s.streakOverlap}>
            <StreakPill />
          </View>
          <AvatarRing ring={profile?.avatar_ring} size={AVATAR}>
            <View style={[s.avatar, { backgroundColor: profile?.circle_color ?? "#2A2A2A" }]}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <Text style={[s.initials, { color: toneOnTone(profile?.circle_color ?? "#2A2A2A") }]}>
                  {initialsOf(profile?.display_name ?? "") || "?"}
                </Text>
              )}
            </View>
          </AvatarRing>
        </TouchableOpacity>
      </View>
      <NowLine location={location} onOpenNow={() => openSearch(router, "öppet nu")} />
    </View>
  );
});

/** "☀ 12° · Halvklart i Simrishamn   ● 42 öppna nu ›" */
function NowLine({ location, onOpenNow }: { location: { lat: number; lng: number } | null; onOpenNow: () => void }) {
  const { colors, scheme } = useTheme();
  const openColor = useOpenColors().open;
  const { data: places = NO_PLACES } = usePlaces();

  // Var vädret gäller: där man är om man är på Österlen (orten närmast), annars Simrishamn
  const where = useMemo(() => {
    const onOsterlen = location
      && distanceMeters(location.lat, location.lng, SIMRISHAMN.lat, SIMRISHAMN.lng) / 1000 <= OSTERLEN_KM;
    if (!location || !onOsterlen) return { ...SIMRISHAMN, town: "Simrishamn" };
    let best: { d: number; town: string } | null = null;
    for (const p of places) {
      if (p.lat == null || p.lng == null || !p.nearest_town) continue;
      const d = distanceMeters(location.lat, location.lng, p.lat, p.lng);
      if (!best || d < best.d) best = { d, town: p.nearest_town };
    }
    return { lat: location.lat, lng: location.lng, town: best?.town ?? "Österlen" };
  }, [location, places]);
  const { data: weather } = useWeather(where.lat, where.lng);
  const openCount = useMemo(() => places.filter((p) => openInfo(p)?.open).length, [places]);

  return (
    <View style={s.now}>
      {weather && <WeatherText weather={weather} town={where.town} dark={scheme === "dark"} />}
      {openCount > 0 && (
        <TouchableOpacity style={s.openChip} onPress={onOpenNow} activeOpacity={0.7} hitSlop={8}>
          <View style={[s.openDot, { backgroundColor: openColor }]} />
          <Text style={[s.nowText, { color: colors.text }]}>{openCount} öppna nu</Text>
          <ChevronRight size={15} color={colors.faint} strokeWidth={2.2} />
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Väderikonens färg: sol gul, regn blått, åska lila, resten temats grå */
function weatherColor(w: Weather, dark: boolean, muted: string): string {
  if (w.kind === "clear" || w.kind === "partly") return w.isDay ? (dark ? "#F2D06B" : "#B7791F") : muted;
  if (w.kind === "rain" || w.kind === "drizzle") return dark ? "#60A5FA" : "#1D4ED8";
  if (w.kind === "snow") return dark ? "#BFDBFE" : "#3B82F6";
  if (w.kind === "thunder") return dark ? "#C4B5FD" : "#6D28D9";
  return muted;
}

function WeatherText({ weather, town, dark }: { weather: Weather; town: string; dark: boolean }) {
  const { colors } = useTheme();
  const Icon = weatherIcon(weather);
  const windy = weather.wind >= 10;
  return (
    <View style={s.weather}>
      <Icon size={17} color={weatherColor(weather, dark, colors.muted)} strokeWidth={2.2} />
      <Text style={[s.nowText, { color: colors.text }]} numberOfLines={1}>
        {weather.temp}°
        <Text style={{ color: colors.muted }}>{`  ${weather.label}${windy ? ", blåsigt" : ""} i ${town}`}</Text>
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingBottom: 6 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  date: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.6 },
  greeting: { fontFamily: "Montserrat_700Bold", fontSize: 28, lineHeight: 34, letterSpacing: -0.7, marginTop: 6 },
  avatarGroup: { flexDirection: "row", alignItems: "flex-end", marginTop: 2 },
  // Pillens högra kant ligger ovanpå profilbildens vänstra kant, nere vid bildens nederkant
  streakOverlap: { marginRight: -14, marginBottom: -4, zIndex: 2 },
  // Ingen egen kant — en ring runt profilbilden finns bara om man valt en i Utseende (AvatarRing)
  avatar: {
    width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  initials: { fontSize: 19, fontFamily: "Montserrat_700Bold" },
  // Höjden finns från början, så inget under hoppar ner när vädret kommit
  now: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 16, rowGap: 6, marginTop: 12, minHeight: 22 },
  weather: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 },
  nowText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  openChip: { flexDirection: "row", alignItems: "center", gap: 7 },
  openDot: { width: 8, height: 8, borderRadius: 4 },
});
