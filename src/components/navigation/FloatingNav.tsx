/**
 * FloatingNav – appens enda bottom-navigation.
 * Spec: native-nav-spec-v2.md
 *
 * Vanliga sidor: helfull bredd, fade-gradient bakgrund (#121212 transparent→solid).
 * Kartsidan: kompakt pill av frostat glas, som kartans filterknapp.
 *
 * En sida kan gömma navigeringen medan något täcker den (setNavHidden, t.ex. kartans filterark).
 */
import React, { useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
} from "react-native";
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import Svg, {
  Defs,
  LinearGradient as SvgGrad,
  Stop,
  Rect as SvgRect,
} from "react-native-svg";
import * as Haptics from "expo-haptics";
import { scrollToTop } from "@/lib/scrollRefs";
import { useNavHidden } from "@/lib/navVisibility";
import { useTheme } from "@/theme/ThemeProvider";
import {
  NavHome,
  NavSearch,
  NavMap,
  NavCalendar,
  NavProfile,
} from "./NavIcons";

// ─── Konstanter ───────────────────────────────────────────────────────────────
export const FLOATING_NAV_HEIGHT = 56; // höjd på knappraden
const FADE_AREA   = 84;   // utrymme ovan knappraden för gradienten
const EXTRA_BOTTOM = 8;   // extra utrymme ovanpå safe area, så ikonerna hamnar klart ovanför hemknapp-zonen

/**
 * Höjden på navigeringens helfärgade fält (på sidor som inte scrollar, t.ex. Profil).
 * Sidans innehåll ska sluta strax ovanför detta.
 */
export const floatingNavSolidHeight = (bottomInset: number) => FLOATING_NAV_HEIGHT + bottomInset + EXTRA_BOTTOM;

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
  const { colors } = useTheme();
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
          {showBadge && <View style={[s.badge, { borderColor: colors.bg }]} />}
        </View>
        <Text style={[s.tabLabel, { color: isActive ? colors.goldText : colors.faint }]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── FloatingNav ──────────────────────────────────────────────────────────────
export default function FloatingNav() {
  const { colors, scheme } = useTheme();
  const dark      = scheme === "dark";
  const router    = useRouter();
  const pathname  = usePathname();
  const insets    = useSafeAreaInsets();
  const { count: unseen } = useUnseenAchievements();

  // Gömd: glider ner och tonar bort (snabbt ut, lite mjukare tillbaka)
  const hidden    = useNavHidden();
  const gone      = useSharedValue(hidden ? 1 : 0);
  useEffect(() => {
    gone.value = withTiming(hidden ? 1 : 0, hidden
      ? { duration: 200, easing: Easing.in(Easing.quad) }
      : { duration: 280, easing: Easing.out(Easing.cubic) });
  }, [hidden, gone]);
  const drop      = FLOATING_NAV_HEIGHT + insets.bottom + 24;
  const hideStyle = useAnimatedStyle(() => ({
    opacity: 1 - gone.value,
    transform: [{ translateY: gone.value * drop }],
  }));

  // En sida ovanpå flikarna (Favoriter, Mitt Österlen, en plats …) är ingen flik — då gäller
  // fliken som ligger under den. Annars byter navigeringen utseende så fort sidan öppnas, och när
  // man sveper tillbaka syns fel variant (tonad i stället för helfärgad på Profil) tills svepet
  // är klart — med pilen bakåt byts sökvägen direkt, därför syntes det bara vid svep.
  const lastTab   = useRef("home");
  const resolved  = resolveActiveTab(pathname);
  if (resolved) lastTab.current = resolved;
  const active    = resolved || lastTab.current;
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
        router.push("/(tabs)/map");
      },
      icon: <NavMap active={active === "map"} />,
    },
    {
      id: "calendar",
      label: "Kalender",
      onPress: () => go("/(tabs)/calendar", "calendar"),
      icon: <NavCalendar active={active === "calendar"} />,
    },
    {
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

  // ─── KARTVARIANTEN: kompakt pill av frostat glas (samma som filterknappen) ─
  if (isMap) {
    return (
      <Reanimated.View
        style={[s.mapOuter, { bottom: insets.bottom + 12 }, hideStyle]}
        pointerEvents={hidden ? "none" : "box-none"}
      >
        <View style={[s.pill, { borderColor: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)" }]}>
          <BlurView
            intensity={20}
            tint={dark ? "dark" : "light"}
            style={[StyleSheet.absoluteFill, { backgroundColor: dark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.6)" }]}
          />
          {buttons}
        </View>
      </Reanimated.View>
    );
  }

  // ─── VANLIGA SIDOR: helfull med fade-gradient ─────────────────────────────
  // Extra utrymme ovanpå safe area → ikoner hamnar klart ovanför hemknapp-zonen
  const rowBottom   = insets.bottom + EXTRA_BOTTOM;
  // Profil scrollar inte och har inget innehåll bakom navigeringen, så där behövs ingen
  // fade: navigeringen är ett helfärgat fält och sidan slutar precis ovanför det
  const solid       = active === "profile";
  const totalHeight = solid ? floatingNavSolidHeight(insets.bottom) : FADE_AREA + FLOATING_NAV_HEIGHT + rowBottom;

  return (
    <Reanimated.View
      style={[s.container, { height: totalHeight }, hideStyle]}
      pointerEvents={hidden ? "none" : "box-none"}
    >
      {/* Fade-gradient (icke-interaktiv), eller ett helfärgat fält på Profil */}
      {solid ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} pointerEvents="none" />
      ) : (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg
          width="100%"
          height="100%"
          style={StyleSheet.absoluteFill}
          preserveAspectRatio="none"
        >
          <Defs>
            <SvgGrad id="navfade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor={colors.bg} stopOpacity={0}    />
              <Stop offset="30%"  stopColor={colors.bg} stopOpacity={0.55} />
              <Stop offset="65%"  stopColor={colors.bg} stopOpacity={0.88} />
              <Stop offset="100%" stopColor={colors.bg} stopOpacity={1}    />
            </SvgGrad>
          </Defs>
          <SvgRect width="100%" height="100%" fill="url(#navfade)" />
        </Svg>
      </View>
      )}

      {/* Knappraden – 8px extra clearance ovanför hemknapp-zonen */}
      <View
        style={[
          s.row,
          { bottom: rowBottom, paddingHorizontal: 8 },
        ]}
      >
        {buttons}
      </View>
    </Reanimated.View>
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
    flexDirection: "row",
    alignItems: "center",
    height: FLOATING_NAV_HEIGHT,
    paddingHorizontal: 12,
    borderRadius: 28,
    borderWidth: 1,
    overflow: "hidden",
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
  },
});
