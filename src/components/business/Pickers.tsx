/**
 * Väljarna i Mitt företag: tidshjulet (timme och minut, som telefonens egen) och kalendern för
 * datum (ett datum, en period eller flera valfria datum). Byggda i appen, så de ser likadana ut
 * på iPhone och Android och behöver ingen extra modul i bygget.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import * as Haptics from "expo-haptics";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { tb } from "@/i18n/business";

// ── Tidshjulet ──────────────────────────────────────────────────────────────

const ITEM_H = 44;
const VISIBLE = 5;
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/** "10:00" → [10, 0] (minuterna avrundade till närmaste femminutersteg) */
function splitTime(value: string): [number, number] {
  const m = value.match(/^(\d{1,2})(?::(\d{2}))?/);
  const h = Math.min(23, Number(m?.[1] ?? 0));
  const min = Math.min(55, Math.round(Number(m?.[2] ?? 0) / 5) * 5);
  return [h, min];
}

const joinTime = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/** Två hjul bredvid varandra: timme och minut. value är "HH:MM". */
export function TimeWheel({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const s = useThemedStyles(createStyles);
  const [h, m] = splitTime(value);
  return (
    <View style={s.wheels}>
      <View pointerEvents="none" style={s.band} />
      <Wheel items={HOURS} index={h} onIndex={(i) => onChange(joinTime(i, m))} />
      <Text style={s.colon}>:</Text>
      <Wheel items={MINUTES} index={m / 5} onIndex={(i) => onChange(joinTime(h, i * 5))} />
    </View>
  );
}

const Wheel = memo(function Wheel({ items, index, onIndex }: { items: string[]; index: number; onIndex: (i: number) => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const ref = useRef<ScrollView>(null);
  const [current, setCurrent] = useState(index);
  const settled = useRef(index);

  // Värdet ändrat utifrån (en annan tid vald): hjulet rullar dit
  useEffect(() => {
    if (index === settled.current) return;
    settled.current = index;
    setCurrent(index);
    ref.current?.scrollTo({ y: index * ITEM_H, animated: true });
  }, [index]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM_H)));
    if (i !== current) {
      setCurrent(i);
      Haptics.selectionAsync().catch(() => {});
    }
  };
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM_H)));
    if (i !== settled.current) {
      settled.current = i;
      onIndex(i);
    }
  };

  return (
    <ScrollView
      ref={ref}
      style={s.wheel}
      contentContainerStyle={{ paddingVertical: ITEM_H * ((VISIBLE - 1) / 2) }}
      contentOffset={{ x: 0, y: index * ITEM_H }}
      // Android tar inte alltid contentOffset: hjulet ställs på rätt värde när det visats
      onLayout={() => ref.current?.scrollTo({ y: settled.current * ITEM_H, animated: false })}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      onScroll={onScroll}
      scrollEventThrottle={16}
      onMomentumScrollEnd={onEnd}
      onScrollEndDrag={(e) => { if (!e.nativeEvent.velocity?.y) onEnd(e); }}
      nestedScrollEnabled
    >
      {items.map((label, i) => (
        <TouchableOpacity
          key={label}
          activeOpacity={0.6}
          onPress={() => ref.current?.scrollTo({ y: i * ITEM_H, animated: true })}
          style={s.wheelItem}
        >
          <Text style={[s.wheelText, { color: i === current ? colors.text : colors.faint }, i === current && s.wheelTextOn]}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
});

// ── Kalendern ───────────────────────────────────────────────────────────────

const WEEKDAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseIso = (v: string) => new Date(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10)));
export const todayIso = () => iso(new Date());
export const addDaysIso = (v: string, n: number) => {
  const d = parseIso(v);
  d.setDate(d.getDate() + n);
  return iso(d);
};

