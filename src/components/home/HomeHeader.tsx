/**
 * Toppen på Hem, lugn och utan stor bild: dagens datum, hälsningen ("God morgon, Viktor") och
 * profilbilden med streaken uppe till höger (ett tryck: Mitt Österlen). Under hälsningen en enda
 * stillsam rad med vädret, som en mening: "12° och halvklart i Simrishamn" — där man är om man är
 * på Österlen, annars Simrishamn.
 *
 * Raden sköter sin egen data (vädret, orten), så den ritar inte om resten av Hem.
 */
import { memo, useMemo } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { useProfile } from "@/hooks/useProfile";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { usePlaces, type Place } from "@/hooks/usePlaces";
import { useWeather, weatherIcon, type Weather } from "@/hooks/useWeather";
import { AvatarRing } from "@/components/profile/AvatarRing";
import { StreakPill } from "@/components/streak/StreakPill";
import { useTheme } from "@/theme/ThemeProvider";
import { initialsOf, toneOnTone } from "@/lib/color";
import { distanceMeters } from "@/lib/checkin";
import { formatDate } from "@/i18n/dates";

const AVATAR = 52;
/** Simrishamn: vädret visas därifrån om man inte är på Österlen */
const SIMRISHAMN = { lat: 55.5565, lng: 14.3503 };
/** Så långt från Simrishamn man räknas vara "på Österlen" */
const OSTERLEN_KM = 60;

const NO_PLACES: Place[] = [];

/** Tidsberoende hälsning, med förnamnet om det finns ("God morgon, Viktor") */
export function greeting(firstName: string | null, now = new Date()): string {
  const h = now.getHours();
  const part = h >= 5 && h < 12 ? "morning" : h >= 12 && h < 15 ? "day" : h >= 15 && h < 18 ? "afternoon" : "evening";
  const word = i18n.t(`home.greeting.${part}`);
  return firstName ? i18n.t("home.greetingName", { greeting: word, name: firstName }) : word;
}

export const HomeHeader = memo(function HomeHeader({ location }: { location: { lat: number; lng: number } | null }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: profile } = useProfile();
  useTranslation(); // ritas om när språket byts
  const firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? null;
  const today = formatDate(new Date(), "EEEE d MMMM").toUpperCase();

  return (
    // Listan på Hem börjar under statusraden (så dra-ner-snurran syns), så här räcker en vanlig marginal
    <View style={[s.wrap, { paddingTop: 14 }]}>
      <View style={s.top}>
        <View style={{ flex: 1 }}>
          <Text style={[s.date, { color: colors.muted }]}>{today}</Text>
          <Text style={[s.greeting, { color: colors.text }]} numberOfLines={2}>
            {greeting(firstName)}
          </Text>
        </View>
        {/* Streaken och profilbilden — ett enda tryck som leder till Mitt Österlen */}
        <TouchableOpacity style={s.avatarGroup} onPress={() => router.push("/mitt-osterlen")} activeOpacity={0.85}>
          <View style={s.streakOverlap}>
            <StreakPill />
          </View>
          <HomeAvatar size={AVATAR} />
        </TouchableOpacity>
      </View>
      <WeatherLine location={location} />
    </View>
  );
});

/** Profilbilden (med vald ring), initialer om bild saknas */
export function HomeAvatar({ size }: { size: number }) {
  const { data: profile } = useProfile();
  const avatarUrl = useAvatarUrl();
  const color = profile?.circle_color ?? "#2A2A2A";
  return (
    <AvatarRing ring={profile?.avatar_ring} size={size}>
      <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Text style={[s.initials, { fontSize: size * 0.36, color: toneOnTone(color) }]}>{initialsOf(profile?.display_name ?? "") || "?"}</Text>
        )}
      </View>
    </AvatarRing>
  );
}

/** "☀ 12° och halvklart i Simrishamn" (blåser det: "12°, halvklart och blåsigt i …") */
function WeatherLine({ location }: { location: { lat: number; lng: number } | null }) {
  const { colors, scheme } = useTheme();
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

  // Höjden finns från början, så inget under hoppar ner när vädret kommit
  return (
    <View style={s.weather}>
      {weather && <WeatherText weather={weather} town={where.town} dark={scheme === "dark"} muted={colors.muted} text={colors.text} />}
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

function WeatherText({ weather, town, dark, muted, text }: {
  weather: Weather; town: string; dark: boolean; muted: string; text: string;
}) {
  const { t } = useTranslation();
  const Icon = weatherIcon(weather);
  const sky = t(`weather.${weather.sky}`);
  const rest = t(weather.wind >= 10 ? "home.weatherRestWindy" : "home.weatherRest", { sky, town });
  return (
    <>
      <Icon size={16} color={weatherColor(weather, dark, muted)} strokeWidth={2.2} />
      <Text style={[s.weatherText, { color: muted }]} numberOfLines={1}>
        <Text style={{ color: text, fontFamily: "Inter_600SemiBold" }}>{weather.temp}°</Text>{rest}
      </Text>
    </>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 16 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  date: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.6 },
  greeting: { fontFamily: "Montserrat_700Bold", fontSize: 28, lineHeight: 34, letterSpacing: -0.7, marginTop: 8 },
  avatarGroup: { flexDirection: "row", alignItems: "flex-end", marginTop: 4 },
  // Pillens högra kant ligger ovanpå profilbildens vänstra kant, nere vid bildens nederkant
  streakOverlap: { marginRight: -14, marginBottom: -4, zIndex: 2 },
  // Ingen egen kant — en ring runt profilbilden finns bara om man valt en i Utseende (AvatarRing)
  avatar: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  initials: { fontFamily: "Montserrat_700Bold" },
  weather: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, minHeight: 20 },
  weatherText: { flexShrink: 1, fontFamily: "Inter_400Regular", fontSize: 14.5 },
});
