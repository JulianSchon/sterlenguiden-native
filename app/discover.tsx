/**
 * Upptäck — platserna som en kortlek att svepa: åt höger sparas platsen (som favorit), åt vänster
 * skippas den. Samma rubrik som de andra undersidorna, kortleken i mitten (nästa kort skymtar under
 * och växer fram medan man drar, se SwipeCard) och två stora knappar under: skippa och spara.
 *
 * Kön blandas en gång när sidan öppnas: platser man inte sparat eller skippat, de med bild först.
 * Sparat och skippat skrivs direkt till servern; resten av appen (Hem, Favoriter) uppdateras när
 * man lämnar sidan — att uppdatera favoritlistan mitt i ett svep ritade om Hem, Profil m.fl.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { ArrowLeft, Check, Heart, X } from "lucide-react-native";
import { usePlaces, type Place } from "@/hooks/usePlaces";
import { savePlaceFavorite, useFavorites } from "@/hooks/useFavorites";
import { useDismissals, useDismissPlace, useLikePlace } from "@/hooks/useDismissals";
import { useKnownLocation } from "@/hooks/useUserLocation";
import { useTheme } from "@/theme/ThemeProvider";
import { useTranslation } from "react-i18next";
import { distanceMeters } from "@/lib/checkin";
import { pushOnce } from "@/lib/navigateOnce";
import { Skeleton } from "@/components/Skeleton";
import { NO, SwipeCard, YES, imagesOf, type DeckState } from "@/components/discover/SwipeCard";

/** Så många kort ligger byggda åt gången (det överst och två under) */
const WINDOW = 3;
const NO_PLACES: Place[] = [];
const NO_IDS: number[] = [];

