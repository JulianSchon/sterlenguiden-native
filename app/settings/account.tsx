/**
 * Inställningar › Konto
 */
import { useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, Alert, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronDown } from "lucide-react-native";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const BG    = "#121212";
const CARD  = "#1C1C1C";
const FG    = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD  = "#C5A059";
const BORDER= "rgba(255,255,255,0.06)";
const BORDER_GOLD = "rgba(197,160,89,0.20)";
const DESTR = "#E86A5E";

function Field({ label, value, onChangeText, placeholder, secureTextEntry = false, autoCapitalize = "none" }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; secureTextEntry?: boolean; autoCapitalize?: any;
}) {
  return (
    <View style={f.fieldWrap}>
      <Text style={f.label}>{label}</Text>
      <TextInput
        style={f.input} value={value} onChangeText={onChangeText}
        placeholder={placeholder ?? label} placeholderTextColor={MUTED}
        secureTextEntry={secureTextEntry} autoCapitalize={autoCapitalize}
        autoCorrect={false}
      />
    </View>
  );
}

export default function AccountSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: profile } = useProfile();

  const [name, setName] = useState(profile?.display_name ?? "");
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw]   = useState("");
  const [confPw, setConfPw] = useState("");

  const saveName = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Ej inloggad");
      const { error } = await supabase.from("profiles").update({ display_name: name.trim() }).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["profile"] }); Alert.alert("Sparat ✓"); },
    onError: (e: any) => Alert.alert("Fel", e.message),
  });

  const changePw = useMutation({
    mutationFn: async () => {
      if (newPw !== confPw) throw new Error("Lösenorden matchar inte");
      if (newPw.length < 8) throw new Error("Minst 8 tecken");
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
    },
    onSuccess: () => {
      Alert.alert("Lösenord uppdaterat ✓");
      setNewPw(""); setConfPw(""); setPwOpen(false);
    },
    onError: (e: any) => Alert.alert("Fel", e.message),
  });

  const safeTop = Math.max(insets.top, 44);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[f.header, { paddingTop: safeTop }]}>
        <TouchableOpacity style={f.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={20} color={FG} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={f.headerTitle}>Konto</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={f.body}>
        {/* Display name */}
        <View style={f.card}>
          <Text style={f.sectionEyebrow}>VISNINGSNAMN</Text>
          <Field label="" value={name} onChangeText={setName} placeholder="Ditt namn" autoCapitalize="words" />
          <TouchableOpacity
            style={[f.saveBtn, saveName.isPending && { opacity: 0.6 }]}
            onPress={() => saveName.mutate()}
            disabled={saveName.isPending}
          >
            {saveName.isPending
              ? <ActivityIndicator size="small" color={GOLD} />
              : <Text style={f.saveBtnText}>Spara namn</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Email (read-only) */}
        <View style={f.card}>
          <Text style={f.sectionEyebrow}>E-POSTADRESS</Text>
          <Text style={f.emailText}>{user?.email ?? "—"}</Text>
          <Text style={f.emailNote}>E-postadressen kan inte ändras här. Kontakta support.</Text>
        </View>

        {/* Change password */}
        <View style={f.card}>
          <TouchableOpacity style={f.accordionHeader} onPress={() => setPwOpen((o) => !o)}>
            <Text style={f.sectionEyebrow}>LÖSENORD</Text>
            <ChevronDown
              size={16} color={GOLD} strokeWidth={2}
              style={{ transform: [{ rotate: pwOpen ? "180deg" : "0deg" }] }}
            />
          </TouchableOpacity>
          {pwOpen && (
            <>
              <Field label="Nytt lösenord" value={newPw} onChangeText={setNewPw} secureTextEntry placeholder="••••••••" />
              <Field label="Bekräfta lösenord" value={confPw} onChangeText={setConfPw} secureTextEntry placeholder="••••••••" />
              <TouchableOpacity
                style={[f.saveBtn, changePw.isPending && { opacity: 0.6 }]}
                onPress={() => changePw.mutate()}
                disabled={changePw.isPending}
              >
                {changePw.isPending
                  ? <ActivityIndicator size="small" color={GOLD} />
                  : <Text style={f.saveBtnText}>Uppdatera lösenord</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const f = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)",
    backgroundColor: BG,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  headerTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: FG, flex: 1 },
  body: { padding: 20, gap: 16, paddingBottom: 60 },
  card: { backgroundColor: CARD, borderRadius: 22, padding: 20, borderWidth: 1, borderColor: BORDER, gap: 14 },
  sectionEyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: "rgba(197,160,89,0.75)", letterSpacing: 2, textTransform: "uppercase" },
  fieldWrap: { gap: 6 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: MUTED },
  input: {
    height: 48, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 16, fontFamily: "Inter_400Regular", fontSize: 15, color: FG,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  saveBtn: {
    height: 48, borderRadius: 14, backgroundColor: "rgba(197,160,89,0.15)",
    borderWidth: 1, borderColor: BORDER_GOLD,
    alignItems: "center", justifyContent: "center",
  },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: GOLD },
  emailText: { fontFamily: "Inter_400Regular", fontSize: 15, color: FG },
  emailNote: { fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED, lineHeight: 18 },
  accordionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
