/**
 * "Stämmer något inte?" — ett tips om fel på platssidan (öppettider, länkar, bilder …). Man väljer
 * vad det gäller och kan skriva en rad. Tipsen hamnar i place_reports och läses i Supabase.
 *
 * Sidan ger panelen en ny key varje gång den öppnas, så den börjar alltid tom utan att något ritas
 * om medan den glider upp. Ett tryck var som helst utanför textrutan stänger tangentbordet.
 */
import { useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Check } from "lucide-react-native";
import { PrimaryButton, SecondaryButton, Sheet, useSheetInput } from "@/components/Sheet";
import { useTheme } from "@/theme/ThemeProvider";
import { useReportPlace, type ReportKind } from "@/hooks/useReportPlace";

const KINDS: { id: ReportKind; label: string }[] = [
  { id: "hours", label: "Öppettiderna" },
  { id: "contact", label: "Telefon eller länkar" },
  { id: "photos", label: "Bilderna" },
  { id: "description", label: "Beskrivningen" },
  { id: "closed", label: "Platsen har stängt" },
  { id: "other", label: "Något annat" },
];

export function ReportSheet({ visible, placeId, onClose }: {
  visible: boolean; placeId: number; onClose: () => void;
}) {
  const { colors } = useTheme();
  const input = useSheetInput();
  const report = useReportPlace();
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    if (!kind) return;
    Keyboard.dismiss();
    setError(null);
    report.mutate(
      { placeId, kind, message },
      {
        onSuccess: () => setSent(true),
        onError: (e) => setError(
          e instanceof Error && e.message === "report_limit"
            ? "Du har skickat många tips i dag. Försök igen i morgon."
            : "Det gick inte att skicka just nu. Försök igen om en stund.",
        ),
      },
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={sent ? "Tack!" : "Stämmer något inte?"}>
      {sent ? (
        <View style={s.done}>
          <View style={[s.doneIcon, { backgroundColor: colors.goldSoft }]}>
            <Check size={26} color={colors.goldText} strokeWidth={2.4} />
          </View>
          <Text style={[s.text, { color: colors.text, textAlign: "center" }]}>
            Vi kollar på det och rättar sidan om något är fel.
          </Text>
          <View style={{ alignSelf: "stretch" }}>
            <SecondaryButton label="Stäng" onPress={onClose} />
          </View>
        </View>
      ) : (
        <Pressable onPress={Keyboard.dismiss} accessible={false}>
          <Text style={[s.text, { color: colors.muted }]}>Tipsa oss, så rättar vi det. Vad gäller det?</Text>
          <View style={s.kinds}>
            {KINDS.map((k) => {
              const on = kind === k.id;
              return (
                <TouchableOpacity
                  key={k.id}
                  style={[s.kind, { backgroundColor: on ? colors.goldSoft : colors.fill, borderColor: on ? colors.gold : colors.border }]}
                  activeOpacity={0.75}
                  onPress={() => { Keyboard.dismiss(); setKind(k.id); }}
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.kindText, { color: on ? colors.goldText : colors.text }]}>{k.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={[input, s.message]}
            value={message}
            onChangeText={setMessage}
            placeholder="Berätta gärna mer (valfritt)"
            placeholderTextColor={colors.faint}
            multiline
            maxLength={1000}
          />
          {!!error && <Text style={[s.error, { color: colors.danger }]}>{error}</Text>}
          <PrimaryButton label="Skicka" onPress={send} disabled={!kind} loading={report.isPending} />
        </Pressable>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  text: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21 },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14, marginBottom: 14 },
  kind: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
  kindText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  message: { minHeight: 88, textAlignVertical: "top", marginBottom: 6 },
  error: { fontFamily: "Inter_500Medium", fontSize: 13, marginVertical: 6 },
  done: { alignItems: "center", gap: 14, paddingTop: 4 },
  doneIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
});
