/**
 * Den smala raden överst på Hem med hälsningen och profilbilden, när man scrollat förbi toppen.
 * Gömmer sig när man scrollar nedåt (läser flödet) och glider fram direkt när man scrollar uppåt,
 * som i de stora apparna — så den aldrig tar plats från flödet i onödan. Datum och väder följer inte med.
 *
 * Allt räknas på UI-tråden ur sidans scroll: ingen omritning medan man scrollar.
 */
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import Reanimated, {
  Easing, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useProfile } from "@/hooks/useProfile";
import { useTheme } from "@/theme/ThemeProvider";
import { greeting, HomeAvatar } from "./HomeHeader";

const BAR_H = 54;
const AVATAR = 34;
/** Så mycket fingret ska flytta sidan innan raden byter läge (inget fladder vid små rörelser) */
const NUDGE = 6;
const SLIDE = { duration: 220, easing: Easing.out(Easing.cubic) };

export function StickyGreeting({ scrollY, showAfter }: {
  scrollY: SharedValue<number>;
  /** Var den stora hälsningen har scrollats bort */
  showAfter: number;
}) {
  useTranslation(); // ritas om när språket byts
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data: profile } = useProfile();
  const firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? null;
  const height = insets.top + BAR_H;

  const shown = useSharedValue(0);
  const target = useSharedValue(0);
  const anchor = useSharedValue(0);
  useAnimatedReaction(() => scrollY.value, (y) => {
    const go = (to: number) => {
      anchor.value = y;
      if (target.value === to) return;
      target.value = to;
      shown.value = withTiming(to, SLIDE);
    };
    // Uppe vid toppen syns den stora hälsningen: ingen rad
    if (y < showAfter) return go(0);
    const moved = y - anchor.value;
    if (moved > NUDGE) go(0);        // nedåt: göm
    else if (moved < -NUDGE) go(1);  // uppåt: visa
    // Samma håll som raden redan har: följ med, så nästa vändning räknas därifrån
    else if ((target.value === 0 && moved > 0) || (target.value === 1 && moved < 0)) anchor.value = y;
  });
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -(1 - shown.value) * height }] }));

  return (
    <Reanimated.View
      style={[s.bar, { height, paddingTop: insets.top, backgroundColor: colors.bg, borderBottomColor: colors.border }, style]}
    >
      <Text style={[s.text, { color: colors.text }]} numberOfLines={1}>
        {greeting(firstName)}
      </Text>
      <TouchableOpacity onPress={() => router.push("/mitt-osterlen")} activeOpacity={0.85} hitSlop={8}>
        <HomeAvatar size={AVATAR} />
      </TouchableOpacity>
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  bar: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 17, letterSpacing: -0.3 },
});
