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
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  MapPin,
  Navigation,
  Phone,
  Mail,
  Globe,
  Calendar,
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
  const bookUrl = (place as any).book_url as string | null | undefined;
  const hasBook = !!bookUrl;
  const hasNav = !!(place.lat || place.lng || place.name);

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
  // When Boka is the primary CTA, add Navigera as a pill too
  if (hasBook && hasNav)
    pills.push({ label: "Navigera", icon: <Navigation size={16} color={colors.gold} />, onPress: () => openNavigation(place.lat, place.lng, place.name) });

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 90 + insets.bottom }}
      >
        {/* Hero image with gradient fade */}
        <View style={styles.heroContainer}>
          {place.image_url ? (
            <Image source={{ uri: place.image_url }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]} />
          )}
          {/* Smooth gradient fade: transparent → app background */}
          <LinearGradient
            colors={["transparent", colors.background]}
            style={styles.heroGradient}
            pointerEvents="none"
          />
          {/* Back button */}
          <TouchableOpacity
            style={[styles.backButton, { top: insets.top + 12 }]}
            onPress={() => router.back()}
          >
            <ArrowLeft size={22} color="#fff" />
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
                {/* Location FIRST, then category */}
                {place.nearest_town && (
                  <View style={styles.locationRow}>
                    <MapPin size={13} color={colors.foregroundMuted} />
                    <Text style={styles.locationText}>{place.nearest_town}</Text>
                  </View>
                )}
                {place.categories && (
                  <Text style={styles.category}>{place.categories}</Text>
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

      {/* Fixed primary CTA button */}
      <View style={[styles.navBarWrapper, { paddingBottom: insets.bottom + 12 }]}>
        {hasBook ? (
          <TouchableOpacity
            style={styles.navButton}
            activeOpacity={0.85}
            onPress={() => Linking.openURL(bookUrl!)}
          >
            <Calendar size={20} color="#1a1200" />
            <Text style={styles.navButtonText}>Boka</Text>
          </TouchableOpacity>
        ) : hasNav ? (
          <TouchableOpacity
            style={styles.navButton}
            activeOpacity={0.85}
            onPress={() => openNavigation(place.lat, place.lng, place.name)}
          >
            <Navigation size={20} color="#1a1200" />
            <Text style={styles.navButtonText}>Navigera</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: colors.foregroundMuted, fontSize: 16 },

  // Hero
  heroContainer: { position: "relative" },
  heroImage: { width: "100%", height: 340 },
  heroPlaceholder: { backgroundColor: colors.surface },
  heroGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  backButton: {
    position: "absolute",
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

  // Content
  content: { padding: 16 },
  header: { flexDirection: "row", gap: 12, marginBottom: 16, alignItems: "center" },
  logo: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#ffffff" },
  name: { fontSize: 22, fontWeight: "800", color: colors.foreground, marginBottom: 4 },
  meta: { gap: 3 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { fontSize: 13, color: colors.foregroundMuted },
  category: { fontSize: 13, color: colors.foregroundMuted },

  // Action pills
  pillsScroll: { marginBottom: 20 },
  pillsContent: { paddingRight: 16, gap: 8, flexDirection: "row" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pillText: { fontSize: 14, fontWeight: "600", color: colors.foreground },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 10 },
  description: { fontSize: 15, color: "#A8A192", lineHeight: 24 },

  hoursRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  hoursDay: { fontSize: 14, color: colors.foregroundMuted, width: 100 },
  hoursDayToday: { color: colors.primary, fontWeight: "700" },
  hoursTime: { fontSize: 14, color: colors.foreground },
  hoursTimeToday: { color: colors.primary, fontWeight: "700" },

  // CTA button bar
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
    backgroundColor: "rgba(200, 146, 42, 0.85)",
    paddingVertical: 17,
    borderRadius: 28,
    shadowColor: colors.gold,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 5,
  },
  navButtonText: { fontSize: 17, fontWeight: "700", color: "#1a1200" },
});
