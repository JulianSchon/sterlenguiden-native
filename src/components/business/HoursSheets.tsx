/**
 * Panelerna på Öppettider:
 *  - DaySheet: en veckodag — öppet eller stängt, tiderna (med hjulet), en paus mitt på dagen, och
 *    "samma tider" för fler dagar på en gång.
 *  - ExceptionSheet: en tillfällig ändring — stängt några dagar (semester, helgdag), andra tider en
 *    period (sommartider: vilka dagar och vilka tider, gärna varje år) eller en enskild dag.
 */
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { Sheet, PrimaryButton } from "@/components/Sheet";
import { IconSwitch } from "@/components/IconSwitch";
import { Chip, PortalField, PortalSegmented } from "@/components/business/PortalParts";
import { DateCalendar, TimeWheel, rangeText, todayIso, type CalendarValue } from "@/components/business/Pickers";
import {
  SHORT_DAYS, WEEK_ORDER, newId, pastMidnight, rangeProblem, type DayEdit, type TimeRange,
} from "@/lib/hoursEditor";
import { DAY_NAMES, type HoursException } from "@/lib/openingHours";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

// ── Tiderna (delas av båda panelerna) ───────────────────────────────────────

/** En eller två tider med hjulet under; tryck på Öppnar/Stänger för att välja vilken som ställs */
function RangesEditor({ ranges, onChange, allowPause = true }: { ranges: TimeRange[]; onChange: (r: TimeRange[]) => void; allowPause?: boolean }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const [sel, setSel] = useState<{ i: number; end: "from" | "to" }>({ i: 0, end: "from" });
  const current = ranges[Math.min(sel.i, ranges.length - 1)];
  const set = (v: string) => onChange(ranges.map((r, i) => (i === sel.i ? { ...r, [sel.end]: v } : r)));
  const problem = ranges.map(rangeProblem).find(Boolean);

  return (
    <View>
      {ranges.map((r, i) => (
        <View key={i} style={s.rangeRow}>
          {ranges.length > 1 && <Text style={s.rangeIndex}>{i === 0 ? "Först" : "Sedan"}</Text>}
          {(["from", "to"] as const).map((end) => {
            const on = sel.i === i && sel.end === end;
            return (
              <TouchableOpacity
                key={end}
                style={[s.timeBtn, on && { borderColor: colors.gold, backgroundColor: colors.raised }]}
                onPress={() => setSel({ i, end })}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={s.timeBtnLabel}>{end === "from" ? "Öppnar" : "Stänger"}</Text>
                <Text style={[s.timeBtnValue, on && { color: colors.goldText }]}>{r[end]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      {current && <TimeWheel value={current[sel.end]} onChange={set} />}
      {ranges.some(pastMidnight) && <Text style={s.hint}>Stänger efter midnatt – det räknas till natten efter.</Text>}
      {problem && <Text style={[s.hint, { color: colors.danger }]}>{problem}</Text>}
      {allowPause && (
        ranges.length === 1 ? (
          <TouchableOpacity
            style={s.pauseBtn}
            onPress={() => {
              const [first] = ranges;
              onChange([{ from: first.from, to: "14:00" }, { from: "17:00", to: first.to }]);
              setSel({ i: 0, end: "to" });
            }}
          >
            <Plus size={16} color={colors.goldText} strokeWidth={2.4} />
            <Text style={s.pauseText}>Lägg till paus (t.ex. lunchstängt)</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={s.pauseBtn}
            onPress={() => { onChange([{ from: ranges[0].from, to: ranges[ranges.length - 1].to }]); setSel({ i: 0, end: "from" }); }}
          >
            <Minus size={16} color={colors.goldText} strokeWidth={2.4} />
            <Text style={s.pauseText}>Ta bort pausen</Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
}

// ── En veckodag ─────────────────────────────────────────────────────────────

export function DaySheet({ day, week, onClose, onSave }: {
  /** Dagen som Date.getDay(), eller null = stängd */
  day: number | null;
  week: Record<number, DayEdit>;
  onClose: () => void;
  /** Samma tider för alla dagarna i `days` */
  onSave: (days: number[], value: DayEdit) => void;
}) {
  const s = useThemedStyles(createStyles);
  const [open, setOpen] = useState(true);
  const [ranges, setRanges] = useState<TimeRange[]>([{ from: "10:00", to: "17:00" }]);
  const [days, setDays] = useState<number[]>([]);
  const [shown, setShown] = useState<number | null>(day);

  useEffect(() => {
    if (day === null) return;
    setShown(day);
    const cur = week[day];
    setOpen(cur.kind !== "closed");
    // En tom dag börjar med samma tider som närmaste ifyllda dag (oftast vill man ha samma)
    const like = cur.kind === "open" ? cur : WEEK_ORDER.map((d) => week[d]).find((d) => d.kind === "open");
    setRanges(like && like.kind === "open" ? like.ranges : [{ from: "10:00", to: "17:00" }]);
    setDays([day]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const name = shown === null ? "" : DAY_NAMES[shown];
  const cur = shown === null ? null : week[shown];
  const problem = open && ranges.some((r) => rangeProblem(r));

  return (
    <Sheet visible={day !== null} onClose={onClose} title={name} tall>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
        {cur?.kind === "text" && (
          <Text style={s.hint}>Just nu står det "{cur.text}". Välj tider nedan för att byta ut texten.</Text>
        )}
        <PortalSegmented options={[{ id: "open", label: "Öppet" }, { id: "closed", label: "Stängt" }]} value={open ? "open" : "closed"} onChange={(v) => setOpen(v === "open")} />
        {open && (
          <View style={{ marginTop: 16 }}>
            <RangesEditor ranges={ranges} onChange={setRanges} />
          </View>
        )}
        <Text style={s.sameLabel}>Samma för</Text>
        <View style={s.chips}>
          {WEEK_ORDER.map((d) => (
            <Chip
              key={d}
              label={SHORT_DAYS[d]}
              selected={days.includes(d)}
              onPress={() => setDays(days.includes(d) ? (days.length > 1 ? days.filter((x) => x !== d) : days) : [...days, d])}
            />
          ))}
        </View>
        <View style={s.quick}>
          <Text style={s.quickLink} onPress={() => setDays([1, 2, 3, 4, 5])}>Vardagar</Text>
          <Text style={s.quickLink} onPress={() => setDays([6, 0])}>Helg</Text>
          <Text style={s.quickLink} onPress={() => setDays(WEEK_ORDER)}>Alla dagar</Text>
        </View>
      </ScrollView>
      <PrimaryButton
        label={days.length > 1 ? `Spara för ${days.length} dagar` : "Spara"}
        disabled={problem}
        onPress={() => onSave(days, open ? { kind: "open", ranges } : { kind: "closed" })}
      />
    </Sheet>
  );
}

// ── En tillfällig ändring ───────────────────────────────────────────────────

export type ExceptionKind = "closed" | "period" | "day";

const CLOSED_LABELS = ["Semester", "Helgdag", "Renovering", "Privat tillställning"];

export function ExceptionSheet({ kind, editing, onClose, onSave }: {
  kind: ExceptionKind | null;
  /** En befintlig ändring att redigera */
  editing: HoursException | null;
  onClose: () => void;
  onSave: (ex: HoursException) => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const [label, setLabel] = useState("");
  const [yearly, setYearly] = useState(false);
  const [openDays, setOpenDays] = useState<number[]>(WEEK_ORDER);
  const [ranges, setRanges] = useState<TimeRange[]>([{ from: "10:00", to: "18:00" }]);
  const [dayClosed, setDayClosed] = useState(false);
  const [shownKind, setShownKind] = useState<ExceptionKind | null>(kind);

  useEffect(() => {
    if (!kind) return;
    setShownKind(kind);
    const e = editing;
    setRange({ from: e?.from ?? null, to: e && e.to !== e.from ? e.to : kind === "day" ? e?.from ?? null : null });
    setLabel(e?.label ?? (kind === "period" ? "Sommartider" : ""));
    setYearly(e?.yearly ?? false);
    if (e?.week) {
      const days = WEEK_ORDER.filter((d) => !!e.week?.[DAY_NAMES[d]] && !/st[aä]ngt/i.test(e.week[DAY_NAMES[d]]));
      setOpenDays(days.length ? days : WEEK_ORDER);
      const first = days.length ? e.week[DAY_NAMES[days[0]]] : null;
      const m = first?.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      setRanges(m ? [{ from: m[1].padStart(5, "0"), to: m[2].padStart(5, "0") }] : [{ from: "10:00", to: "18:00" }]);
    } else {
      setOpenDays(WEEK_ORDER);
      const m = e?.hours?.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      setRanges(m ? [{ from: m[1].padStart(5, "0"), to: m[2].padStart(5, "0") }] : [{ from: "10:00", to: kind === "period" ? "18:00" : "15:00" }]);
    }
    setDayClosed(e?.closed ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, editing]);

  const title = shownKind === "closed" ? "Stängt några dagar" : shownKind === "period" ? "Andra tider en period" : "En enskild dag";
  const value: CalendarValue = shownKind === "day"
    ? { mode: "single", date: range.from }
    : { mode: "range", from: range.from, to: range.to };
  const ready = !!range.from && (shownKind !== "period" || openDays.length > 0);

  const save = () => {
    if (!range.from || !shownKind) return;
    const from = range.from;
    const to = shownKind === "day" ? from : range.to ?? from;
    const id = editing?.id ?? newId();
    const hours = ranges.map((r) => `${r.from}-${r.to}`).join(", ");
    if (shownKind === "closed") {
      onSave({ id, from, to, closed: true, label: label.trim() || null, yearly });
    } else if (shownKind === "period") {
      const week: Record<string, string> = {};
      for (const d of WEEK_ORDER) week[DAY_NAMES[d]] = openDays.includes(d) ? hours : "Stängt";
      onSave({ id, from, to, closed: false, week, label: label.trim() || null, yearly });
    } else {
      onSave({ id, from, to, closed: dayClosed, hours: dayClosed ? null : hours, label: label.trim() || null });
    }
  };

  return (
    <Sheet visible={kind !== null} onClose={onClose} title={title} tall>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8, gap: 16 }}>
        <View>
          <Text style={s.step}>{shownKind === "day" ? "Vilken dag?" : "Vilka datum? Tryck på första och sista dagen."}</Text>
          <DateCalendar
            value={value}
            min={todayIso()}
            onChange={(v) => {
              if (v.mode === "single") setRange({ from: v.date, to: v.date });
              else if (v.mode === "range") setRange({ from: v.from, to: v.to });
            }}
          />
          {range.from && shownKind !== "day" && (
            <Text style={[s.picked, { color: colors.goldText }]}>{rangeText(range.from, range.to)}</Text>
          )}
        </View>

        {shownKind === "period" && (
          <View>
            <Text style={s.step}>Vilka dagar har ni öppet då?</Text>
            <View style={s.chips}>
              {WEEK_ORDER.map((d) => (
                <Chip key={d} label={SHORT_DAYS[d]} selected={openDays.includes(d)} onPress={() => setOpenDays(openDays.includes(d) ? openDays.filter((x) => x !== d) : [...openDays, d])} />
              ))}
            </View>
          </View>
        )}

        {shownKind === "day" && (
          <PortalSegmented options={[{ id: "open", label: "Öppet" }, { id: "closed", label: "Stängt" }]} value={dayClosed ? "closed" : "open"} onChange={(v) => setDayClosed(v === "closed")} />
        )}

        {(shownKind === "period" || (shownKind === "day" && !dayClosed)) && (
          <View>
            <Text style={s.step}>Vilka tider?</Text>
            <RangesEditor ranges={ranges} onChange={setRanges} allowPause={shownKind === "day"} />
          </View>
        )}

        <View style={{ gap: 10 }}>
          {shownKind === "closed" && (
            <View style={s.chips}>
              {CLOSED_LABELS.map((l) => <Chip key={l} label={l} selected={label === l} onPress={() => setLabel(label === l ? "" : l)} />)}
            </View>
          )}
          <PortalField
            label={shownKind === "closed" ? "Varför? (valfritt, syns för gästerna)" : "Namn (valfritt, syns för gästerna)"}
            value={label}
            maxLength={40}
            onChangeText={setLabel}
            placeholder={shownKind === "period" ? "Sommartider" : shownKind === "closed" ? "T.ex. Semester" : "T.ex. Julmarknad"}
          />
        </View>

        {shownKind !== "day" && (
          <View style={s.yearly}>
            <View style={{ flex: 1 }}>
              <Text style={s.yearlyTitle}>Samma datum varje år</Text>
              <Text style={s.yearlyText}>Då behöver ni inte lägga in det igen nästa år.</Text>
            </View>
            <IconSwitch value={yearly} onChange={setYearly} />
          </View>
        )}
      </ScrollView>
      <PrimaryButton label="Spara" disabled={!ready || ranges.some((r) => !!rangeProblem(r))} onPress={save} />
    </Sheet>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  rangeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  rangeIndex: { width: 46, fontFamily: "Inter_600SemiBold", fontSize: 12.5, color: c.muted },
  timeBtn: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5,
    borderColor: c.border, backgroundColor: c.fill,
  },
  timeBtnLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: c.muted },
  timeBtnValue: { fontFamily: "Montserrat_700Bold", fontSize: 20, color: c.text, fontVariant: ["tabular-nums"], marginTop: 1 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18, color: c.muted, textAlign: "center", marginVertical: 6 },
  pauseBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 12 },
  pauseText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.goldText },
  sameLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: c.muted, marginTop: 18, marginBottom: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quick: { flexDirection: "row", gap: 18, marginTop: 12, paddingLeft: 2 },
  quickLink: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: c.goldText },
  step: { fontFamily: "Montserrat_600SemiBold", fontSize: 14.5, color: c.text, marginBottom: 10 },
  picked: { fontFamily: "Inter_600SemiBold", fontSize: 14, textAlign: "center", marginTop: 8 },
  yearly: { flexDirection: "row", alignItems: "center", gap: 12 },
  yearlyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, color: c.text },
  yearlyText: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.muted, marginTop: 2 },
});
