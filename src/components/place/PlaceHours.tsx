/**
 * Öppettiderna på platssidan. Överst läget just nu i klartext och färg ("Öppet · stänger 17" i
 * grönt, "Stänger snart · 17" i orange, "Stängt · öppnar tis 10" i rött), under det dagens tider.
 * Ett tryck fäller ut hela veckan (måndag först) med dagen markerad; ett till fäller ihop. Under det
 * de tillfälliga ändringar företaget lagt in för de närmaste veckorna ("Stängt 1–14 juli · Semester").
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { CalendarClock, ChevronDown, Clock } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOpenColors } from "@/components/search/SearchParts";
import {
  exceptionLine, hoursStatus, upcomingExceptions, weekRows, type HoursException, type HoursState, type Hours,
} from "@/lib/openingHours";

const ROW_H = 34;
const EASE = { duration: 260, easing: Easing.out(Easing.cubic) };

/** Färgen för läget — samma gröna och röda som Sök, orange för "stänger snart" */
export function useHoursColors(): Record<HoursState, string> {
  const dark = useTheme().scheme === "dark";
  const c = useOpenColors();
  return { open: c.open, closed: c.closed, closingSoon: dark ? "#FBBF24" : "#B45309" };
}

export function PlaceHours({ hours, showStatus, exceptions }: {
  hours: Hours;
  /** Av för hotell: "stängt" en kväll betyder inte att man inte kan bo där */
  showStatus: boolean;
  /** Företagets tillfälliga ändringar (stängt idag, semester …) */
  exceptions?: HoursException[] | null;
}) {
  const { colors } = useTheme();
  const tint = useHoursColors();
  const [open, setOpen] = useState(false);
  const rows = weekRows(hours);
  const status = showStatus ? hoursStatus(hours) : null;
  const today = rows.find((r) => r.today);
  const notices = upcomingExceptions(exceptions).slice(0, 3);
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, EASE);
  }, [open, progress]);

  const bodyStyle = useAnimatedStyle(() => ({ height: ROW_H + progress.value * ROW_H * (rows.length - 1) }));
  const weekStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const todayStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${progress.value * 180}deg` }] }));

  if (rows.length === 0) return null;
  const todayColor = status ? tint[status.state] : colors.text;

  return (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      accessibilityLabel={open ? "Fäll ihop öppettiderna" : "Visa hela veckans öppettider"}
    >
      <View style={s.head}>
        <View style={[s.icon, { backgroundColor: colors.fill }]}>
          <Clock size={18} color={status ? tint[status.state] : colors.muted} strokeWidth={2.2} />
        </View>
        <Text style={[s.status, { color: status ? tint[status.state] : colors.text }]} numberOfLines={1}>
          {status?.label ?? "Öppettider"}
        </Text>
        <Reanimated.View style={chevronStyle}>
          <ChevronDown size={20} color={colors.muted} strokeWidth={2.2} />
        </Reanimated.View>
      </View>

      <View style={[s.divider, { backgroundColor: colors.border }]} />

      <Reanimated.View style={[s.body, bodyStyle]}>
        {/* Hopfällt: bara i dag */}
        {today && (
          <Reanimated.View style={[s.row, s.todayOnly, todayStyle]} pointerEvents="none">
            <Text style={[s.day, s.bold, { color: colors.text }]}>I dag, {today.name.toLowerCase()}</Text>
            <Text style={[s.time, s.bold, { color: todayColor }]} numberOfLines={1}>{today.text}</Text>
          </Reanimated.View>
        )}
        {/* Utfällt: hela veckan */}
        <Reanimated.View style={weekStyle}>
          {rows.map((r) => (
            <View key={r.day} style={s.row}>
              <View style={s.dayCell}>
                <Text style={[s.day, { color: r.today ? colors.text : colors.muted }, r.today && s.bold]}>{r.name}</Text>
                {r.today && (
                  <View style={[s.todayTag, { backgroundColor: colors.fill }]}>
                    <Text style={[s.todayTagText, { color: colors.muted }]}>I DAG</Text>
                  </View>
                )}
              </View>
              <Text style={[s.time, { color: r.today ? todayColor : colors.text }, r.today && s.bold]} numberOfLines={1}>{r.text}</Text>
            </View>
          ))}
        </Reanimated.View>
      </Reanimated.View>

      {notices.length > 0 && (
        <View style={[s.notices, { borderTopColor: colors.border }]}>
          {notices.map((ex) => (
            <View key={ex.id} style={s.notice}>
              <CalendarClock size={15} color={colors.goldText} strokeWidth={2} />
              <Text style={[s.noticeText, { color: colors.text }]} numberOfLines={2}>{exceptionLine(ex)}</Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  status: { flex: 1, fontFamily: "Inter_700Bold", fontSize: 15 },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 12, marginBottom: 4 },
  body: { overflow: "hidden" },
  row: { height: ROW_H, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  todayOnly: { position: "absolute", top: 0, left: 0, right: 0 },
  dayCell: { flexDirection: "row", alignItems: "center", gap: 8 },
  day: { fontFamily: "Inter_400Regular", fontSize: 14.5 },
  time: { flexShrink: 1, textAlign: "right", fontFamily: "Inter_500Medium", fontSize: 14.5, fontVariant: ["tabular-nums"] },
  bold: { fontFamily: "Inter_700Bold" },
  todayTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  todayTagText: { fontFamily: "Inter_700Bold", fontSize: 9.5, letterSpacing: 0.8 },
  notices: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6, paddingTop: 10, paddingBottom: 6, gap: 8 },
  notice: { flexDirection: "row", alignItems: "center", gap: 9 },
  noticeText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 13.5, lineHeight: 18 },
});
