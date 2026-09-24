/**
 * Inställningar › Lös in kod. En kod (t.ex. en present eller en testkod) ger
 * tid i Österlenpasset. Själva utdelningen sker i databasfunktionen
 * redeem_pass_code, som räknar ut den nya tiden — appen skriver aldrig
 * medlemsdatum själv.
 */
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Check } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

const BG    = "#121212";
const FG    = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD  = "#C5A059";

type Failure = "used" | "not_found" | "unlimited" | "error";
type RedeemResult = { ok: boolean; reason?: string; member_until?: string | null; saved?: boolean; days?: number };

export default function RedeemCodeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [outcome, setOutcome] = useState<{ until: string | null; saved: boolean; days: number } | null>(null);

  async function redeem() {
    setBusy(true);
    setFailure(null);
    const { data, error } = await supabase.rpc("redeem_pass_code", { _code: code.trim().toUpperCase() });
    setBusy(false);
    const result = data as RedeemResult | null;
    if (error || !result) return setFailure("error");
    if (!result.ok) return setFailure(result.reason === "used" ? "used" : result.reason === "unlimited" ? "unlimited" : "not_found");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    setOutcome({ until: result.member_until ?? null, saved: !!result.saved, days: result.days ?? 0 });
  }

  const errorText =
    failure === "used" ? "Koden har redan använts."
    : failure === "not_found" ? "Ogiltig kod. Kontrollera och försök igen."
    : failure === "unlimited" ? "Du har redan ett pass utan slutdatum, så koden behövs inte."
    : failure === "error" ? "Det gick inte att lösa in koden. Försök igen."
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[s.header, { paddingTop: Math.max(insets.top, 44) }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={20} color={FG} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Lös in kod</Text>
      </View>

      <View style={s.body}>
        {outcome ? (
          <View style={{ alignItems: "center", gap: 14 }}>
            <View style={s.check}>
              <Check size={30} color="#121212" strokeWidth={3} />
            </View>
            <Text style={s.title}>{outcome.saved ? "Tiden är sparad!" : "Passet är aktiverat!"}</Text>
            {outcome.saved ? (
              <Text style={s.sub}>
                {outcome.days} dagar är sparade och används när ditt pass slutar förnyas. Du förlorar ingenting.
              </Text>
            ) : outcome.until ? (
              <Text style={s.sub}>Ditt Österlenpass gäller nu till och med {format(new Date(outcome.until), "d MMMM yyyy", { locale: sv })}.</Text>
            ) : null}
            <Text style={s.note}>Löser du in fler koder läggs tiden på automatiskt.</Text>
            <TouchableOpacity style={s.button} onPress={() => router.back()}>
              <Text style={s.buttonText}>Klar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={s.title}>Lös in din kod</Text>
            <Text style={s.sub}>Skriv in koden du fått, till exempel som present.</Text>
            <TextInput
              style={[s.input, failure && s.inputError]}
              value={code}
              onChangeText={(t) => {
                setCode(t.toUpperCase());
                setFailure(null);
              }}
              maxLength={16}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="ABCD1234"
              placeholderTextColor="rgba(255,255,255,0.25)"
            />
            {errorText ? <Text style={s.error}>{errorText}</Text> : null}
            <TouchableOpacity
              style={[s.button, (code.trim().length < 4 || busy) && { opacity: 0.4 }]}
              disabled={code.trim().length < 4 || busy}
              onPress={redeem}
            >
              {busy ? <ActivityIndicator color="#121212" /> : <Text style={s.buttonText}>Aktivera passet</Text>}
            </TouchableOpacity>
            <Text style={s.note}>Har du redan ett pass läggs tiden på. Är ditt pass förnyande sparas tiden och används när det slutar förnyas.</Text>
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)", backgroundColor: BG,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  headerTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: FG, flex: 1 },
  body: { padding: 24, gap: 14 },
  title: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 26, color: FG, textAlign: "center" },
  sub: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, textAlign: "center", lineHeight: 21 },
  input: {
    fontFamily: "PlayfairDisplay_700Bold", fontSize: 26, letterSpacing: 5, color: FG, textAlign: "center",
    backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 16, paddingVertical: 16,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", marginTop: 6,
  },
  inputError: { borderColor: "rgba(248,113,113,0.6)" },
  error: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#F87171", textAlign: "center" },
  button: { backgroundColor: GOLD, borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center", width: "100%" },
  buttonText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#121212" },
  note: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(245,241,232,0.4)", textAlign: "center", lineHeight: 18 },
  check: { width: 64, height: 64, borderRadius: 32, backgroundColor: GOLD, alignItems: "center", justifyContent: "center" },
});