function shuffle<T>(list: T[]): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function DiscoverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const location = useKnownLocation();

  const { data: places = NO_PLACES, isFetched: placesFetched } = usePlaces();
  const { data: favorites = [], isFetched: favsFetched } = useFavorites();
  const { data: dismissedIds = NO_IDS, isFetched: dismissalsFetched } = useDismissals();
  // mutate är samma funktion hela tiden (själva objekten byts när de körs) — så korten inte ritas om
  const { mutate: dismiss } = useDismissPlace();
  const { mutate: like } = useLikePlace();
  const ready = placesFetched && favsFetched && dismissalsFetched;

  // Kön blandas EN gång när datan kommit och står sen still; att gå vidare är bara att räkna upp
  const [queue, setQueue] = useState<Place[] | null>(null);
  useEffect(() => {
    if (queue || !ready) return;
    const excluded = new Set<number>([...dismissedIds, ...favorites.flatMap((f) => (f.place_id != null ? [f.place_id] : []))]);
    const available = places.filter((p) => !excluded.has(p.id));
    // Platser med bild först — ett kort utan bild ser trasigt ut i början av leken
    const withImage = available.filter((p) => imagesOf(p.image_url).length > 0);
    const without = available.filter((p) => imagesOf(p.image_url).length === 0);
    setQueue([...shuffle(withImage), ...shuffle(without)]);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const [index, setIndex] = useState(0);
  // Kortlekens gemensamma läge (samma objekt hela tiden, så korten inte ritas om när sidan gör det)
  const top = useSharedValue(0);
  const progress = useSharedValue(0);
  const fly = useSharedValue({ dir: 0, n: 0 });
  const deck: DeckState = useMemo(() => ({ top, progress, fly }), [top, progress, fly]);

  // Kortleken: bredden som korten räknar sina gränser med
  const [width, setWidth] = useState(0);

  // Sparat och skippat skrivs direkt; favoriterna i resten av appen uppdateras när man lämnar sidan
  const dirty = useRef(false);
  const onDecide = useCallback((i: number, place: Place, dir: 1 | -1) => {
    setIndex(i + 1);
    Haptics.impactAsync(dir === 1 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (dir === 1) {
      dirty.current = true;
      savePlaceFavorite(place.id, true).catch(() => {});
      // Svepet loggas för sig — räknas till Bläddraren (favoriten kan också sparas på andra ställen)
      like(place.id);
    } else {
      dismiss(place.id);
    }
  }, [like, dismiss]);
  useFocusEffect(useCallback(() => () => {
    if (!dirty.current) return;
    dirty.current = false;
    queryClient.invalidateQueries({ queryKey: ["favorites"] });
  }, [queryClient]));

  const openPlace = useCallback((p: Place) => pushOnce(router, `/place/${p.id}?from=discover`), [router]);
  const throwTop = useCallback((dir: 1 | -1) => {
    Haptics.selectionAsync().catch(() => {});
    fly.value = { dir, n: fly.value.n + 1 };
  }, [fly]);

  const left = queue ? queue.length - index : 0;
  const current = queue?.[index] ?? null;
  // Kortet överst och två under, det djupaste först (så det överst ritas sist)
  const visible = useMemo(() => (queue ?? []).slice(index, index + WINDOW).map((p, k) => ({ p, i: index + k })).reverse(), [queue, index]);
  const kmTo = (p: Place) =>
    location && p.lat != null && p.lng != null ? distanceMeters(location.lat, location.lng, p.lat, p.lng) / 1000 : null;

  return (
    <View style={[s.screen, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      {/* Samma rubrik som de andra undersidorna */}
      <View style={s.header}>
        <TouchableOpacity style={[s.headerBtn, { backgroundColor: colors.fill, borderColor: colors.borderStrong }]} onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]} numberOfLines={1}>{t("discover.title")}</Text>
        {queue && left > 0 && <Text style={[s.left, { color: colors.muted }]}>{t("discover.left", { count: left })}</Text>}
      </View>

      <View style={s.deck} onLayout={(e) => setWidth(e.nativeEvent.layout.width - DECK_SIDE * 2)}>
        <View style={s.deckInner}>
          {!queue || width === 0 ? (
            <Skeleton radius={26} style={StyleSheet.absoluteFill} />
          ) : !current ? (
            <AllSeen onFavorites={() => router.replace("/favorites")} onBack={() => router.back()} />
          ) : (
            visible.map(({ p, i }) => (
              <SwipeCard
                key={p.id}
                place={p}
                index={i}
                isTop={i === index}
                km={kmTo(p)}
                deck={deck}
                width={width}
                onDecide={onDecide}
                onOpen={openPlace}
              />
            ))
          )}
        </View>
      </View>

      <View style={[s.actions, { paddingBottom: insets.bottom + 18 }]}>
        <ActionButton label={t("discover.skip")} disabled={!current} onPress={() => throwTop(-1)}>
          <X size={30} color={NO} strokeWidth={2.8} />
        </ActionButton>
        <ActionButton label={t("discover.save")} disabled={!current} onPress={() => throwTop(1)}>
          <Heart size={28} color={YES} fill={YES} strokeWidth={2} />
        </ActionButton>
      </View>
    </View>
  );
}

/** En av de stora runda knapparna under kortleken */
function ActionButton({ label, disabled, onPress, children }: {
  label: string; disabled: boolean; onPress: () => void; children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const press = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => { press.value = withSpring(0.88, { damping: 30, stiffness: 400 }); }}
      onPressOut={() => { press.value = withSpring(1, { damping: 14, stiffness: 300 }); }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Reanimated.View
        style={[s.action, { backgroundColor: colors.card, borderColor: colors.border, opacity: disabled ? 0.4 : 1 }, style]}
      >
        {children}
      </Reanimated.View>
    </Pressable>
  );
}

/** Alla platser svepta */
function AllSeen({ onFavorites, onBack }: { onFavorites: () => void; onBack: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={s.allSeen}>
      <View style={[s.allSeenIcon, { backgroundColor: colors.goldSoft }]}>
        <Check size={28} color={colors.goldText} strokeWidth={2.4} />
      </View>
      <Text style={[s.allSeenTitle, { color: colors.text }]}>{t("discover.allSeenTitle")}</Text>
      <Text style={[s.allSeenText, { color: colors.muted }]}>
        {t("discover.allSeenText")}
      </Text>
      <TouchableOpacity style={[s.allSeenBtn, { backgroundColor: colors.gold }]} activeOpacity={0.85} onPress={onFavorites}>
        <Text style={[s.allSeenBtnText, { color: colors.onGold }]}>{t("discover.toFavorites")}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onBack} hitSlop={10}>
        <Text style={[s.allSeenLink, { color: colors.muted }]}>{t("discover.back")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const DECK_SIDE = 14;

const s = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  headerBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5 },
  left: { fontFamily: "Inter_600SemiBold", fontSize: 13, fontVariant: ["tabular-nums"] },

  deck: { flex: 1, paddingHorizontal: DECK_SIDE, paddingTop: 6, paddingBottom: 18 },
  deckInner: { flex: 1 },

  actions: { flexDirection: "row", justifyContent: "center", gap: 36, paddingTop: 4 },
  // Hel bakgrund: skuggan räknas ut en gång
  action: {
    width: 68, height: 68, borderRadius: 34, borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 5,
  },

  allSeen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 28 },
  allSeenIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  allSeenTitle: { fontFamily: "Montserrat_700Bold", fontSize: 21, textAlign: "center" },
  allSeenText: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21, textAlign: "center", marginBottom: 8 },
  allSeenBtn: { height: 50, paddingHorizontal: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  allSeenBtnText: { fontFamily: "Inter_700Bold", fontSize: 15.5 },
  allSeenLink: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 6 },
});
