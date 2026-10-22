/**
 * Rutan högst upp på Hem: "Du verkar vara vid X". Genväg till platssidan där
 * "Jag är här!" väntar — den checkar inte in något själv.
 *
 * Visas bara om EXAKT en plats ligger inom incheckningsradien. Ligger två
 * eller fler där kan appen inte veta vilken du menar (GPS är inte så exakt),
 * och då visas ingenting. Inte heller om du redan checkat in där nyss.
 */
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { MapPin, ChevronRight } from "lucide-react-native";
import type { Place } from "@/hooks/usePlaces";
import { useVisits } from "@/hooks/useVisits";
import { CHECKIN_RADIUS_M, placesNear, cooldownEnd } from "@/lib/checkin";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export function NearbyCheckInPrompt({
  places, lat, lng,
}: { places: Place[]; lat: number | null; lng: number | null }) {
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { t } = useTranslation();
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
      onPress={() => router.push(`/place/${place.id}?from=checkin`)}
    >
      <View style={s.iconCircle}>
        <MapPin size={22} color={colors.goldText} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.small}>{t("home.nearby.checkInAt")}</Text>
        <Text style={s.name} numberOfLines={1}>{place.name}</Text>
        <Text style={s.sub}>{t("home.nearby.tapToCheckIn")}</Text>
      </View>
      <ChevronRight size={20} color={colors.goldText} strokeWidth={2} />
    </TouchableOpacity>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginTop: 16, padding: 14, borderRadius: 20,
    backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.goldBorder,
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: c.goldSoft, borderWidth: 1, borderColor: c.goldBorder,
  },
  small: { fontFamily: "Inter_400Regular", fontSize: 12, color: c.muted },
  name: { fontFamily: "Montserrat_700Bold", fontSize: 17, color: c.text, marginTop: 1 },
  sub: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: c.goldText, marginTop: 2 },
});
