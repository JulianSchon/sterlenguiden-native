/**
 * En hel sida som säger i klartext vad som gick fel och vad man kan göra — i stället för tekniska
 * felkoder. Används när en länk leder till en sida som inte finns, när något kraschat och när en
 * plats inte går att hitta.
 *
 * Läser färgerna själv (inte via ThemeProvider), eftersom den också visas när hela appen har
 * kraschat och temat inte finns. Appen sätter telefonens läge efter sitt eget val, så
 * useColorScheme() följer det.
 */
import type { ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { darkColors, lightColors } from "@/theme/colors";

interface Action { label: string; onPress: () => void }

export function ProblemScreen({
  icon, title, text, primary, secondary, detail,
}: {
  icon: (color: string) => ReactNode;
  title: string;
  text: string;
  primary: Action;
  secondary?: Action;
  /** Bara under utveckling: det tekniska felet, för den som bygger appen */
  detail?: string;
}) {
  const c = useColorScheme() === "light" ? lightColors : darkColors;
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.root, { backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      {icon(c.faint)}
      <Text style={[s.title, { color: c.text }]}>{title}</Text>
      <Text style={[s.text, { color: c.muted }]}>{text}</Text>
      <TouchableOpacity
        style={[s.button, { backgroundColor: c.text }]}
        activeOpacity={0.8}
        onPress={primary.onPress}
        accessibilityRole="button"
      >
        <Text style={[s.buttonText, { color: c.bg }]}>{primary.label}</Text>
      </TouchableOpacity>
      {secondary && (
        <TouchableOpacity style={s.link} activeOpacity={0.6} onPress={secondary.onPress} accessibilityRole="button">
          <Text style={[s.linkText, { color: c.muted }]}>{secondary.label}</Text>
        </TouchableOpacity>
      )}
      {__DEV__ && detail ? <Text style={[s.detail, { color: c.faint }]} selectable>{detail}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 20, textAlign: "center", marginTop: 4 },
  text: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21, textAlign: "center", maxWidth: 320 },
  button: {
    height: 48, minWidth: 180, paddingHorizontal: 26, borderRadius: 14, marginTop: 12,
    alignItems: "center", justifyContent: "center",
  },
  buttonText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  link: { paddingVertical: 10, paddingHorizontal: 16 },
  linkText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  detail: { fontFamily: "Inter_400Regular", fontSize: 11, textAlign: "center", marginTop: 16 },
});
