import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Linking,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Navigation,
  Heart,
  CalendarPlus,
  ExternalLink,
} from "lucide-react-native";
import { supabase } from "@/integrations/supabase/client";
import { useIsFavorite } from "@/hooks/useFavorites";
import { colors } from "@/lib/colors";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import type { Event } from "@/hooks/useEvents";

function useEventDetail(id: string) {
  return useQuery({
    queryKey: ["event", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*, place:places!events_place_id_fkey(name, logo_url, lat, lng)")
        .eq("id", Number(id))
        .single();
      if (error) throw error;
      return data as Event & {
        place?: { name: string; logo_url: string | null; lat: number | null; lng: number | null };
      };
    },
  });
}

function useToggleFavorite(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: existing } = await supabase
        .from("favorites")
        .select("id")
        .eq("user_id", user.id)
        .eq("event_id", eventId)
        .maybeSingle();

      if (existing) {
        await supabase.from("favorites").delete().eq("id", existing.id);
      } else {
        await supabase.from("favorites").insert({
          user_id: user.id,
          event_id: eventId,
          place_id: null,
          service_point_id: null,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });
}

function googleCalendarUrl(event: Event): string {
  const date = event.date ? format(new Date(event.date), "yyyyMMdd") : "";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${date}/${date}`,
    details: event.description ?? "",
    location: (event as any).location ?? "Österlen",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: event, isLoading, error } = useEventDetail(id ?? "");
  const isFav = useIsFavorite(undefined, Number(id));
  const toggleFav = useToggleFavorite(Number(id));

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Evenemanget hittades inte</Text>
      </View>
    );
  }

  const eventDate = event.date ? new Date(event.date) : null;
  const location = (event as any).location as string | null;
  const place = (event as any).place as {
    name: string; logo_url: string | null; lat: number | null; lng: number | null;
  } | null;

  const mapsUrl =
    place?.lat && place?.lng
      ? `https://maps.apple.com/?ll=${place.lat},${place.lng}&q=${encodeURIComponent(place.name)}`
      : location
      ? `https://maps.apple.com/?q=${encodeURIComponent(location)}`
      : null;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.heroContainer}>
          {event.image_url ? (
            <Image source={{ uri: event.image_url }} style={styles.hero} />
          ) : (
            <View style={[styles.hero, styles.heroPlaceholder]} />
          )}

          {/* Back */}
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={22} color={colors.card} />
          </TouchableOpacity>

          {/* Favorite */}
          <TouchableOpacity
            style={styles.favButton}
            onPress={() => toggleFav.mutate()}
          >
            <Heart
              size={20}
              color={isFav ? "#EF4444" : colors.card}
              fill={isFav ? "#EF4444" : "transparent"}
            />
          </TouchableOpacity>

          {/* Date badge */}
          {eventDate && (
            <View style={styles.dateBadge}>
              <Text style={styles.dateBadgeMonth}>
                {format(eventDate, "MMM", { locale: sv }).toUpperCase()}
              </Text>
              <Text style={styles.dateBadgeDay}>
                {format(eventDate, "d")}
              </Text>
            </View>
          )}
        </View>

        {/* Content card */}
        <View style={styles.content}>
          {event.is_featured && (
            <View style={styles.featuredBadge}>
              <Text style={styles.featuredBadgeText}>Utvalt evenemang</Text>
            </View>
          )}

          <Text style={styles.title}>{event.title}</Text>

          {/* Meta info */}
          <View style={styles.metaSection}>
            {eventDate && (
              <View style={styles.metaRow}>
                <Calendar size={18} color={colors.primary} />
                <Text style={styles.metaText}>
                  {format(eventDate, "EEEE d MMMM yyyy", { locale: sv })}
                </Text>
              </View>
            )}
            {(location || place?.name) && (
              <View style={styles.metaRow}>
                <MapPin size={18} color={colors.primary} />
                <Text style={styles.metaText}>
                  {location ?? place?.name}
                </Text>
              </View>
            )}
            {mapsUrl && (
              <TouchableOpacity
                style={styles.metaRow}
                onPress={() => Linking.openURL(mapsUrl)}
              >
                <Navigation size={18} color={colors.primary} />
                <Text style={[styles.metaText, styles.metaLink]}>Navigera</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Place info */}
          {place && (
            <View style={styles.placeRow}>
              {place.logo_url && (
                <Image source={{ uri: place.logo_url }} style={styles.placeLogo} />
              )}
              <Text style={styles.placeName}>{place.name}</Text>
            </View>
          )}

          {/* Description */}
          {event.description && (
            <View style={styles.descSection}>
              <Text style={styles.descTitle}>Om evenemanget</Text>
              <Text style={styles.desc}>{event.description}</Text>
            </View>
          )}

          {/* Add to calendar */}
          <TouchableOpacity
            style={styles.calendarButton}
            onPress={() => Linking.openURL(googleCalendarUrl(event))}
          >
            <CalendarPlus size={18} color={colors.primary} />
            <Text style={styles.calendarButtonText}>Lägg till i Google Kalender</Text>
            <ExternalLink size={14} color={colors.primary} />
          </TouchableOpacity>
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
  hero: { width: "100%", height: 300 },
  heroPlaceholder: { backgroundColor: colors.surface },

  backButton: {
    position: "absolute",
    top: 52,
    left: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  favButton: {
    position: "absolute",
    top: 52,
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  dateBadge: {
    position: "absolute",
    bottom: 20,
    left: 20,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  dateBadgeMonth: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1,
  },
  dateBadgeDay: { fontSize: 28, fontWeight: "800", color: colors.foreground, lineHeight: 32 },

  content: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -20,
    padding: 24,
    paddingBottom: 48,
  },

  featuredBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.successBg,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 12,
  },
  featuredBadgeText: { fontSize: 12, fontWeight: "700", color: colors.primary },

  title: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.foreground,
    lineHeight: 32,
    marginBottom: 20,
  },

  metaSection: { marginBottom: 20, gap: 12 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  metaText: { fontSize: 15, color: colors.foreground, fontWeight: "500" },
  metaLink: { color: colors.primary, textDecorationLine: "underline" },

  placeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 14,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  placeLogo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  placeName: { fontSize: 15, fontWeight: "600", color: colors.foreground },

  descSection: { marginBottom: 24 },
  descTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.foreground,
    marginBottom: 10,
  },
  desc: { fontSize: 15, color: colors.foreground, lineHeight: 24 },

  calendarButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    backgroundColor: colors.successBg,
  },
  calendarButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
    flex: 1,
    textAlign: "center",
  },
});
