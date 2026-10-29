/**
 * "Jag är här!" på en platssida.
 *
 * Positionen hämtas en gång när sidan öppnas (och på nytt precis vid trycket,
 * eftersom användaren kan ha gått en bit sen dess). Inget körs i bakgrunden.
 *
 * Lägen: långt bort (>500 m) = inget alls · 100–500 m = grå knapp med avstånd
 * · inom 100 m = aktiv knapp (håll inne, se HoldToCheckIn) · nyss incheckad = spärrtiden visas.
 * Medan positionen hämtas visas inget (oftast är man långt bort, och då ska inget dyka upp och
 * försvinna igen); kortet glider in när det har något att säga.
 * Efter en lyckad incheckning: hela belöningen (CheckInCelebration — stämpeln, progressen och
 * "Skapa minne").
 */
import { useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import Reanimated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { MapPin, CheckCircle2 } from "lucide-react-native";
import type { Place } from "@/hooks/usePlaces";
import { useVisits, useCheckIn, CheckInCooldownError, CheckInTooFarError } from "@/hooks/useVisits";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useTrophies } from "@/hooks/useTrophies";
import { fetchMyMonthStanding, type LeaderboardEntry } from "@/hooks/useLeaderboard";
import {
  CHECKIN_RADIUS_M, CHECKIN_NEAR_M, distanceMeters, formatDistance, cooldownEnd, formatClock,
} from "@/lib/checkin";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { CheckInCelebration, type CelebrationExit, type CelebrationState } from "./CheckInCelebration";
import { HoldToCheckIn } from "./HoldToCheckIn";
import i18n from "i18next";
import { isNetworkError } from "@/lib/network";
import { pushOnce } from "@/lib/navigateOnce";

