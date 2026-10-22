/**
 * Öppettider. Vanliga veckan överst (tryck på en dag för att ändra; samma tider kan läggas på
 * flera dagar på en gång), sedan tillfälliga ändringar (semester, sommartider, en enskild dag) och
 * förslag på kommande röda dagar ("Stängt på midsommarafton?" med ett tryck).
 *
 * Allt sparas direkt och syns i appen på en gång — öppet nu, kartan, sökningen och platssidan
 * räknar med ändringarna (lib/openingHours).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CalendarClock, CalendarOff, CalendarRange, ChevronRight, Pencil, Sun, Trash2 } from "lucide-react-native";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { GradientCard } from "@/components/GradientCard";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { Chip, Note, PortalToast, SaveIndicator, SectionHeader, type PortalToastHandle } from "@/components/business/PortalParts";
import { DaySheet, ExceptionSheet, type ExceptionKind } from "@/components/business/HoursSheets";
import { dayText, parseIso } from "@/components/business/Pickers";
import { useBusinessPlace, usePlaceAutosave, usePortalPlace } from "@/hooks/useBusiness";
import { upcomingHolidays } from "@/lib/business";
import {
  WEEK_ORDER, dayLabel, isHotel, newId, noFixedHoursKey, readWeek, writeWeek, type DayEdit,
} from "@/lib/hoursEditor";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { IconSwitch } from "@/components/IconSwitch";
import { DAY_NAMES, exceptionFor, exceptionLine, isoDay, type HoursException } from "@/lib/openingHours";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const QUICK: { label: string; days: number[]; from: string; to: string }[] = [
  { label: "Mån–fre 9–17", days: [1, 2, 3, 4, 5], from: "09:00", to: "17:00" },
  { label: "Alla dagar 10–18", days: WEEK_ORDER, from: "10:00", to: "18:00" },
  { label: "Tis–sön 11–21", days: [2, 3, 4, 5, 6, 0], from: "11:00", to: "21:00" },
];

export default function BusinessHours() {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { placeId } = usePortalPlace();
  const { data: place } = useBusinessPlace(placeId);
  const auto = usePlaceAutosave(placeId, 200);
  const toast = useRef<PortalToastHandle>(null);
  const [week, setWeek] = useState<Record<number, DayEdit> | null>(null);
  const [exceptions, setExceptions] = useState<HoursException[] | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [sheet, setSheet] = useState<{ kind: ExceptionKind; editing: HoursException | null } | null>(null);
  const [noHours, setNoHours] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(noFixedHoursKey(placeId)).then((v) => setNoHours(v === "1")).catch(() => {});
  }, [placeId]);
  const toggleNoHours = (v: boolean) => {
    setNoHours(v);
    (v ? AsyncStorage.setItem(noFixedHoursKey(placeId), "1") : AsyncStorage.removeItem(noFixedHoursKey(placeId))).catch(() => {});
  };

  useEffect(() => {
    if (!place || week) return;
    setWeek(readWeek(place.opening_hours));
    setExceptions(place.hours_exceptions ?? []);
  }, [place, week]);

  const saveWeek = (next: Record<number, DayEdit>) => {
    setWeek(next);
    auto.queue({ opening_hours: writeWeek(next) });
  };
  const saveExceptions = (next: HoursException[], message?: string, undo?: HoursException[]) => {
    setExceptions(next);
    auto.queue({ hours_exceptions: next }, true);
    if (message) toast.current?.show(message, undo ? () => saveExceptions(undo) : undefined);
  };

  const upcoming = useMemo(() => {
    const today = isoDay(new Date());
    return (exceptions ?? [])
      .filter((e) => e.yearly || e.to >= today)
      .sort((a, b) => (a.yearly === b.yearly ? a.from.localeCompare(b.from) : a.yearly ? 1 : -1));
  }, [exceptions]);

  // Röda dagar de närmaste fyra månaderna som inte redan har en ändring
  const holidays = useMemo(() => upcomingHolidays(120)
    .filter((h) => !exceptionFor(exceptions, parseIso(h.date)))
    .slice(0, 4), [exceptions]);

  if (!week || !exceptions) {
    return (
      <SettingsScreen title="Öppettider">
        <Skeleton height={380} radius={22} />
        <Skeleton height={140} radius={22} />
      </SettingsScreen>
    );
  }

  const empty = WEEK_ORDER.every((d) => week[d].kind === "unset");

  return (
    <>
      <SettingsScreen title="Öppettider" right={<SaveIndicator state={auto.state} onRetry={auto.flush} />}>
        <Rise index={0}>
          <View>
            <SectionHeader title="Vanliga veckan" />
            {empty && (
              <View style={s.noHours}>
                <View style={{ flex: 1 }}>
                  <Text style={s.noHoursTitle}>{isHotel(place?.categories) ? "Öppettider behövs inte för hotell" : "Vi har inga fasta öppettider"}</Text>
                  <Text style={s.noHoursText}>
                    {isHotel(place?.categories)
                      ? "Hotell behöver inga – fyll bara i om ni har t.ex. restaurang eller reception med fasta tider."
                      : "T.ex. öppet efter överenskommelse. Då visas inga tider på er sida."}
                  </Text>
                </View>
                {!isHotel(place?.categories) && <IconSwitch value={noHours} onChange={toggleNoHours} />}
              </View>
            )}
            {empty && !noHours && !isHotel(place?.categories) && (
              <View style={s.quick}>
                <Text style={s.quickLead}>Snabbstart – välj det som liknar er, och ändra sedan det som skiljer:</Text>
                <View style={s.chips}>
                  {QUICK.map((q) => (
                    <Chip
                      key={q.label}
                      label={q.label}
                      selected={false}
                      onPress={() => {
                        const next = { ...week };
                        for (const d of WEEK_ORDER) next[d] = q.days.includes(d) ? { kind: "open", ranges: [{ from: q.from, to: q.to }] } : { kind: "closed" };
                        saveWeek(next);
                      }}
                    />
                  ))}
                </View>
              </View>
            )}
            <GradientCard>
              {WEEK_ORDER.map((d, i) => {
                const value = week[d];
                const today = new Date().getDay() === d;
                return (
                  <TouchableOpacity
                    key={d}
                    style={[s.dayRow, i > 0 && s.dayBorder]}
                    activeOpacity={0.7}
                    onPress={() => setDay(d)}
                    accessibilityRole="button"
                    accessibilityLabel={`${DAY_NAMES[d]}: ${dayLabel(value)}. Ändra.`}
                  >
                    <Text style={[s.dayName, today && s.dayToday]}>{DAY_NAMES[d]}</Text>
                    <Text
                      style={[s.dayValue, value.kind === "closed" && { color: colors.muted }, value.kind === "unset" && { color: colors.faint }]}
                      numberOfLines={1}
                    >
                      {dayLabel(value)}
                    </Text>
                    <ChevronRight size={17} color={colors.faint} strokeWidth={2} />
                  </TouchableOpacity>
                );
              })}
            </GradientCard>
            {!empty && (
              <TouchableOpacity
                onPress={() => Alert.alert("Visa inga öppettider?", "Då står det inget om öppet eller stängt på er sida.", [
                  { text: "Avbryt", style: "cancel" },
                  {
                    text: "Ta bort tiderna", style: "destructive",
                    onPress: () => {
                      const before = week;
                      const next = Object.fromEntries(WEEK_ORDER.map((d) => [d, { kind: "unset" } as DayEdit]));
                      saveWeek(next);
                      toast.current?.show("Öppettiderna borttagna", () => saveWeek(before));
                    },
                  },
                ])}
                hitSlop={8}
                style={s.clear}
              >
                <Text style={s.clearText}>Visa inga öppettider</Text>
              </TouchableOpacity>
            )}
          </View>
        </Rise>

        <Rise index={1}>
          <View>
            <SectionHeader title="Tillfälliga ändringar" />
            {upcoming.length > 0 && (
              <GradientCard style={{ marginBottom: 12 }}>
                {upcoming.map((ex, i) => (
                  <View key={ex.id} style={[s.exRow, i > 0 && s.dayBorder]}>
                    <CalendarClock size={18} color={colors.goldText} strokeWidth={2} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.exText}>{exceptionLine(ex)}</Text>
                      {ex.yearly && <Text style={s.exSub}>Varje år</Text>}
                    </View>
                    <TouchableOpacity
                      hitSlop={8}
                      onPress={() => setSheet({ kind: ex.week ? "period" : ex.from === ex.to && !ex.yearly ? "day" : "closed", editing: ex })}
                      accessibilityLabel="Ändra"
                    >
                      <Pencil size={17} color={colors.muted} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      hitSlop={8}
                      onPress={() => saveExceptions(exceptions.filter((e) => e.id !== ex.id), "Borttagen", exceptions)}
                      accessibilityLabel="Ta bort"
                    >
                      <Trash2 size={17} color={colors.muted} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                ))}
              </GradientCard>
            )}
            <View style={s.addRow}>
              <AddButton Icon={CalendarOff} label="Stängt några dagar" sub="Semester, helgdag" onPress={() => setSheet({ kind: "closed", editing: null })} />
              <AddButton Icon={Sun} label="Andra tider en period" sub="T.ex. sommartider" onPress={() => setSheet({ kind: "period", editing: null })} />
              <AddButton Icon={CalendarRange} label="En enskild dag" sub="Stänger tidigare, öppet extra" onPress={() => setSheet({ kind: "day", editing: null })} />
            </View>
          </View>
        </Rise>

        {holidays.length > 0 && (
          <Rise index={2}>
            <View>
              <SectionHeader title="Röda dagar som kommer" />
              <Note text="Har ni stängt? Ett tryck så syns det i appen." icon={CalendarOff} />
              <View style={[s.chips, { marginTop: 10 }]}>
                {holidays.map((h) => (
                  <Chip
                    key={h.date}
                    label={`${h.name} · ${dayText(h.date).split(" ").slice(1).join(" ")}`}
                    selected={false}
                    onPress={() => saveExceptions(
                      [...exceptions, { id: newId(), from: h.date, to: h.date, closed: true, label: h.name }],
                      `Stängt ${h.name.toLowerCase()}`,
                      exceptions,
                    )}
                  />
                ))}
              </View>
            </View>
          </Rise>
        )}
        {auto.error && <Text style={s.error}>{auto.error}</Text>}
      </SettingsScreen>

      <DaySheet
        day={day}
        week={week}
        onClose={() => setDay(null)}
        onSave={(days, value) => {
          const next = { ...week };
          for (const d of days) next[d] = value;
          saveWeek(next);
          setDay(null);
        }}
      />
      <ExceptionSheet
        kind={sheet?.kind ?? null}
        editing={sheet?.editing ?? null}
        onClose={() => setSheet(null)}
        onSave={(ex) => {
          const before = exceptions;
          const next = before.some((e) => e.id === ex.id) ? before.map((e) => (e.id === ex.id ? ex : e)) : [...before, ex];
          setSheet(null);
          saveExceptions(next, "Sparat", before);
        }}
      />
      <PortalToast ref={toast} />
    </>
  );
}

function AddButton({ Icon, label, sub, onPress }: { Icon: typeof Sun; label: string; sub: string; onPress: () => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <TouchableOpacity style={s.add} activeOpacity={0.75} onPress={onPress} accessibilityRole="button">
      <View style={s.addIcon}><Icon size={19} color={colors.goldText} strokeWidth={1.9} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.addLabel}>{label}</Text>
        <Text style={s.addSub}>{sub}</Text>
      </View>
      <ChevronRight size={17} color={colors.faint} strokeWidth={2} />
    </TouchableOpacity>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  quick: { marginBottom: 12, gap: 10 },
  noHours: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, marginBottom: 14,
    backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border,
  },
  noHoursTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.text },
  noHoursText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18, color: c.muted, marginTop: 2 },
  quickLead: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, color: c.muted, paddingHorizontal: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dayRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, minHeight: 56 },
  dayBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  dayName: { width: 92, fontFamily: "Inter_500Medium", fontSize: 15, color: c.text },
  dayToday: { fontFamily: "Inter_700Bold" },
  dayValue: { flex: 1, textAlign: "right", fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.text, fontVariant: ["tabular-nums"] },
  clear: { alignSelf: "center", paddingVertical: 12 },
  clearText: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: c.muted },
  exRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  exText: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, lineHeight: 20, color: c.text },
  exSub: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: c.muted, marginTop: 2 },
  addRow: { gap: 10 },
  add: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 18,
    backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border,
  },
  addIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.goldSoft },
  addLabel: { fontFamily: "Montserrat_600SemiBold", fontSize: 14.5, color: c.text },
  addSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.muted, marginTop: 2 },
  error: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: c.danger, textAlign: "center" },
});
