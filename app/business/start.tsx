/**
 * För företag: hur man tar hand om sin sida i appen, i tre steg, och sökningen efter sitt företag.
 * Finns företaget inte i appen kan man ansöka om att komma med (business/apply). Väntande
 * förfrågningar och ansökningar syns överst.
 */
import { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { ChevronRight, Clock, Mail, Search, Store } from "lucide-react-native";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { GradientCard } from "@/components/GradientCard";
import { Rise } from "@/components/Rise";
import { Note, PortalField, SectionHeader } from "@/components/business/PortalParts";
import { useBusinessOverview } from "@/hooks/useBusiness";
import { firstImageUrl, usePlaces } from "@/hooks/usePlaces";
import { pushOnce } from "@/lib/navigateOnce";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const STEPS = [
  "Sök fram ert företag här nedanför.",
  "Vi skickar en kod till företagets e-post – så vet vi att det är ni.",
  "Klart! Ändra öppettider, bilder, erbjudanden och evenemang själva.",
];

const norm = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export default function BusinessStart() {
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { data: places = [] } = usePlaces();
  const { data: overview } = useBusinessOverview();
  const [query, setQuery] = useState("");
  const pending = (overview?.requests ?? []).filter((r) => r.status === "pending");

  const hits = useMemo(() => {
    const q = norm(query);
    if (q.length < 2) return [];
    return places
      .filter((p) => norm(p.name).includes(q))
      .sort((a, b) => Number(!norm(a.name).startsWith(q)) - Number(!norm(b.name).startsWith(q)) || a.name.localeCompare(b.name, "sv"))
      .slice(0, 8);
  }, [places, query]);

  return (
    <SettingsScreen title="För företag">
      <Rise index={0}>
        <View style={s.hero}>
          <Text style={s.title}>Har ni ett företag på Österlen?</Text>
          <Text style={s.lead}>Ta hand om er sida i Österlenappen – öppettider, bilder, erbjudanden i Österlenpasset och evenemang. Det kostar ingenting.</Text>
        </View>
      </Rise>

      {pending.length > 0 && (
        <Rise index={1}>
          <GradientCard borderColor={colors.goldBorder}>
            {pending.map((r) => (
              <View key={r.id} style={s.pending}>
                <Clock size={18} color={colors.goldText} strokeWidth={2} />
                <Text style={s.pendingText}>
                  {r.kind === "new_place" ? `Er ansökan om ${r.place_name ?? "ert företag"} väntar på svar.` : `Er förfrågan om ${r.place_name ?? "platsen"} väntar på svar.`}
                </Text>
              </View>
            ))}
          </GradientCard>
        </Rise>
      )}

      <Rise index={2}>
        <View style={s.steps}>
          {STEPS.map((t, i) => (
            <View key={t} style={s.step}>
              <View style={s.stepN}><Text style={s.stepNText}>{i + 1}</Text></View>
              <Text style={s.stepText}>{t}</Text>
            </View>
          ))}
        </View>
      </Rise>

      <Rise index={3}>
        <View style={{ gap: 12 }}>
          <PortalField label="Ert företag" icon={Search} value={query} onChangeText={setQuery} placeholder="Skriv namnet" autoCorrect={false} returnKeyType="search" />
          {hits.length > 0 && (
            <GradientCard>
              {hits.map((p, i) => {
                const image = p.logo_url ?? firstImageUrl(p.image_url);
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.hit, i > 0 && s.border]}
                    activeOpacity={0.7}
                    onPress={() => pushOnce(router, `/business/claim?place=${p.id}`)}
                  >
                    <View style={s.hitImage}>
                      {image ? <ExpoImage source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Store size={18} color={colors.faint} strokeWidth={1.8} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.hitName} numberOfLines={1}>{p.name}</Text>
                      {p.nearest_town && <Text style={s.hitTown}>{p.nearest_town}</Text>}
                    </View>
                    <ChevronRight size={17} color={colors.faint} strokeWidth={2} />
                  </TouchableOpacity>
                );
              })}
            </GradientCard>
          )}
          {query.trim().length >= 2 && hits.length === 0 && (
            <Text style={s.none}>Vi hittar inget företag som heter så.</Text>
          )}
        </View>
      </Rise>

      <Rise index={4}>
        <View>
          <SectionHeader title="Finns ni inte med?" />
          <TouchableOpacity style={s.apply} activeOpacity={0.8} onPress={() => pushOnce(router, "/business/apply")}>
            <Store size={20} color={colors.goldText} strokeWidth={1.9} />
            <View style={{ flex: 1 }}>
              <Text style={s.applyTitle}>Ansök om att komma med</Text>
              <Text style={s.applySub}>Berätta om företaget så lägger vi till det.</Text>
            </View>
            <ChevronRight size={17} color={colors.faint} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </Rise>

      <Rise index={5}>
        <Note icon={Mail} text="Har någon på företaget bjudit in dig? Inbjudan syns under Inställningar när du loggat in med samma e-postadress som inbjudan skickades till." />
      </Rise>
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  hero: { gap: 10, paddingHorizontal: 4 },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 24, lineHeight: 30, letterSpacing: -0.5, color: c.text },
  lead: { fontFamily: "Inter_400Regular", fontSize: 15.5, lineHeight: 22, color: c.muted },
  pending: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  pendingText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14.5, lineHeight: 20, color: c.text },
  steps: { gap: 12, paddingHorizontal: 4 },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepN: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: c.goldSoft },
  stepNText: { fontFamily: "Montserrat_700Bold", fontSize: 14, color: c.goldText },
  stepText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14.5, lineHeight: 20, color: c.text },
  hit: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  hitImage: { width: 44, height: 44, borderRadius: 12, overflow: "hidden", backgroundColor: c.fill, alignItems: "center", justifyContent: "center" },
  hitName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.text },
  hitTown: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.muted, marginTop: 1 },
  none: { fontFamily: "Inter_400Regular", fontSize: 14, color: c.muted, paddingHorizontal: 4 },
  apply: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 18,
    backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border,
  },
  applyTitle: { fontFamily: "Montserrat_600SemiBold", fontSize: 15, color: c.text },
  applySub: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.muted, marginTop: 2 },
});