export function CheckInSection({ place }: { place: Place }) {
  // Saknar platsen koordinater kan GPS inte avgöra något (QR-kod kommer senare)
  const canCheckIn = place.checkin_enabled !== false && place.lat != null && place.lng != null;

  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { location, refresh } = useUserLocation(canCheckIn);
  const { data: visits = [] } = useVisits();
  const checkIn = useCheckIn();
  const { trophies, stats } = useTrophies();

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<CelebrationState | null>(null);
  // Positionen och min rad i månadens topplista börjar hämtas redan när man trycker ner — väntan
  // döljs i hålla-inne-ritualen
  const freshLocation = useRef<ReturnType<typeof refresh> | null>(null);
  const monthBefore = useRef<Promise<LeaderboardEntry | null> | null>(null);

  if (!canCheckIn) return null;

  const blockedUntil = cooldownEnd(visits, place.id);
  const distance =
    location.status === "ready"
      ? distanceMeters(location.lat, location.lng, place.lat!, place.lng!)
      : null;

  const handleCheckIn = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    // Besöken är sorterade nyast först — första träffen är förra gången man var här
    const here = visits.filter((v) => v.place_id === place.id);
    // Kortet reser sig direkt — stämpeln slår först när servern bekräftat
    setCelebration({
      status: "pending",
      firstVisit: here.length === 0,
      visitNumber: here.length + 1,
      lastVisitAt: here[0]?.visited_at ?? null,
      trophiesBefore: trophies,
      uniqueBefore: stats.uniqueVisits,
      monthBefore: monthBefore.current ?? fetchMyMonthStanding().catch(() => null),
      visitId: null,
    });
    monthBefore.current = null;
    try {
      // Ny position precis nu — den från sidans öppnande kan vara gammal
      const fresh = await (freshLocation.current ?? refresh());
      freshLocation.current = null;
      if (fresh.status !== "ready") {
        setCelebration(null);
        setMessage(i18n.t("checkin.noLocation"));
        return;
      }
      const d = distanceMeters(fresh.lat, fresh.lng, place.lat!, place.lng!);
      if (d > CHECKIN_RADIUS_M) {
        setCelebration(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setMessage(i18n.t("checkin.tooFarDistance", { distance: formatDistance(d) }));
        return;
      }
      const visit = await checkIn.mutateAsync({ placeId: place.id, lat: fresh.lat, lng: fresh.lng });
      setCelebration((cur) => (cur ? { ...cur, status: "done", visitId: visit.id } : cur));
    } catch (e) {
      setCelebration(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setMessage(
        e instanceof CheckInCooldownError
          ? i18n.t("checkin.cooldown")
          : e instanceof CheckInTooFarError
            ? i18n.t("checkin.tooFar")
          : isNetworkError(e)
            ? i18n.t("common.offlineAction")
          : __DEV__ && e instanceof Error
            ? `Något gick fel: ${e.message}` // tekniskt fel syns bara under utveckling
            : i18n.t("checkin.failed")
      );
    } finally {
      setBusy(false);
    }
  };

  // Belöningen tonar själv ut. En sida som ska öppnas läggs bakom den medan den fortfarande täcker
  // skärmen, så man aldrig skymtar platssidan på vägen
  const handleCelebrationNavigate = (exit: CelebrationExit) => {
    if (exit === "offers") pushOnce(router, "/offers");
    else if (exit === "memory") pushOnce(router, { pathname: "/memories/edit", params: { placeId: String(place.id), title: i18n.t("checkin.memoryTitle", { place: place.name }) } });
    else pushOnce(router, `/place/${exit.placeId}?from=checkin`);
  };

  const handleRecheck = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    await refresh();
    setBusy(false);
  };

  let card: React.ReactNode = null;

  if (blockedUntil) {
    card = (
      <View style={s.card}>
        <View style={s.row}>
          <View style={s.iconCircle}><CheckCircle2 size={22} color={colors.goldText} strokeWidth={2} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{i18n.t("checkin.registered")}</Text>
            <Text style={s.sub}>{i18n.t("checkin.againAfter", { time: formatClock(blockedUntil) })}</Text>
          </View>
        </View>
      </View>
    );
  } else if (location.status === "loading") {
    card = null;
  } else if (location.status === "denied") {
    card = (
      <View style={s.card}>
        <View style={s.row}>
          <View style={s.iconCircle}><MapPin size={22} color={colors.goldText} strokeWidth={2} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{i18n.t("checkin.turnOn")}</Text>
            <Text style={s.sub}>{i18n.t("checkin.turnOnText")}</Text>
          </View>
        </View>
        <TouchableOpacity style={s.buttonGrey} activeOpacity={0.8} onPress={() => Linking.openSettings()}>
          <Text style={s.buttonGreyText}>{i18n.t("checkin.openSettings")}</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (location.status === "unavailable") {
    card = (
      <View style={s.card}>
        <View style={s.row}>
          <View style={s.iconCircle}><MapPin size={22} color={colors.goldText} strokeWidth={2} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{i18n.t("checkin.noFix")}</Text>
            <Text style={s.sub}>{i18n.t("checkin.noFixText")}</Text>
          </View>
        </View>
        <TouchableOpacity style={s.buttonGrey} activeOpacity={0.8} onPress={handleRecheck}>
          <Text style={s.buttonGreyText}>{i18n.t(busy ? "checkin.checking" : "checkin.retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (distance != null && distance <= CHECKIN_RADIUS_M) {
    card = (
      <View style={s.card}>
        <View style={s.row}>
          <View style={s.iconCircle}><MapPin size={22} color={colors.goldText} strokeWidth={2} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{i18n.t("checkin.here")}</Text>
            <Text style={s.sub}>{i18n.t("checkin.hereText")}</Text>
          </View>
        </View>
        <HoldToCheckIn
          disabled={busy}
          onStart={() => {
            freshLocation.current = refresh();
            monthBefore.current = fetchMyMonthStanding().catch(() => null);
          }}
          onComplete={handleCheckIn}
        />
        {message && <Text style={s.message}>{message}</Text>}
      </View>
    );
  } else if (distance != null && distance <= CHECKIN_NEAR_M) {
    card = (
      <View style={s.card}>
        <View style={s.row}>
          <View style={s.iconCircle}><MapPin size={22} color={colors.faint} strokeWidth={2} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{i18n.t("checkin.distance", { distance: formatDistance(distance) })}</Text>
            <Text style={s.sub}>{i18n.t("checkin.closer")}</Text>
          </View>
        </View>
        <TouchableOpacity style={s.buttonGrey} activeOpacity={0.8} onPress={handleRecheck}>
          <Text style={s.buttonGreyText}>{i18n.t(busy ? "checkin.checking" : "checkin.imHere")}</Text>
        </TouchableOpacity>
        {message && <Text style={s.message}>{message}</Text>}
      </View>
    );
  }
  // Längre bort än 500 m: ingen knapp alls

  return (
    <>
      {card && <Reanimated.View entering={FadeInDown.duration(320)}>{card}</Reanimated.View>}
      {celebration && <CheckInCelebration place={place} state={celebration} onNavigate={handleCelebrationNavigate} onClose={() => setCelebration(null)} />}
    </>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  card: {
    marginHorizontal: 16, marginTop: 20, marginBottom: 4, padding: 16, borderRadius: 20,
    backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.goldBorder,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: c.goldSoft, borderWidth: 1, borderColor: c.goldBorder,
  },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 17, color: c.text },
  sub: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.muted, marginTop: 2 },
  buttonGrey: {
    marginTop: 14, height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center",
    backgroundColor: c.fill, borderWidth: 1, borderColor: c.borderStrong,
  },
  buttonGreyText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: c.muted },
  message: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.danger, marginTop: 10, textAlign: "center" },
});
