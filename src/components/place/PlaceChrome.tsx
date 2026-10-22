/**
 * Det som ligger fast ovanpå platssidan: toppraden med glascirklarna (och namnet som tonar in när
 * bilden scrollats bort), bottenraden med hjärtat och huvudknappen, statusraden och beskedet
 * "Kopierat".
 *
 * Var och en sköter sitt eget läge, så att ingen av dem ritar om sidan: att toppraden byter läge
 * mitt i en scroll, eller att hjärtat trycks, ritar bara om just den delen. När hela sidan ritades
 * om vid varje sådan händelse hackade scrollen.
 */
import { forwardRef, memo, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Pressable, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Reanimated, {
  Extrapolation, interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay,
  withSequence, withSpring, withTiming, type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { BlurView } from "expo-blur";
import { ArrowLeft, CalendarCheck, Check, Navigation, Plus, type LucideIcon } from "lucide-react-native";
import type { Place } from "@/hooks/usePlaces";
import { savePlaceFavorite, useFavorites } from "@/hooks/useFavorites";
import { findCategory } from "@/theme/categories";
import { useTheme } from "@/theme/ThemeProvider";
import { openDirections, openWebsite, withProtocol } from "@/lib/placeLinks";
import { trackDirections, trackPlaceLink } from "@/lib/placeTracking";
import { ShareIcon } from "@/components/ShareIcon";
import { HeartButton, type BurstFn } from "@/components/LikeHeart";
import { GUTTER } from "./PlaceSections";

export const TOP_BAR_H = 60;
/** Glascirklarna i toppraden */
const ROUND = 46;

/** Dela platsen: namnet, orten och hemsidan */
export function sharePlace(place: Place) {
  const town = place.nearest_town ? `, ${place.nearest_town}` : "";
  const link = place.website_url ? `\n${withProtocol(place.website_url)}` : "";
  Share.share({ message: `${place.name}${town}${link}` }).catch(() => {});
}

// ── Glascirklarna ────────────────────────────────────────────────────────────

/** Ikonernas färg på glaset */
const glassFg = (dark: boolean) => (dark ? "rgba(255,255,255,0.9)" : "#1A1A1A");

/** Rund glasknapp: bara den frostade cirkeln, ingen kant eller skugga runt */
export function RoundButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const dark = useTheme().scheme === "dark";
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { press.value = withTiming(0.92, { duration: 90 }); }}
      onPressOut={() => { press.value = withSpring(1, { damping: 14, stiffness: 300 }); }}
      hitSlop={6}
      accessibilityLabel={label}
    >
      <Reanimated.View style={[s.round, pressStyle]}>
        <BlurView
          intensity={20}
          tint={dark ? "dark" : "light"}
          style={[StyleSheet.absoluteFill, s.roundGlass, { backgroundColor: dark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.6)" }]}
        />
        {children}
      </Reanimated.View>
    </Pressable>
  );
}

/** Bara tillbaka-knappen (medan sidan laddas) */
export function BackButton() {
  const router = useRouter();
  const dark = useTheme().scheme === "dark";
  return (
    <RoundButton label="Tillbaka" onPress={() => router.back()}>
      <ArrowLeft size={24} color={glassFg(dark)} strokeWidth={2.2} />
    </RoundButton>
  );
}

// ── Toppraden ────────────────────────────────────────────────────────────────

/** Knapparna ligger kvar; bakgrunden och namnet (till vänster, bredvid pilen) tonar in när bilden scrollats bort */
export const TopBar = memo(function TopBar({ place, scrollY, collapseAt, onSave }: {
  place: Place;
  scrollY: SharedValue<number>;
  /** Var bilden har scrollats bort */
  collapseAt: number;
  /** Spara i lista */
  onSave: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [collapseAt - 60, collapseAt - 10], [0, 1], Extrapolation.CLAMP),
  }));
  return (
    <View style={[s.topBar, { paddingTop: insets.top, height: insets.top + TOP_BAR_H }]} pointerEvents="box-none">
      <Reanimated.View
        style={[StyleSheet.absoluteFill, s.topBarBg, { backgroundColor: colors.bg, borderBottomColor: colors.border }, barStyle]}
        pointerEvents="none"
      />
      <BackButton />
      <Reanimated.Text style={[s.barTitle, { top: insets.top, color: colors.text }, barStyle]} numberOfLines={1} pointerEvents="none">
        {place.name.toUpperCase()}
      </Reanimated.Text>
      <View style={s.topRight}>
        <RoundButton label="Dela" onPress={() => sharePlace(place)}>
          <ShareIcon size={21} color={glassFg(dark)} strokeWidth={2.2} />
        </RoundButton>
        <RoundButton label="Spara i lista" onPress={onSave}>
          <Plus size={26} color={glassFg(dark)} strokeWidth={2.2} />
        </RoundButton>
      </View>
    </View>
  );
});

/** Ljus statusrad över bilden; temats när toppraden tagit över. Ritar bara om sig själv */
export function PlaceStatusBar({ scrollY, collapseAt, overImage }: {
  scrollY: SharedValue<number>; collapseAt: number; overImage: boolean;
}) {
  const dark = useTheme().scheme === "dark";
  const [solid, setSolid] = useState(false);
  useAnimatedReaction(
    () => scrollY.value > collapseAt - 30,
    (now, prev) => { if (now !== prev) runOnJS(setSolid)(now); },
  );
  return <StatusBar style={dark || (!solid && overImage) ? "light" : "dark"} />;
}

