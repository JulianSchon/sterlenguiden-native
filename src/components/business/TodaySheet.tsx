/**
 * "Ändra i dag" från Mitt företag: stängt hela dagen, stänger tidigare, öppnar senare — eller
 * öppet i dag fast det brukar vara stängt. Gäller bara i dag; i morgon gäller vanliga tider igen.
 */
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Clock3, DoorClosed, DoorOpen, Sunrise, Undo2 } from "lucide-react-native";
import { Sheet, PrimaryButton } from "@/components/Sheet";
import { ChoiceCard } from "@/components/business/PortalParts";
import { TimeWheel } from "@/components/business/Pickers";
import { dayLabel, regularToday, todayOnly } from "@/lib/hoursEditor";
import type { Hours, HoursException } from "@/lib/openingHours";
import { useTheme } from "@/theme/ThemeProvider";
import { tb } from "@/i18n/business";

type Choice = "closed" | "earlier" | "later" | "open";

export type TodayChange = Omit<HoursException, "id" | "from" | "to"> | null;

export function TodaySheet({ visible, hours, exceptions, onClose, onSave }: {
  visible: boolean;
  hours: Hours;
  exceptions: HoursException[] | null;
  onClose: () => void;
  /** null = ta bort dagens ändring */
  onSave: (change: TodayChange) => void;
}) {
  const { colors } = useTheme();
  const regular = regularToday(hours);
  const current = todayOnly(exceptions);
  const ranges = regular.kind === "open" ? regular.ranges : [];
  const opens = ranges[0]?.from ?? "10:00";
  const closes = ranges[ranges.length - 1]?.to ?? "17:00";
  const normallyClosed = regular.kind !== "open";

  const [choice, setChoice] = useState<Choice>(normallyClosed ? "open" : "closed");
  const [time, setTime] = useState(closes);
  const [openTime, setOpenTime] = useState(opens);
  const [closeTime, setCloseTime] = useState(closes);
  const [editing, setEditing] = useState<"open" | "close">("open");

  // Varje gång panelen öppnas börjar den från dagens vanliga tider
  useEffect(() => {
    if (!visible) return;
    setChoice(normallyClosed ? "open" : "closed");
    setTime(closes);
    setOpenTime(opens);
    setCloseTime(closes);
    setEditing("open");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pick = (c: Choice) => {
    setChoice(c);
    if (c === "earlier") setTime(closes);
    if (c === "later") setTime(opens);
  };

  const save = () => {
    if (choice === "closed") onSave({ closed: true, label: null });
    else if (choice === "earlier") onSave({ closed: false, hours: `${opens}-${time}`, label: null });
    else if (choice === "later") onSave({ closed: false, hours: `${time}-${closes}`, label: null });
    else onSave({ closed: false, hours: `${openTime}-${closeTime}`, label: null });
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={tb("Ändra i dag")}>
      <Text style={[s.lead, { color: colors.muted }]}>
        {normallyClosed
          ? tb("I dag brukar ni ha stängt. Gäller bara i dag.")
          : tb("I dag brukar ni ha öppet {{0}}. Ändringen gäller bara i dag.", { 0: dayLabel(regular) })}
      </Text>
      <View style={s.choices}>
        {!normallyClosed && (
          <>
            <ChoiceCard icon={DoorClosed} title={tb("Stängt hela dagen")} selected={choice === "closed"} onPress={() => pick("closed")} />
            <ChoiceCard icon={Clock3} title={tb("Stänger tidigare")} selected={choice === "earlier"} onPress={() => pick("earlier")} />
            <ChoiceCard icon={Sunrise} title={tb("Öppnar senare")} selected={choice === "later"} onPress={() => pick("later")} />
          </>
        )}
        {normallyClosed && (
          <ChoiceCard icon={DoorOpen} title={tb("Öppet i dag ändå")} selected={choice === "open"} onPress={() => pick("open")} />
        )}
      </View>

      {(choice === "earlier" || choice === "later") && (
        <View style={s.wheel}>
          <Text style={[s.wheelLabel, { color: colors.text }]}>{choice === "earlier" ? tb("Stänger kl {{0}}", { 0: time }) : tb("Öppnar kl {{0}}", { 0: time })}</Text>
          <TimeWheel value={time} onChange={setTime} />
        </View>
      )}
      {choice === "open" && (
        <View style={s.wheel}>
          <View style={s.pair}>
            <Text
              onPress={() => setEditing("open")}
              style={[s.pairItem, { color: editing === "open" ? colors.goldText : colors.muted, borderColor: editing === "open" ? colors.goldBorder : colors.border }]}
            >
              {tb("Öppnar")} {openTime}
            </Text>
            <Text
              onPress={() => setEditing("close")}
              style={[s.pairItem, { color: editing === "close" ? colors.goldText : colors.muted, borderColor: editing === "close" ? colors.goldBorder : colors.border }]}
            >
              {tb("Stänger")} {closeTime}
            </Text>
          </View>
          <TimeWheel value={editing === "open" ? openTime : closeTime} onChange={editing === "open" ? setOpenTime : setCloseTime} />
        </View>
      )}

      <PrimaryButton label={tb("Spara för i dag")} onPress={save} />
      {current && (
        <TouchableOpacity onPress={() => onSave(null)} style={s.undoRow} activeOpacity={0.6} hitSlop={8}>
          <Undo2 size={15} color={colors.goldText} strokeWidth={2.2} />
          <Text style={[s.undo, { color: colors.goldText }]}>{tb("Ta bort ändringen – vanliga tider gäller")}</Text>
        </TouchableOpacity>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  lead: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21, marginBottom: 14 },
  choices: { gap: 10, marginBottom: 6 },
  wheel: { marginTop: 8, marginBottom: 4 },
  wheelLabel: { fontFamily: "Montserrat_600SemiBold", fontSize: 15, textAlign: "center", marginBottom: 2 },
  pair: { flexDirection: "row", gap: 10, justifyContent: "center", marginBottom: 2 },
  pairItem: {
    fontFamily: "Inter_600SemiBold", fontSize: 14.5, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 12, borderWidth: 1.5, overflow: "hidden",
  },
  undoRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 16 },
  undo: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
