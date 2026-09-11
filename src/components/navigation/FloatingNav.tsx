/**
 * FloatingNav – appens enda bottom-navigation.
 * Spec: native-nav-spec-v2.md
 *
 * Vanliga sidor: helfull bredd, fade-gradient bakgrund (#121212 transparent→solid).
 * Kartsidan: kompakt pill med halvtransparent bakgrund.
 */
import React, { useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Defs,
  LinearGradient as SvgGrad,
  Stop,
  Rect as SvgRect,
} from "react-native-svg";
import * as Haptics from "expo-haptics";
// BlurView (expo-blur) kräver native rebuild – ersatt med solid glass-bakgrund
import { useIsBusiness } from "@/hooks/useUserRole";
import { scrollToTop } from "@/lib/scrollRefs";
import {
  NavHome,
  NavSearch,
  NavMap,
  NavCalendar,
  NavProfile,
  NavBusiness,
} from "./NavIcons";

// ─── Konstanter ───────────────────────────────────────────────────────────────
export const FLOATING_NAV_HEIGHT = 56; // höjd på knappraden
const FADE_AREA   = 84;   // utrymme ovan knappraden för gradienten
const GOLD        = "#C5A059";
const BG          = "#121212";

// ─── Hjälpare: aktiv tab från pathname ────────────────────────────────────────
function resolveActiveTab(pathname: string): string {
  // Index/hem matchar /(tabs), /(tabs)/, /(tabs)/index och /
  if (
    pathname === "/" ||
    pathname === "/(tabs)" ||
    pathname === "/(tabs)/" ||
    pathname.endsWith("/index")
  ) return "home";
  if (pathname.includes("/explore") || pathname.includes("/search")) return "search";
  if (pathname.includes("/map"))      return "map";
  if (pathname.includes("/calendar")) return "calendar";
  if (pathname.includes("/business")) return "business";
  if (pathname.includes("/profile"))  return "profile";
  return "";
}

// ─── Stub: brickor/achievements (ersätt när featuren byggs) ──────────────────
function useUnseenAchievements() { return { count: 0 }; }

// ─── NavButton: fjäderanimerad tabb-knapp ─────────────────────────────────────
interface NavButtonProps {
  onPress: () => void;
  label: string;
  isActive: boolean;
  showBadge?: boolean;
  children: React.ReactNode;
}

