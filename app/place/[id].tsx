import { useState, useRef } from "react";
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
  Share,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  MapPin,
  Navigation,
  Phone,
  Mail,
  Globe,
  Calendar,
  Upload,
  Heart,
} from "lucide-react-native";
import { FontAwesome } from "@expo/vector-icons";
import { supabase } from "@/integrations/supabase/client";
import { isPlaceOpen, type Place } from "@/hooks/usePlaces";
import { colors } from "@/lib/colors";


const GOLD = "#C9A24C";
const CHARCOAL = "#121212";

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

function OpeningHoursSection({ hours }: { hours: Record<string, string> | null }) {
  if (!hours) return null;
  const days = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
  const now = new Date();
  const todayName = days[now.getDay() === 0 ? 6 : now.getDay() - 1];
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Öppettider</Text>
      {days.map((day) => (
        <View key={day} style={styles.hoursRow}>
          <Text style={[styles.hoursDay, day === todayName && styles.hoursDayToday]}>{day}</Text>
          <Text style={[styles.hoursTime, day === todayName && styles.hoursTimeToday]}>{hours[day] ?? "—"}</Text>
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

// Animated gold button with press scale
function GoldButton({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 50 }).start();
  const handlePressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.goldButtonOuter}
      >
        <View style={styles.goldButtonGradient}>
          <View style={styles.goldButtonInner}>
            {icon}
            <Text style={styles.goldButtonText}>{label}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Logo with gold ring + glow
function LogoRing({ uri }: { uri: string }) {
  return (
    <View style={styles.logoGlow}>
      <View style={styles.logoRing}>
        <View style={styles.logoInnerBorder}>
          <Image source={{ uri }} style={styles.logoImage} />
        </View>
      </View>
    </View>
  );
}

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: place, isLoading, error } = usePlaceDetail(id ?? "");

  const [favorited, setFavorited] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;

  const handleHeart = () => {
    setFavorited((f) => !f);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.3, useNativeDriver: true, speed: 80 }),
      Animated.spring(heartScale, { toValue: 0.9, useNativeDriver: true, speed: 80 }),
      Animated.spring(heartScale, { toValue: 1.1, useNativeDriver: true, speed: 80 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 80 }),
    ]).start();
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      </View>
    );
  }

  if (error || !place) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Platsen hittades inte</Text>
        </View>
      </View>
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
    pills.push({ label: "Hemsida", icon: <Globe size={14} color={GOLD} />, onPress: () => Linking.openURL(place.website_url!) });
  if (place.phone)
    pills.push({ label: "Ring", icon: <Phone size={14} color={GOLD} />, onPress: () => Linking.openURL(`tel:${place.phone}`) });
  if (place.email)
    pills.push({ label: "E-post", icon: <Mail size={14} color={GOLD} />, onPress: () => Linking.openURL(`mailto:${place.email}`) });
  if (place.instagram_url)
    pills.push({ label: "Instagram", icon: <FontAwesome name="instagram" size={14} color={GOLD} />, onPress: () => Linking.openURL(place.instagram_url!) });
  if (place.facebook_url)
    pills.push({ label: "Facebook", icon: <FontAwesome name="facebook" size={14} color={GOLD} />, onPress: () => Linking.openURL(place.facebook_url!) });
  if (hasBook && hasNav)
    pills.push({ label: "Navigera", icon: <Navigation size={14} color={GOLD} />, onPress: () => openNavigation(place.lat, place.lng, place.name) });

  const handleShare = () => {
    Share.share({ message: `${place.name} — ${place.nearest_town ?? "Österlen"}` });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
      >
        {/* Hero image with gradient fade */}
        <View style={styles.heroContainer}>
          {place.image_url ? (
            <Image source={{ uri: place.image_url }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]} />
          )}

          {/* Back button */}
          <TouchableOpacity
            style={[styles.circleBtn, { top: 56, left: 16 }]}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>

          {/* Share + Heart (top right) */}
          <View style={[styles.topRightButtons, { top: 56 }]}>
            <TouchableOpacity style={styles.circleBtn} onPress={handleShare} activeOpacity={0.8}>
              <Upload size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.circleBtn, styles.heartBtn]} onPress={handleHeart} activeOpacity={0.8}>
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Heart
                  size={20}
                  color={favorited ? "#B83434" : "#fff"}
                  fill={favorited ? "#B83434" : "transparent"}
                />
              </Animated.View>
            </TouchableOpacity>
          </View>

          {/* Open/closed badge */}
          {place.opening_hours && (
            <View style={[styles.openBadge, open ? styles.openBadgeOpen : styles.openBadgeClosed]}>
              <Text style={[styles.openBadgeText, open ? styles.openTextOpen : styles.openTextClosed]}>
                {open ? "Öppet nu" : "Stängt"}
              </Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Header: logo ring + name/meta */}
          <View style={styles.header}>
            {place.logo_url ? (
              <LogoRing uri={place.logo_url} />
            ) : (
              <View style={styles.logoPlaceholder} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{place.name}</Text>
              <View style={styles.meta}>
                {place.nearest_town && (
                  <View style={styles.locationRow}>
                    <MapPin size={13} color="#A8A192" />
                    <Text style={styles.locationText}>{place.nearest_town}</Text>
                  </View>
                )}
                {place.categories && (
                  <Text style={styles.category}>{place.categories}</Text>
                )}
              </View>
            </View>
          </View>

          {/* Action pills */}
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

          {/* Om platsen */}
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

      {/* Fixed CTA bar */}
      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 20 }]}>
        {hasBook ? (
          <GoldButton
            label="Boka"
            icon={<Calendar size={16} color={CHARCOAL} />}
            onPress={() => Linking.openURL(bookUrl!)}
          />
        ) : hasNav ? (
          <GoldButton
            label="Navigera"
            icon={<Navigation size={16} color={CHARCOAL} />}
            onPress={() => openNavigation(place.lat, place.lng, place.name)}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CHARCOAL },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#A8A192", fontSize: 16 },

  // Hero
  heroContainer: { position: "relative" },
  heroImage: { width: "100%", height: 340 },
  heroPlaceholder: { backgroundColor: "#1E1E1E" },

  // Top buttons
  circleBtn: {
    position: "absolute",
    width: 48, height: 48, borderRadius: 9999,
    backgroundColor: "rgba(0,0,0,0.40)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  topRightButtons: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    gap: 0,
  },
  heartBtn: {
    position: "relative",
    marginLeft: -12,
  },

  // Open badge
  openBadge: {
    position: "absolute", bottom: 12, right: 12,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  openBadgeOpen: { backgroundColor: colors.successBg },
  openBadgeClosed: { backgroundColor: colors.errorBg },
  openBadgeText: { fontSize: 12, fontWeight: "700" },
  openTextOpen: { color: colors.successText },
  openTextClosed: { color: colors.errorText },

  // Content
  content: { paddingHorizontal: 16, paddingTop: 12 },
  header: { flexDirection: "row", gap: 12, marginBottom: 16, alignItems: "center" },

  // Logo ring
  logoGlow: {
    shadowColor: "rgba(255,215,0,1)",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  logoRing: {
    width: 44, height: 44, borderRadius: 9999,
    padding: 2, alignItems: "center", justifyContent: "center",
    backgroundColor: GOLD,
  },
  logoInnerBorder: {
    width: 40, height: 40, borderRadius: 9999,
    borderWidth: 1.5, borderColor: CHARCOAL,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  logoImage: { width: "100%", height: "100%" },
  logoPlaceholder: {
    width: 44, height: 44, borderRadius: 9999, backgroundColor: "#2A2A2A",
  },

  name: { fontSize: 22, fontWeight: "800", color: "#F4EFE3", marginBottom: 4 },
  meta: { gap: 3 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { fontSize: 13, color: "#A8A192" },
  category: { fontSize: 13, color: "#A8A192" },

  // Pills
  pillsScroll: { marginBottom: 20 },
  pillsContent: { paddingRight: 16, gap: 8, flexDirection: "row" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: "rgba(46,46,46,0.5)",
    backgroundColor: "rgba(38,38,38,0.8)",
  },
  pillText: { fontSize: 14, fontWeight: "500", color: "#F4EFE3" },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#F4EFE3", marginBottom: 10 },
  description: { fontSize: 15, color: "#A8A192", lineHeight: 24 },

  hoursRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  hoursDay: { fontSize: 14, color: "#A8A192", width: 100 },
  hoursDayToday: { color: GOLD, fontWeight: "700" },
  hoursTime: { fontSize: 14, color: "#F4EFE3" },
  hoursTimeToday: { color: GOLD, fontWeight: "700" },

  // CTA bar
  ctaBar: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 24,
    paddingTop: 20,
    backgroundColor: CHARCOAL,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(46,46,46,0.6)",
  },

  // Gold button
  goldButtonOuter: {
    borderRadius: 9999,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  goldButtonGradient: {
    borderRadius: 9999,
    overflow: "hidden",
    backgroundColor: GOLD,
  },
  goldButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    zIndex: 2,
  },
  goldButtonText: { fontSize: 16, fontWeight: "600", color: CHARCOAL },
});