// ── Bottenraden ──────────────────────────────────────────────────────────────

/** Huvudknappen: Boka om platsen tar bokningar (Boka bord / Boka rum / Boka), annars Hitta hit */
function primaryAction(place: Place): { label: string; Icon: LucideIcon; onPress: () => void } | null {
  if (place.book_url) {
    const cat = findCategory(place.category)?.id;
    const url = place.book_url;
    return {
      label: cat === "mat-dryck" ? "Boka bord" : cat === "hotell-bb" ? "Boka rum" : "Boka",
      Icon: CalendarCheck,
      onPress: () => { trackPlaceLink(place.id, "book"); openWebsite(url); },
    };
  }
  if (place.lat != null && place.lng != null) {
    return { label: "Hitta hit", Icon: Navigation, onPress: () => { trackDirections(place.id); openDirections(place.lat, place.lng); } };
  }
  return null;
}

/**
 * Hjärtat och huvudknappen. Hjärtat visas direkt, sparas på servern, och resten av appen
 * uppdateras när man lämnar sidan (att uppdatera favoritlistan mitt i hjärtats studs ritade om
 * Hem, Profil m.fl. och gav ett hack).
 */
export const BottomBar = memo(function BottomBar({ place, onBurst }: { place: Place; onBurst: BurstFn }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { data: favorites = [] } = useFavorites();
  const [override, setOverride] = useState<boolean | null>(null);
  const saved = override ?? favorites.some((f) => f.place_id === place.id);
  const dirty = useRef(false);
  const toggle = useCallback(() => {
    const next = !saved;
    dirty.current = true;
    setOverride(next);
    savePlaceFavorite(place.id, next).catch(() => setOverride(!next));
  }, [saved, place.id]);
  useFocusEffect(useCallback(() => () => {
    if (!dirty.current) return;
    dirty.current = false;
    queryClient.invalidateQueries({ queryKey: ["favorites"] }).then(() => setOverride(null));
  }, [queryClient]));

  const primary = primaryAction(place);
  return (
    <View style={[s.bottomBar, { paddingBottom: insets.bottom + 10, backgroundColor: colors.bg, borderTopColor: colors.border }]}>
      <View style={[s.heartBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <HeartButton isFav={saved} onToggle={toggle} onBurst={onBurst} size={24} outline={colors.text} />
      </View>
      <TouchableOpacity
        style={[s.primary, { backgroundColor: colors.gold }]}
        activeOpacity={0.85}
        onPress={primary?.onPress ?? (() => sharePlace(place))}
      >
        {primary ? <primary.Icon size={19} color={colors.onGold} strokeWidth={2.3} /> : <ShareIcon size={19} color={colors.onGold} strokeWidth={2.3} />}
        <Text style={[s.primaryText, { color: colors.onGold }]}>{primary?.label ?? "Dela platsen"}</Text>
      </TouchableOpacity>
    </View>
  );
});

/** Bottenradens höjd ovanför hemknappsytan */
export const BOTTOM_BAR_H = 74;

// ── "Kopierat" ───────────────────────────────────────────────────────────────

export interface ToastHandle { show: (text: string) => void }

/** Ett kort besked nere vid knapparna som tonar bort av sig själv */
export const Toast = forwardRef<ToastHandle>(function Toast(_, ref) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const v = useSharedValue(0);
  useImperativeHandle(ref, () => ({
    show: (t: string) => {
      setText(t);
      v.value = withSequence(withTiming(1, { duration: 160 }), withDelay(1300, withTiming(0, { duration: 240 })));
    },
  }), [v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 8 }] }));
  return (
    <Reanimated.View style={[s.toast, { bottom: insets.bottom + BOTTOM_BAR_H + 12 }, style]} pointerEvents="none">
      <Check size={15} color="#FFFFFF" strokeWidth={2.6} />
      <Text style={s.toastText}>{text}</Text>
    </Reanimated.View>
  );
});

const s = StyleSheet.create({
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12,
  },
  topBarBg: { borderBottomWidth: StyleSheet.hairlineWidth },
  // Namnet börjar precis till höger om pilen, så så mycket som möjligt av det får plats
  barTitle: {
    position: "absolute", left: 12 + ROUND + 12, right: 12 + ROUND * 2 + 8 + 12,
    height: TOP_BAR_H, lineHeight: TOP_BAR_H, textAlign: "left",
    fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5,
  },
  topRight: { flexDirection: "row", gap: 8 },
  round: { width: ROUND, height: ROUND, alignItems: "center", justifyContent: "center" },
  // Glaset har själv de runda hörnen (som kartans knappar) — klipps det av föräldern blir kanterna kantiga
  roundGlass: { borderRadius: ROUND / 2, overflow: "hidden" },

  bottomBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", gap: 10, paddingHorizontal: GUTTER, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  heartBox: {
    width: 54, height: 54, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center", justifyContent: "center",
  },
  primary: { flex: 1, height: 54, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  primaryText: { fontFamily: "Inter_700Bold", fontSize: 16 },

  toast: {
    position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: "#1C1C1E",
  },
  toastText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: "#FFFFFF" },
});
