import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Linking,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  MapPin,
  Navigation,
  Phone,
  Mail,
  Globe,
} from "lucide-react-native";
import { FontAwesome } from "@expo/vector-icons";
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

function openNavigation(lat?: number | null, lng?: number | null, name?: string) {
  if (lat && lng) {
    const url = Platform.select({
      ios: `maps://?daddr=${lat},${lng}&dirflg=d`,
      android: `google.navigation:q=${lat},${lng}`,
    }) ?? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
    });
  } else if (name) {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`);
  }
}

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  // Build action pills
  type Pill = { label: string; icon: React.ReactNode; onPress: () => void };
  const pills: Pill[] = [];
  if (place.website_url)
    pills.push({ label: "Hemsida", icon: <Globe size={16} color={colors.gold} />, onPress: () => Linking.openURL(place.website_url!) });
  if (place.phone)
    pills.push({ label: "Ring", icon: <Phone size={16} color={colors.gold} />, onPress: () => Linking.openURL(`tel:${place.phone}`) });
  if (place.email)
    pills.push({ label: "E-post", icon: <Mail size={16} color={colors.gold} />, onPress: () => Linking.openURL(`mailto:${place.email}`) });
  if (place.instagram_url)
    pills.push({ label: "Instagram", icon: <FontAwesome name="instagram" size={16} color={colors.gold} />, onPress: () => Linking.openURL(place.instagram_url!) });
  if (place.facebook_url)
    pills.push({ label: "Facebook", icon: <FontAwesome name="facebook" size={16} color={colors.gold} />, onPress: () => Linking.openURL(place.facebook_url!) });

  const hasNav = !!(place.lat || place.lng || place.name);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: hasNav ? 90 + insets.bottom : 24 }}
      >
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
          {/* Header: circle logo + name/meta */}
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

          {/* Action pills — horizontal scroll */}
          {pills.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.pillsScroll}
              contentContainerStyle={styles.pillsContent}
            >
              {pills.map((p) => (
                <TouchableOpacity key={p.label} style={styles.pill} onPress={p.onPress} activeOpacity={0.75}>
                  {p.icon}
                  <Text style={styles.pillText}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Description */}
          {(place.description || place.short_description) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Om platsen</Text>
              <Text style={styles.description}>
                {place.description ?? place.short_description}
              </Text>
            </View>
          )}


          {/* Opening hours */}
          <OpeningHoursSection hours={openingHours} />
        </View>
      </ScrollView>

      {/* Fixed Navigera button */}
      {hasNav && (
        <View style={[styles.navBarWrapper, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={styles.navButton}
            activeOpacity={0.85}
            onPress={() => openNavigation(place.lat, place.lng, place.name)}
          >
            <Navigation size={20} color="#1a1200" />
            <Text style={styles.navButtonText}>Navigera</Text>
          </TouchableOpacity>
        </View>
      )}
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
  header: { flexDirection: "row", gap: 12, marginBottom: 16, alignItems: "center" },
  logo: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#ffffff" },
  name: { fontSize: 22, fontWeight: "800", color: colors.foreground, marginBottom: 4 },
  meta: { gap: 4 },
  category: { fontSize: 13, color: colors.foregroundMuted },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { fontSize: 13, color: colors.foregroundMuted },

  // Action pills
  pillsScroll: { marginBottom: 20 },
  pillsContent: { paddingRight: 16, gap: 8, flexDirection: "row" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pillText: { fontSize: 13, fontWeight: "600", color: colors.foreground },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 10 },
  description: { fontSize: 15, color: colors.foreground, lineHeight: 24 },

  hoursRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  hoursDay: { fontSize: 14, color: colors.foregroundMuted, width: 100 },
  hoursDayToday: { color: colors.primary, fontWeight: "700" },
  hoursTime: { fontSize: 14, color: colors.foreground },
  hoursTimeToday: { color: colors.primary, fontWeight: "700" },

  // Navigate button
  navBarWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  navButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.gold,
    paddingVertical: 15,
    borderRadius: 28,
    shadowColor: colors.gold,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  navButtonText: { fontSize: 16, fontWeight: "700", color: "#1a1200" },
});
