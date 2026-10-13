/**
 * Eventets panel: glider upp nerifrån med bild, datum, plats, beskrivning och knapparna Lägg till i
 * kalender, spara (hjärtat) och stäng. Används av Kalender och Hem.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import {
  View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, Modal,
  Dimensions, Pressable, Animated, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, X, MapPin, Globe, Heart, CalendarPlus, CalendarDays } from "lucide-react-native";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import type { Event } from "@/hooks/useEvents";
import { useIsFavorite, useToggleEventFavorite } from "@/hooks/useFavorites";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/Skeleton";

const { width: SW, height: SH } = Dimensions.get("window");
const SHEET_HEIGHT = SH * 0.93;
const GOLD         = "#C5A059";
const CHARCOAL     = "#121212";
const BG           = "#121212";
const FG           = "#F5F1E8";
const MUTED        = "rgba(245,241,232,0.55)";
const BORDER       = "rgba(255,255,255,0.10)";

// ─── Types ────────────────────────────────────────────────────────────────────
type EventDetail = Event & {
  place?: { name: string; logo_url: string | null; lat: number | null; lng: number | null } | null;
};

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useEventDetail(id: number | null) {
  return useQuery({
    queryKey: ["event", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("events")
        .select("*, place:places!events_place_id_fkey(name, logo_url, lat, lng)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as EventDetail;
    },
    enabled: !!id,
  });
}

// ─── EventBottomSheet ─────────────────────────────────────────────────────────
export function EventBottomSheet({ eventId, onClose }: { eventId: number | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [closeIconWhite, setCloseIconWhite] = useState(false);

  const translateY      = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const heartScale      = useRef(new Animated.Value(1)).current;
  const closeRotate     = useRef(new Animated.Value(0)).current;
  const closeBgAnim     = useRef(new Animated.Value(0)).current;
  const shimmerX        = useRef(new Animated.Value(-200)).current;
  const calBtnScale     = useRef(new Animated.Value(1)).current;

  const { data: event, isLoading } = useEventDetail(eventId);
  const isFav     = useIsFavorite(undefined, eventId ?? 0);
  const toggleFav = useToggleEventFavorite();

  useEffect(() => {
    if (eventId !== null) {
      setVisible(true);
      setCloseIconWhite(false);
      translateY.setValue(SHEET_HEIGHT);
      backdropOpacity.setValue(0);
      closeRotate.setValue(0);
      closeBgAnim.setValue(0);
      shimmerX.setValue(-200);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, damping: 30, stiffness: 300, mass: 0.8, useNativeDriver: true }),
      ]).start();
    }
  }, [eventId]);

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2000),
        Animated.timing(shimmerX, { toValue: SW + 100, duration: 700, useNativeDriver: true }),
        Animated.timing(shimmerX, { toValue: -200, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible]);

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: SHEET_HEIGHT, damping: 30, stiffness: 300, useNativeDriver: true }),
    ]).start(() => {
      setVisible(false);
      // Small delay ensures the Modal fully unmounts before touches reach the
      // underlying screen – prevents the "first tap does nothing" ghost touch.
      setTimeout(onClose, 30);
    });
  }, []);

  const handleClose = () => {
    setCloseIconWhite(true);
    Animated.timing(closeRotate, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    Animated.timing(closeBgAnim, { toValue: 1, duration: 280, useNativeDriver: false }).start();
    setTimeout(() => { closeRotate.setValue(0); closeBgAnim.setValue(0); setCloseIconWhite(false); closeSheet(); }, 280);
  };

  const handleHeart = () => {
    if (!eventId) return;
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 1.25, duration: 100, useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 0.95, duration: 70,  useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 1.08, duration: 60,  useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 1,    duration: 60,  useNativeDriver: true }),
    ]).start();
    toggleFav.mutate({ eventId, save: !isFav });
  };

  const closeRotateDeg = closeRotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const closeBgColor   = closeBgAnim.interpolate({ inputRange: [0, 1], outputRange: ["#1F1F1F", "rgba(220,38,38,0.7)"] });

  if (!visible) return null;

  const location     = (event as any)?.location as string | null;
  const websiteUrl   = (event as any)?.website_url as string | null;
  const logoUrl      = event?.place?.logo_url ?? null;
  const websiteHost  = websiteUrl
    ? (() => { try { return new URL(websiteUrl).hostname.replace(/^www\./, ""); } catch { return websiteUrl.replace(/^https?:\/\//, "").split("/")[0]; } })()
    : null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[bs.backdrop, { opacity: backdropOpacity }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.60)" }]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
      </Animated.View>

      <Animated.View style={[bs.sheet, { transform: [{ translateY }] }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
          {/* Hero */}
          <View style={bs.heroContainer}>
            {event?.image_url
              ? <Image source={{ uri: event.image_url }} style={bs.heroImage} resizeMode="cover" />
              : <View style={[bs.heroImage, bs.heroPlaceholder]} />
            }
            <View style={bs.heroGradient} />
            {event && <Text style={bs.heroTitle}>{event.title}</Text>}
          </View>

          {isLoading && (
            <View style={{ marginTop: 16, paddingHorizontal: 20, gap: 18 }} pointerEvents="none">
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Skeleton tone="dark" width={48} height={48} radius={24} />
                  <Skeleton tone="dark" width={i === 0 ? "60%" : "45%"} height={14} radius={5} />
                </View>
              ))}
            </View>
          )}

          {event && (
            <View style={{ marginTop: 16 }}>
              {websiteUrl && (
                <TouchableOpacity style={bs.infoRow} onPress={() => Linking.openURL(websiteUrl)}>
                  <View style={bs.iconCircle}>
                    {logoUrl
                      ? <Image source={{ uri: logoUrl }} style={bs.iconCircleImg} resizeMode="cover" />
                      : <Globe size={20} color={GOLD} strokeWidth={2} />
                    }
                  </View>
                  <Text style={bs.infoText} numberOfLines={1}>{websiteHost}</Text>
                  <ChevronRight size={16} color={MUTED} />
                </TouchableOpacity>
              )}
              {event.date && (
                <View style={bs.infoRow}>
                  <View style={bs.iconCircle}><CalendarDays size={20} color={GOLD} strokeWidth={2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={bs.infoText}>
                      {format(new Date(event.date + "T00:00"), "EEEE d MMMM yyyy", { locale: sv })}
                    </Text>
                    {(event as any).time && <Text style={bs.infoSub}>{(event as any).time}</Text>}
                  </View>
                </View>
              )}
              {location && (
                <TouchableOpacity
                  style={bs.infoRow}
                  onPress={() => Linking.openURL(`maps://maps.apple.com/?q=${encodeURIComponent(location + ", Österlen")}`)}
                >
                  <View style={bs.iconCircle}><MapPin size={20} color={GOLD} strokeWidth={2} /></View>
                  <Text style={bs.infoText} numberOfLines={1}>{location}</Text>
                  <ChevronRight size={16} color={MUTED} />
                </TouchableOpacity>
              )}
              {event.description && (
                <View style={bs.section}>
                  <Text style={bs.sectionTitle}>Om evenemanget</Text>
                  <Text style={bs.sectionBody}>{event.description}</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Bottom bar */}
        <View style={[bs.bottomBar, { paddingBottom: 20 + insets.bottom }]}>
          <TouchableOpacity
            activeOpacity={1}
            style={{ flex: 1 }}
            onPressIn={() => Animated.timing(calBtnScale, { toValue: 0.97, duration: 80, useNativeDriver: true }).start()}
            onPressOut={() => Animated.timing(calBtnScale, { toValue: 1, duration: 80, useNativeDriver: true }).start()}
            onPress={() => {
              if (!event?.date) return;
              const d = format(new Date(event.date + "T00:00"), "yyyyMMdd");
              const p = new URLSearchParams({ action: "TEMPLATE", text: event.title, dates: `${d}/${d}`, details: event.description ?? "", location: location ?? "Österlen" });
              Linking.openURL(`https://calendar.google.com/calendar/render?${p}`);
            }}
          >
            <Animated.View style={[bs.calBtn, { transform: [{ scale: calBtnScale }] }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <CalendarPlus size={20} color={CHARCOAL} strokeWidth={2} />
                <Text style={bs.calBtnText}>Lägg till i kalender</Text>
              </View>
              <Animated.View style={[bs.shimmer, { transform: [{ translateX: shimmerX }, { skewX: "-20deg" }] }]} />
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleHeart} activeOpacity={1}>
            <Animated.View style={[bs.iconBtn, { transform: [{ scale: heartScale }] }]}>
              <Heart size={20} color={isFav ? "#EF4444" : MUTED} fill={isFav ? "#EF4444" : "transparent"} strokeWidth={2} />
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleClose} activeOpacity={1}>
            <Animated.View style={[bs.iconBtn, { backgroundColor: closeBgColor as any }]}>
              <Animated.View style={{ transform: [{ rotate: closeRotateDeg }] }}>
                <X size={20} color={closeIconWhite ? "#FFF" : MUTED} strokeWidth={2} />
              </Animated.View>
            </Animated.View>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const bs = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, zIndex: 200 },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: SHEET_HEIGHT,
    backgroundColor: BG, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: "hidden", zIndex: 201,
  },
  heroContainer: { width: "100%", aspectRatio: 4 / 3, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden" },
  heroImage: { width: "100%", height: "100%", position: "absolute" },
  heroPlaceholder: { backgroundColor: "#2A2A2A" },
  heroGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: "50%", backgroundColor: "rgba(0,0,0,0.55)" },
  heroTitle: { position: "absolute", bottom: 12, left: 20, right: 20, fontFamily: "PlayfairDisplay_700Bold", fontSize: 24, color: FG },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 20, gap: 12 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(197,160,89,0.15)", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 },
  iconCircleImg: { width: 48, height: 48, borderRadius: 24 },
  infoText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 15, color: FG },
  infoSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED, marginTop: 2 },
  section: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  sectionTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 16, color: FG, marginBottom: 8 },
  sectionBody: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 22, color: MUTED },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 20, gap: 12, backgroundColor: BG, zIndex: 202 },
  calBtn: { height: 56, borderRadius: 999, backgroundColor: GOLD, overflow: "hidden", justifyContent: "center" },
  calBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: CHARCOAL },
  shimmer: { position: "absolute", top: 0, bottom: 0, width: 60, backgroundColor: "rgba(255,255,255,0.24)" },
  iconBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#1F1F1F", borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
});
