/**
 * Mörkt eller ljust: två rutor med en liten bild av appen i varje läge. Ett tryck byter temat
 * direkt (hela kontoskapandet följer med), så man ser valet innan man går vidare. Valet sparas i
 * telefonen som på Inställningar › Utseende, där det kan ändras sen.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Check } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { AuthButton, FieldNote } from "@/components/auth/AuthParts";
import { StepLayout } from "./StepLayout";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { darkColors, lightColors, type ThemeColors } from "@/theme/colors";

export function AppearanceStep({ onSubmit }: { onSubmit: () => void }) {
  const { t } = useTranslation();
  const { mode, setMode, colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const choose = (next: "dark" | "light") => {
    if (next === mode) return;
    Haptics.selectionAsync().catch(() => {});
    setMode(next);
  };
  return (
    <StepLayout
      title={t("onboarding.appearance.title")}
      subtitle={t("onboarding.appearance.subtitle")}
      footer={<AuthButton label={t("onboarding.next")} onPress={onSubmit} />}
    >
      <View style={s.row}>
        {(["dark", "light"] as const).map((id) => {
          const selected = mode === id;
          return (
            <Pressable
              key={id}
              style={s.option}
              onPress={() => choose(id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <View style={[s.frame, selected && s.frameSelected]}>
                <Preview c={id === "dark" ? darkColors : lightColors} />
              </View>
              <View style={s.labelRow}>
                <View style={[s.radio, selected && s.radioOn]}>
                  {selected ? <Check size={13} color={colors.onGold} strokeWidth={3} /> : null}
                </View>
                <Text style={[s.label, !selected && s.labelOff]}>{t(id === "dark" ? "onboarding.appearance.dark" : "onboarding.appearance.light")}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <FieldNote text={t("onboarding.appearance.note")} />
    </StepLayout>
  );
}

/** En förenklad sida i lägets egna färger: rubrik, ett kort med bild och text, och en knapp */
function Preview({ c }: { c: ThemeColors }) {
  return (
    <View style={[p.screen, { backgroundColor: c.bg }]}>
      <View style={[p.line, { width: "55%", height: 9, backgroundColor: c.text }]} />
      <View style={[p.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={[p.photo, { backgroundColor: c.fill }]} />
        <View style={[p.line, { width: "70%", backgroundColor: c.text }]} />
        <View style={[p.line, { width: "45%", backgroundColor: c.muted }]} />
      </View>
      <View style={[p.line, { width: "80%", backgroundColor: c.faint }]} />
      <View style={[p.line, { width: "60%", backgroundColor: c.faint }]} />
      <View style={[p.button, { backgroundColor: c.gold }]} />
    </View>
  );
}

const p = StyleSheet.create({
  screen: { flex: 1, padding: 12, gap: 8 },
  line: { height: 6, borderRadius: 3 },
  card: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 8, gap: 6 },
  photo: { height: 46, borderRadius: 6 },
  button: { marginTop: "auto", height: 18, borderRadius: 9 },
});

const createStyles = (c: ThemeColors) => StyleSheet.create({
  row: { flexDirection: "row", gap: 14, marginTop: 4 },
  option: { flex: 1, gap: 12 },
  frame: {
    aspectRatio: 0.62, borderRadius: 18, overflow: "hidden",
    borderWidth: 2, borderColor: c.borderStrong,
  },
  frameSelected: { borderColor: c.gold },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  radioOn: { backgroundColor: c.gold, borderColor: c.gold },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 15.5, color: c.text },
  labelOff: { color: c.muted },
});
