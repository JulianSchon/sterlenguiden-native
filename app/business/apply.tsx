/**
 * Företaget finns inte i appen än: en kort ansökan (namn, ort, kategori, hemsida). Sedan mejlar man
 * oss från företagets egen e-post (beviset), vi lägger till platsen — och man sköter den själv.
 */
import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Globe, Store } from "lucide-react-native";
import { AuthButton, FieldNote } from "@/components/auth/AuthParts";
import { StepLayout } from "@/components/onboarding/StepLayout";
import { Chip, PortalField } from "@/components/business/PortalParts";
import { WizardFrame } from "@/components/business/Wizard";
import { DoneMoment } from "@/components/business/WizardParts";
import { applyNewPlace } from "@/hooks/useBusiness";
import { businessError, cleanUrl } from "@/lib/business";
import { OSTERLEN_TOWNS } from "@/lib/osterlenTowns";
import { CATEGORIES, CATEGORY_DB_VALUE, type CategoryId } from "@/theme/categories";
import { useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const HELP_EMAIL = "hej@osterlenappen.se";

export default function ApplyScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const s = useThemedStyles(createStyles);
  const [name, setName] = useState("");
  const [town, setTown] = useState<string | null>(null);
  const [otherTown, setOtherTown] = useState("");
  const [cat, setCat] = useState<CategoryId | null>(null);
  const [web, setWeb] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webError, setWebError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const townValue = town === "other" ? otherTown.trim() : town;
  const website = cleanUrl(web);
  const ok = name.trim().length >= 2 && !!townValue && website !== false;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await applyNewPlace({
        name: name.trim(), town: townValue!, category: cat ? CATEGORY_DB_VALUE[cat] : null,
        website: website || null, message: message.trim() || null,
      });
      if (!r.ok) {
        setError(r.reason === "already_pending" ? "Du har redan en ansökan som väntar." : r.reason === "not_adult" ? "Du behöver vara 18 år." : r.reason === "too_many" ? "Du har skickat många förfrågningar i dag. Försök i morgon." : "Kolla att allt är ifyllt.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["business", "overview"] });
      setSent(true);
    } catch (e) {
      setError(businessError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <WizardFrame stepKey={sent ? "sent" : "form"} progress={sent ? 1 : 0.5} forward onBack={() => router.back()} hideBar={sent}>
      {sent ? (
        <DoneMoment
          title="Sista steget"
          text={`Mejla oss från ${name.trim()}s egen e-post, så vet vi att det är ni. Sedan lägger vi till företaget och du hittar det under Inställningar.`}
          primary={{
            label: "Mejla oss nu",
            onPress: () => {
              const subject = encodeURIComponent(`${name.trim()} vill finnas i Österlenappen`);
              Linking.openURL(`mailto:${HELP_EMAIL}?subject=${subject}`).catch(() => {});
              router.back();
            },
          }}
          secondary={{ label: "Jag gör det sen", onPress: () => router.back() }}
        />
      ) : (
        <StepLayout
          title="Berätta om företaget"
          subtitle="Vi lägger till det i appen. Sedan mejlar du oss från företagets e-post, så vet vi att det är ni."
          scroll
          footer={<>
            {error && <FieldNote tone="danger" text={error} />}
            <AuthButton label="Skicka" onPress={send} loading={busy} disabled={!ok} />
          </>}
        >
          <PortalField label="Företagets namn" icon={Store} value={name} onChangeText={setName} maxLength={80} placeholder="T.ex. Kiviks Gårdsbutik" />
          <Text style={s.small}>Var ligger det?</Text>
          <View style={s.chips}>
            {OSTERLEN_TOWNS.map((t) => <Chip key={t.name} label={t.name} selected={town === t.name} onPress={() => setTown(t.name)} />)}
            <Chip label="Annan ort" selected={town === "other"} onPress={() => setTown("other")} />
          </View>
          {town === "other" && <PortalField label="Ort" value={otherTown} onChangeText={setOtherTown} maxLength={60} placeholder="T.ex. Vitemölla" />}
          <Text style={s.small}>Vad är det för företag?</Text>
          <View style={s.chips}>
            {CATEGORIES.map((c) => <Chip key={c.id} label={c.label} dot={c.screen} selected={cat === c.id} onPress={() => setCat(cat === c.id ? null : c.id)} />)}
          </View>
          <PortalField label="Hemsida eller Instagram (valfritt)" icon={Globe} value={web} onChangeText={(v) => { setWeb(v); if (webError) setWebError(null); }}
            onBlur={() => setWebError(cleanUrl(web) === false ? "Länken ser inte rätt ut." : null)} error={webError}
            keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="ertforetag.se" />
          <PortalField label="Något mer? (valfritt)" value={message} onChangeText={setMessage} multiline maxLength={600} style={{ minHeight: 70 }} />
        </StepLayout>
      )}
    </WizardFrame>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  small: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: c.muted, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
