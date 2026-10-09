/**
 * "Jag är här!" på en platssida.
 *
 * Positionen hämtas en gång när sidan öppnas (och på nytt precis vid trycket,
 * eftersom användaren kan ha gått en bit sen dess). Inget körs i bakgrunden.
 *
 * Lägen: långt bort (>500 m) = inget alls · 100–500 m = grå knapp med avstånd
 * · inom 100 m = aktiv knapp (håll inne, se HoldToCheckIn) · nyss incheckad = spärrtiden visas.
 * Efter en lyckad incheckning: hela belöningen (CheckInCelebration — stämpeln, progressen och
 * "Skapa minne").
 */
import { useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from "react-native";
import { useRouter } from "expo-router";
import { MapPin, CheckCircle2 } from "lucide-react-native";
import type { Place } from "@/hooks/usePlaces";
import { useVisits, useCheckIn, CheckInCooldownError } from "@/hooks/useVisits";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useTrophies, useGrantNewTrophies } from "@/hooks/useTrophies";
import { fetchMyMonthStanding, type LeaderboardEntry } from "@/hooks/useLeaderboard";
import {
  CHECKIN_RADIUS_M, CHECKIN_NEAR_M, distanceMeters, formatDistance, cooldownEnd, formatClock,
} from "@/lib/checkin";
import { CheckInCelebration, type CelebrationExit, type CelebrationState } from "./CheckInCelebration";
import { HoldToCheckIn } from "./HoldToCheckIn";

const GOLD = "#C9A24C";
const GOLD_LT = "#E6C77A";

export function CheckInSection({ place }: { place: Place }) {
  // Saknar platsen koordinater kan GPS inte avgöra något (QR-kod kommer senare)
  const canCheckIn = place.checkin_enabled !== false && place.lat != null && place.lng != null;

  const router = useRouter();
  const { location, refresh } = useUserLocation(canCheckIn);
  const { data: visits = [] } = useVisits();
  const checkIn = useCheckIn();
  const { trophies, stats, isLoading } = useTrophies();
  useGrantNewTrophies(trophies, !isLoading);

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
        setMessage("Kunde inte hämta din plats. Försök igen.");
        return;
      }
      const d = distanceMeters(fresh.lat, fresh.lng, place.lat!, place.lng!);
      if (d > CHECKIN_RADIUS_M) {
        setCelebration(null);
        setMessage(`Du verkar vara ${formatDistance(d)} bort. Kom närmare och försök igen.`);
        return;
      }
      const visit = await checkIn.mutateAsync({ placeId: place.id });
      setCelebration((cur) => (cur ? { ...cur, status: "done", visitId: visit.id } : cur));
    } catch (e) {
      setCelebration(null);
      setMessage(
        e instanceof CheckInCooldownError
          ? "Du har redan checkat in här nyligen."
          : __DEV__ && e instanceof Error
            ? `Något gick fel: ${e.message}` // tekniskt fel syns bara under utveckling
            : "Något gick fel. Försök igen."
      );
    } finally {
      setBusy(false);
    }
  };

  // Belöningen stängs först, navigeringen sker en kort stund senare — att byta sida medan en
  // modal håller på att stängas kan låsa sig på iOS
  const handleCelebrationClose = (exit?: CelebrationExit) => {
    setCelebration(null);
    if (!exit) return;
    setTimeout(() => {
      if (exit === "offers") router.push("/offers" as any);
      else if (exit === "memory") router.push({ pathname: "/memories/edit", params: { placeId: String(place.id), title: `Besök på ${place.name}` } } as any);
      else router.push(`/place/${exit.placeId}` as any);
    }, 300);
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
          <View style={s.iconCircle}><CheckCircle2 size={22} color={GOLD_LT} strokeWidth={2} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Besök registrerat</Text>
            <Text style={s.sub}>Du kan checka in här igen efter {formatClock(blockedUntil)}</Text>
          </View>
        </View>
      </View>
    );
  } else if (location.status === "loading") {
    card = (
      <View style={[s.card, s.row]}>
        <ActivityIndicator size="small" color={GOLD} />
        <Text style={[s.sub, { marginTop: 0 }]}>Kollar din plats…</Text>
      </View>
    );
  } else if (location.status === "denied") {
    card = (
      <View style={s.card}>
        <View style={s.row}>
          <View style={s.iconCircle}><MapPin size={22} color={GOLD_LT} strokeWidth={2} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Slå på platstjänster</Text>
            <Text style={s.sub}>Appen behöver veta var du är för att du ska kunna checka in.</Text>
          </View>
        </View>
        <TouchableOpacity style={s.buttonGrey} activeOpacity={0.8} onPress={() => Linking.openSettings()}>
          <Text style={s.buttonGreyText}>Öppna inställningar</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (location.status === "unavailable") {
    card = (
      <View style={s.card}>
        <View style={s.row}>
          <View style={s.iconCircle}><MapPin size={22} color={GOLD_LT} strokeWidth={2} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Kunde inte hämta din plats</Text>
            <Text style={s.sub}>Kontrollera att platstjänster är påslagna.</Text>
          </View>
        </View>
        <TouchableOpacity style={s.buttonGrey} activeOpacity={0.8} onPress={handleRecheck}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.buttonGreyText}>Försök igen</Text>}
        </TouchableOpacity>
      </View>
    );
  } else if (distance != null && distance <= CHECKIN_RADIUS_M) {
    card = (
      <View style={s.card}>
        <View style={s.row}>
          <View style={s.iconCircle}><MapPin size={22} color={GOLD_LT} strokeWidth={2} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Du är på plats</Text>
            <Text style={s.sub}>Registrera ditt besök här</Text>
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
          <View style={s.iconCircle}><MapPin size={22} color="rgba(255,255,255,0.45)" strokeWidth={2} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Du är {formatDistance(distance)} bort</Text>
            <Text style={s.sub}>Kom närmare för att kunna checka in</Text>
          </View>
        </View>
        <TouchableOpacity style={s.buttonGrey} activeOpacity={0.8} onPress={handleRecheck}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.buttonGreyText}>Jag är här!</Text>}
        </TouchableOpacity>
        {message && <Text style={s.message}>{message}</Text>}
      </View>
    );
  }
  // Längre bort än 500 m: ingen knapp alls

  return (
    <>
      {card}
      {celebration && <CheckInCelebration place={place} state={celebration} onClose={handleCelebrationClose} />}
    </>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginTop: 20, marginBottom: 12, padding: 16, borderRadius: 20,
    backgroundColor: "#1A1A1D", borderWidth: 0.5, borderColor: "rgba(197,160,89,0.35)",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(212,168,79,0.12)", borderWidth: 1, borderColor: "rgba(197,160,89,0.40)",
  },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 17, color: "#FFFFFF" },
  sub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.60)", marginTop: 2 },
  buttonGrey: {
    marginTop: 14, height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  buttonGreyText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: "rgba(255,255,255,0.45)" },
  message: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#E8A0A0", marginTop: 10, textAlign: "center" },
});
