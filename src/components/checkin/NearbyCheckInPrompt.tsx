/**
 * Rutan högst upp på Hem: "Du verkar vara vid X". Genväg till platssidan där
 * "Jag är här!" väntar — den checkar inte in något själv.
 *
 * Visas bara om EXAKT en plats ligger inom incheckningsradien. Ligger två
 * eller fler där kan appen inte veta vilken du menar (GPS är inte så exakt),
 * och då visas ingenting. Inte heller om du redan checkat in där nyss.
 */
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { MapPin, ChevronRight } from "lucide-react-native";
import type { Place } from "@/hooks/usePlaces";
import { useVisits } from "@/hooks/useVisits";
import { CHECKIN_RADIUS_M, placesNear, cooldownEnd } from "@/lib/checkin";

const GOLD_LT = "#E6C77A";

export function NearbyCheckInPrompt({
  places, lat, lng,
}: { places: Place[]; lat: number | null; lng: number | null }) {
  const router = useRouter();
  const { data: visits = [] } = useVisits();

  if (lat == null || lng == null) return null;
  const near = placesNear(places, lat, lng, CHECKIN_RADIUS_M);
  if (near.length !== 1) return null;

  const { place } = near[0];
  if (cooldownEnd(visits, place.id)) return null;

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.85}
      onPress={() => router.push(`/place/${place.id}` as any)}
    >
      <View style={s.iconCircle}>
        <MapPin size={22} color={GOLD_LT} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.small}>Du verkar vara vid</Text>
        <Text style={s.name} numberOfLines={1}>{place.name}</Text>
        <Text style={s.sub}>Tryck för att checka in</Text>
      </View>
      <ChevronRight size={20} color="rgba(230,199,122,0.8)" strokeWidth={2} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginTop: 12, marginBottom: 16, padding: 14, borderRadius: 20,
    backgroundColor: "#1A1A1D", borderWidth: 0.5, borderColor: "rgba(197,160,89,0.45)",
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(212,168,79,0.12)", borderWidth: 1, borderColor: "rgba(197,160,89,0.40)",
  },
  small: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.60)" },
  name: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: "#FFFFFF", marginTop: 1 },
  sub: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: GOLD_LT, marginTop: 2 },
});