/** "1 juli", "1–14 juli", "28 juni–3 juli" */
export function rangeText(from: string, to?: string | null): string {
  const a = parseIso(from);
  if (!to || to === from) return `${a.getDate()} ${tb(MONTHS[a.getMonth()])}`;
  const b = parseIso(to);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${tb(MONTHS[b.getMonth()])}`
    : `${a.getDate()} ${tb(MONTHS[a.getMonth()])}–${b.getDate()} ${tb(MONTHS[b.getMonth()])}`;
}

/** "lördag 24 juni" */
export function dayText(value: string): string {
  const d = parseIso(value);
  const wd = tb(["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"][d.getDay()]);
  return `${wd} ${d.getDate()} ${tb(MONTHS[d.getMonth()])}`;
}

export type CalendarValue =
  | { mode: "single"; date: string | null }
  | { mode: "range"; from: string | null; to: string | null }
  | { mode: "multi"; dates: string[] };

/**
 * En månad i taget, måndag först. "single": ett datum. "range": första trycket = början, andra =
 * slutet (trycker man före början blir det en ny början). "multi": tryck för att välja och välja bort.
 */
export function DateCalendar({ value, onChange, min }: {
  value: CalendarValue;
  onChange: (value: CalendarValue) => void;
  /** Tidigaste datum som går att välja (standard: i dag) */
  min?: string;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const minDay = min ?? todayIso();
  const first = value.mode === "single" ? value.date : value.mode === "range" ? value.from : value.dates[0];
  const [month, setMonth] = useState(() => {
    const d = first ? parseIso(first) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const today = todayIso();

  const cells = useMemo(() => {
    const offset = (month.getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (string | null)[] = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= days; d++) out.push(iso(new Date(month.getFullYear(), month.getMonth(), d)));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [month]);

  const pick = (day: string) => {
    Haptics.selectionAsync().catch(() => {});
    if (value.mode === "single") onChange({ mode: "single", date: day });
    else if (value.mode === "multi") {
      const has = value.dates.includes(day);
      onChange({ mode: "multi", dates: has ? value.dates.filter((d) => d !== day) : [...value.dates, day].sort() });
    } else if (!value.from || value.to || day < value.from) onChange({ mode: "range", from: day, to: null });
    else onChange({ mode: "range", from: value.from, to: day });
  };

  const state = (day: string): "start" | "end" | "single" | "inside" | null => {
    if (value.mode === "single") return value.date === day ? "single" : null;
    if (value.mode === "multi") return value.dates.includes(day) ? "single" : null;
    const { from, to } = value;
    if (!from) return null;
    if (!to) return from === day ? "single" : null;
    if (day === from && day === to) return "single";
    if (day === from) return "start";
    if (day === to) return "end";
    return day > from && day < to ? "inside" : null;
  };

  const canPrev = iso(new Date(month.getFullYear(), month.getMonth(), 0)) >= minDay;
  return (
    <View>
      <View style={s.calHead}>
        <TouchableOpacity
          disabled={!canPrev}
          onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          style={[s.calArrow, !canPrev && { opacity: 0.3 }]}
          hitSlop={8}
          accessibilityLabel={tb("Förra månaden")}
        >
          <ChevronLeft size={20} color={colors.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={s.calTitle}>{tb(MONTHS[month.getMonth()])} {month.getFullYear()}</Text>
        <TouchableOpacity
          onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          style={s.calArrow}
          hitSlop={8}
          accessibilityLabel={tb("Nästa månad")}
        >
          <ChevronRight size={20} color={colors.text} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <View style={s.calWeek}>
        {WEEKDAYS.map((w) => <Text key={w} style={s.calWeekday}>{tb(w)}</Text>)}
      </View>
      <View style={s.calGrid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`b${i}`} style={s.calCell} />;
          const st = state(day);
          const disabled = day < minDay;
          const ends = st === "start" || st === "end" || st === "single";
          return (
            <Pressable
              key={day}
              disabled={disabled}
              onPress={() => pick(day)}
              style={s.calCell}
              accessibilityRole="button"
              accessibilityState={{ selected: !!st, disabled }}
              accessibilityLabel={dayText(day)}
            >
              {(st === "inside" || st === "start" || st === "end") && (
                <View style={[s.calBand, st === "start" && s.calBandStart, st === "end" && s.calBandEnd, { backgroundColor: colors.goldSoft }]} />
              )}
              <View style={[s.calDay, ends && { backgroundColor: colors.gold }, day === today && !ends && { borderWidth: 1.5, borderColor: colors.goldBorder }]}>
                <Text style={[s.calNum, { color: disabled ? colors.faint : ends ? colors.onGold : colors.text }, ends && s.calNumOn]}>
                  {Number(day.slice(8))}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const CELL = 44;

const createStyles = (c: ThemeColors) => StyleSheet.create({
  wheels: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: ITEM_H * VISIBLE },
  band: {
    position: "absolute", left: 24, right: 24, top: ITEM_H * ((VISIBLE - 1) / 2), height: ITEM_H,
    borderRadius: 12, backgroundColor: c.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong,
  },
  wheel: { width: 78, height: ITEM_H * VISIBLE, flexGrow: 0 },
  wheelItem: { height: ITEM_H, alignItems: "center", justifyContent: "center" },
  wheelText: { fontFamily: "Inter_500Medium", fontSize: 21, fontVariant: ["tabular-nums"] },
  wheelTextOn: { fontFamily: "Inter_700Bold", fontSize: 23 },
  colon: { fontFamily: "Inter_700Bold", fontSize: 23, color: c.text, marginHorizontal: 4, marginBottom: 3 },

  calHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  calArrow: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: c.fill },
  calTitle: { fontFamily: "Montserrat_700Bold", fontSize: 16, color: c.text, textTransform: "capitalize" },
  calWeek: { flexDirection: "row" },
  calWeekday: { flex: 1, textAlign: "center", fontFamily: "Inter_600SemiBold", fontSize: 12, color: c.muted, paddingVertical: 6 },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: `${100 / 7}%`, height: CELL, alignItems: "center", justifyContent: "center" },
  calBand: { position: "absolute", left: 0, right: 0, top: 4, bottom: 4 },
  calBandStart: { left: "50%" },
  calBandEnd: { right: "50%" },
  calDay: { width: CELL - 8, height: CELL - 8, borderRadius: (CELL - 8) / 2, alignItems: "center", justifyContent: "center" },
  calNum: { fontFamily: "Inter_500Medium", fontSize: 15, fontVariant: ["tabular-nums"] },
  calNumOn: { fontFamily: "Inter_700Bold" },
});
