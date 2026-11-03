/**
 * Steget efter stämpeln i incheckningens belöning: "Hur var det?" — fem stjärnor. Betyget sparas
 * direkt vid trycket (rate_visit, migration 069) och syns aldrig för andra användare, bara som ett
 * snitt för den som sköter platsen (Mitt företag → Statistik), och först när minst 5 betygsatt.
 * Man kan ändra sig genom att trycka på en annan stjärna, eller hoppa över.
 */
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Reanimated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Star } from "lucide-react-native";
import { GOLD } from "./CelebrationFx";
import i18n from "i18next";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.6)";
const EMPTY = "rgba(245,241,232,0.28)";
const SIZE = 44;

export function RateScene({
  placeName, rating, onRate, onReady,
}: {
  placeName: string;
  rating: number | null;
  onRate: (rating: number) => void;
  onReady: () => void;
}) {
  // Inget att vänta på: knapparna kan visas direkt
  useEffect(() => {
    const t = setTimeout(onReady, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={s.root}>
      <Reanimated.View entering={FadeIn.duration(420)} style={s.header}>
        <Text style={s.title}>{i18n.t("checkin.rate.title")}</Text>
        <Text style={s.place} numberOfLines={2}>{placeName}</Text>
      </Reanimated.View>
      <Reanimated.View entering={FadeIn.delay(160).duration(420)} style={s.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <StarButton key={n} n={n} filled={rating != null && n <= rating} onPress={() => onRate(n)} />
        ))}
      </Reanimated.View>
      <Reanimated.Text entering={FadeIn.delay(320).duration(420)} style={s.privacy}>
        {i18n.t("checkin.rate.privacy", { place: placeName })}
      </Reanimated.Text>
    </View>
  );
}

function StarButton({ n, filled, onPress }: { n: number; filled: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={i18n.t("checkin.rate.star", { count: n })}
      accessibilityState={{ selected: filled }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        scale.value = withSequence(withTiming(1.25, { duration: 110 }), withSpring(1, { damping: 10 }));
        onPress();
      }}
    >
      <Reanimated.View style={style}>
        <Star size={SIZE} color={filled ? GOLD : EMPTY} fill={filled ? GOLD : "transparent"} strokeWidth={1.6} />
      </Reanimated.View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 28, gap: 28 },
  header: { alignItems: "center" },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 30, color: FG, textAlign: "center" },
  place: { fontFamily: "Inter_500Medium", fontSize: 15, color: MUTED, marginTop: 6, textAlign: "center" },
  stars: { flexDirection: "row", gap: 10 },
  privacy: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, color: MUTED, textAlign: "center", maxWidth: 300 },
});
