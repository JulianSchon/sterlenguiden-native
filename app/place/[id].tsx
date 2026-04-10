import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Linking,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  Globe,
  ExternalLink,
} from "lucide-react-native";
import { supabase } from "@/integrations/supabase/client";
import { isPlaceOpen, type Place } from "@/hooks/usePlaces";
import { colors } from "@/lib/colors";

function usePlaceDetail(id: string) {
  return useQuery({
    queryKey: ["place", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("places")
        .select("*")
        .eq("id", Number(id))
        .single();
      if (error) throw error;
      return { ...data, category: data.categories } as Place;
    },
  });
}

function OpeningHoursSection({
  hours,
}: {
  hours: Record<string, string> | null;
}) {
  if (!hours) return null;
  const days = [
    "Måndag",
    "Tisdag",
    "Onsdag",
    "Torsdag",
    "Fredag",
    "Lördag",
    "Söndag",
  ];
  const now = new Date();
  const todayName = days[now.getDay() === 0 ? 6 : now.getDay() - 1];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Öppettider</Text>
      {days.map((day) => (
        <View key={day} style={styles.hoursRow}>
          <Text
            style={[styles.hoursDay, day === todayName && styles.hoursDayToday]}
          >
            {day}
          </Text>
          <Text
            style={[
              styles.hoursTime,
              day === todayName && styles.hoursTimeToday,
            ]}
          >
            {hours[day] ?? "—"}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: place, isLoading, error } = usePlaceDetail(id ?? "");

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !place) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Platsen hittades inte</Text>
        </View>
      </SafeAreaView>
    );
  }

  const open = isPlaceOpen(place.opening_hours as Record<string, string> | null);
  const openingHours = place.opening_hours as Record<string, string> | null;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero image */}
        <View style={styles.heroContainer}>
          {place.image_url ? (
            <Image source={{ uri: place.image_url }} style={styles.heroImage} />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]} />
          )}
          {/* Back button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={22} color={colors.card} />
          </TouchableOpacity>
          {/* Open/closed badge */}
          {place.opening_hours && (
            <View
              style={[
                styles.openBadge,
                open ? styles.openBadgeOpen : styles.openBadgeClosed,
              ]}
            >
              <Text
                style={[
                  styles.openBadgeText,
                  open ? styles.openTextOpen : styles.openTextClosed,
                ]}
              >
                {open ? "Öppet nu" : "Stängt"}
              </Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            {place.logo_url && (
              <Image source={{ uri: place.logo_url }} style={styles.logo} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{place.name}</Text>
              <View style={styles.meta}>
                {place.categories && (
                  <Text style={styles.category}>{place.categories}</Text>
                )}
                {place.nearest_town && (
                  <View style={styles.locationRow}>
                    <MapPin size={13} color={colors.foregroundMuted} />
                    <Text style={styles.locationText}>{place.nearest_town}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Description */}
          {place.description || place.short_description ? (
            <View style={styles.section}>
              <Text style={styles.description}>
                {place.description ?? place.short_description}
              </Text>
            </View>
          ) : null}

          {/* Contact */}
          {(place.phone || place.email || place.website_url) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Kontakt</Text>
              {place.phone && (
                <TouchableOpacity
                  style={styles.contactRow}
                  onPress={() => Linking.openURL(`tel:${place.phone}`)}
                >
                  <Phone size={18} color={colors.primary} />
                  <Text style={styles.contactText}>{place.phone}</Text>
                </TouchableOpacity>
              )}
              {place.email && (
                <TouchableOpacity
                  style={styles.contactRow}
                  onPress={() => Linking.openURL(`mailto:${place.email}`)}
                >
                  <Mail size={18} color={colors.primary} />
                  <Text style={styles.contactText}>{place.email}</Text>
                </TouchableOpacity>
              )}
              {place.website_url && (
                <TouchableOpacity
                  style={styles.contactRow}
                  onPress={() => Linking.openURL(place.website_url!)}
                >
                  <Globe size={18} color={colors.primary} />
                  <Text style={styles.contactText}>{place.website_url}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Social */}
          {(place.instagram_url || place.facebook_url) && (
            <View style={styles.socialRow}>
              {place.instagram_url && (
                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={() => Linking.openURL(place.instagram_url!)}
                >
                  <ExternalLink size={20} color="#E1306C" />
                  <Text style={styles.socialText}>Instagram</Text>
                </TouchableOpacity>
              )}
              {place.facebook_url && (
                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={() => Linking.openURL(place.facebook_url!)}
                >
                  <ExternalLink size={20} color="#1877F2" />
                  <Text style={styles.socialText}>Facebook</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Opening hours */}
          <OpeningHoursSection hours={openingHours} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: colors.foregroundMuted, fontSize: 16 },
  heroContainer: { position: "relative" },
  heroImage: { width: "100%", height: 280 },
  heroPlaceholder: { backgroundColor: colors.surface },
  backButton: {
    position: "absolute",
    top: 52,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  openBadge: {
    position: "absolute",
    bottom: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  openBadgeOpen: { backgroundColor: colors.successBg },
  openBadgeClosed: { backgroundColor: colors.errorBg },
  openBadgeText: { fontSize: 12, fontWeight: "700" },
  openTextOpen: { color: colors.successText },
  openTextClosed: { color: colors.errorText },
  content: { padding: 16 },
  header: { flexDirection: "row", gap: 12, marginBottom: 16, alignItems: "flex-start" },
  logo: { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.surface },
  name: { fontSize: 22, fontWeight: "800", color: colors.foreground, marginBottom: 4 },
  meta: { gap: 4 },
  category: { fontSize: 13, color: colors.foregroundMuted },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { fontSize: 13, color: colors.foregroundMuted },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 10 },
  description: { fontSize: 15, color: colors.foreground, lineHeight: 24 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  contactText: { fontSize: 15, color: colors.primary, flex: 1 },
  socialRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  socialButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  socialText: { fontSize: 14, fontWeight: "600", color: colors.foreground },
  hoursRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  hoursDay: { fontSize: 14, color: colors.foregroundMuted, width: 100 },
  hoursDayToday: { color: colors.primary, fontWeight: "700" },
  hoursTime: { fontSize: 14, color: colors.foreground },
  hoursTimeToday: { color: colors.primary, fontWeight: "700" },
});