function NavButton({ onPress, label, isActive, showBadge, children }: NavButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: 0.85,
      useNativeDriver: true,
      stiffness: 500,
      damping: 15,
      mass: 0.8,
    }).start();
  }, [scale]);

  const onPressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      stiffness: 500,
      damping: 15,
      mass: 0.8,
    }).start();
  }, [scale]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={s.tabBtn}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={label}
    >
      <Animated.View style={[s.tabInner, { transform: [{ scale }] }]}>
        {/* Ikon + eventuell badge */}
        <View style={{ position: "relative" }}>
          {children}
          {showBadge && <View style={s.badge} />}
        </View>
        <Text style={[s.tabLabel, isActive ? s.labelActive : s.labelInactive]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── FloatingNav ──────────────────────────────────────────────────────────────
export default function FloatingNav() {
  const router    = useRouter();
  const pathname  = usePathname();
  const insets    = useSafeAreaInsets();
  const { isBusiness }  = useIsBusiness();
  const { count: unseen } = useUnseenAchievements();
  const active    = resolveActiveTab(pathname);
  const isMap     = active === "map";

  // Navigation med haptik — om redan aktiv tab: scrolla till toppen
  const go = useCallback(async (route: string, tabId: "home" | "search" | "calendar" | "profile") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (active === tabId) {
      scrollToTop(tabId);
      return;
    }
    router.push(route as any);
  }, [active, router]);

  // Tabbar
  const tabs = [
    {
      id: "home",
      label: "Hem",
      onPress: () => go("/(tabs)/", "home"),
      icon: <NavHome active={active === "home"} />,
    },
    {
      id: "search",
      label: "Sök",
      onPress: () => go("/(tabs)/explore", "search"),
      icon: <NavSearch active={active === "search"} />,
    },
    {
      id: "map",
      label: "Karta",
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        router.push("/(tabs)/map" as any);
      },
      icon: <NavMap active={active === "map"} />,
    },
    {
      id: "calendar",
      label: "Kalender",
      onPress: () => go("/(tabs)/calendar", "calendar"),
      icon: <NavCalendar active={active === "calendar"} />,
    },
    isBusiness
      ? {
          id: "business",
          label: "Företag",
          onPress: () => go("/(tabs)/profile", "profile"),
          icon: <NavBusiness active={active === "business"} />,
          showBadge: false,
        }
      : {
          id: "profile",
          label: "Profil",
          onPress: () => go("/(tabs)/profile", "profile"),
          icon: <NavProfile active={active === "profile"} />,
          showBadge: unseen > 0,
        },
  ];

  const buttons = tabs.map((tab) => (
    <NavButton
      key={tab.id}
      label={tab.label}
      isActive={active === tab.id}
      onPress={tab.onPress}
      showBadge={"showBadge" in tab ? tab.showBadge : false}
    >
      {tab.icon}
    </NavButton>
  ));

  // ─── KARTVARIANTEN: kompakt pill ─────────────────────────────────────────
  if (isMap) {
    return (
      <View
        style={[s.mapOuter, { bottom: insets.bottom + 12 }]}
        pointerEvents="box-none"
      >
        <View style={s.pill}>
          <View style={[s.pillBlur, s.pillBg, { flexDirection: "row", height: FLOATING_NAV_HEIGHT, paddingHorizontal: 12 }]}>
            {buttons}
          </View>
        </View>
      </View>
    );
  }

  // ─── VANLIGA SIDOR: helfull med fade-gradient ─────────────────────────────
  const totalHeight = FADE_AREA + FLOATING_NAV_HEIGHT + insets.bottom;

  return (
    <View
      style={[s.container, { height: totalHeight }]}
      pointerEvents="box-none"
    >
      {/* Fade-gradient (icke-interaktiv) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg
          width="100%"
          height="100%"
          style={StyleSheet.absoluteFill}
          preserveAspectRatio="none"
        >
          <Defs>
            <SvgGrad id="navfade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor={BG} stopOpacity={0}    />
              <Stop offset="30%"  stopColor={BG} stopOpacity={0.55} />
              <Stop offset="65%"  stopColor={BG} stopOpacity={0.88} />
              <Stop offset="100%" stopColor={BG} stopOpacity={1}    />
            </SvgGrad>
          </Defs>
          <SvgRect width="100%" height="100%" fill="url(#navfade)" />
        </Svg>
      </View>

      {/* Knappraden längst ner */}
      <View
        style={[
          s.row,
          { bottom: insets.bottom, paddingHorizontal: 8 },
        ]}
      >
        {buttons}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Vanlig nav
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 60,
  },
  row: {
    position: "absolute",
    left: 0,
    right: 0,
    height: FLOATING_NAV_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
  },

  // Kartvarianten – pill
  mapOuter: {
    position: "absolute",
    left: 20,
    right: 20,
    zIndex: 60,
  },
  pill: {
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 20,
  },
  pillBlur: {
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "rgba(18,18,18,0.88)",
  },
  pillBg: {
    backgroundColor: "rgba(18,18,18,0.75)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 28,
    alignItems: "center",
  },

  // Tab-knapp
  tabBtn: {
    flex: 1,
    height: FLOATING_NAV_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  tabInner: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
  },
  labelActive:   { color: GOLD },
  labelInactive: { color: "rgba(255,255,255,0.4)" },

  // Badge på profil-ikon
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
    borderWidth: 1.5,
    borderColor: BG,
  },
});
