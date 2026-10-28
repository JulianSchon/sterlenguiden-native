/**
 * Om er: namnet, en kort mening (syns under namnet och i sökningen) och en längre text (syns när
 * man läser mer på platssidan). Sparas medan man skriver. Överst syns hur det ser ut i sökningen.
 */
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { GradientCard } from "@/components/GradientCard";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { PortalField, SaveIndicator, SectionHeader } from "@/components/business/PortalParts";
import { useBusinessPlace, usePlaceAutosave, usePortalPlace } from "@/hooks/useBusiness";
import { placeImages } from "@/hooks/usePlaces";
import { useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const SHORT_GOOD = 120;

export default function BusinessAbout() {
  const s = useThemedStyles(createStyles);
  const { placeId } = usePortalPlace();
  const { data: place } = useBusinessPlace(placeId);
  const auto = usePlaceAutosave(placeId);
  const [draft, setDraft] = useState<{ name: string; short: string; long: string } | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (place && !draft) setDraft({ name: place.name, short: place.short_description ?? "", long: place.description ?? "" });
  }, [place, draft]);

  if (!place || !draft) {
    return (
      <SettingsScreen title="Om er">
        <Skeleton height={96} radius={18} />
        <Skeleton height={80} radius={14} />
        <Skeleton height={180} radius={14} />
      </SettingsScreen>
    );
  }

  const image = placeImages(place.image_url)[0];

  return (
    <SettingsScreen title="Om er" right={<SaveIndicator state={auto.state} onRetry={auto.flush} />}>
      <Rise index={0}>
        <View>
          <SectionHeader title="Så här syns ni i sökningen" />
          <GradientCard>
            <View style={s.preview}>
              {image ? <ExpoImage source={{ uri: image }} style={s.thumb} contentFit="cover" /> : <View style={s.thumb} />}
              <View style={{ flex: 1 }}>
                <Text style={s.previewName} numberOfLines={1}>{draft.name || "Ert namn"}</Text>
                <Text style={s.previewShort} numberOfLines={2}>{draft.short || "En kort mening om er syns här."}</Text>
                {!!place.nearest_town && <Text style={s.previewTown}>{place.nearest_town}</Text>}
              </View>
            </View>
          </GradientCard>
        </View>
      </Rise>

      <Rise index={1}>
        <View style={s.fields}>
          <PortalField
            label="Företagets namn"
            value={draft.name}
            maxLength={80}
            error={nameError}
            onChangeText={(v) => {
              setDraft({ ...draft, name: v });
              const ok = v.trim().length >= 2;
              setNameError(ok ? null : "Namnet behöver minst två tecken.");
              if (ok) auto.queue({ name: v.trim() });
            }}
          />
          <PortalField
            label="Kort om er"
            value={draft.short}
            counter={SHORT_GOOD}
            maxLength={200}
            multiline
            placeholder="T.ex. Gårdshotell med spa och egen restaurang, fem minuter från havet."
            help="En eller två meningar. Syns under ert namn och i sökningen."
            onChangeText={(v) => { setDraft({ ...draft, short: v }); auto.queue({ short_description: v.trim() || null }); }}
            style={{ minHeight: 76 }}
          />
          <PortalField
            label="Berätta mer"
            value={draft.long}
            maxLength={4000}
            multiline
            placeholder="Vad gör er speciella? Vad ska gästerna inte missa? Hur hittar man er?"
            help="Syns när gästerna läser mer om er. Skriv som ni pratar – det blir bäst så."
            onChangeText={(v) => { setDraft({ ...draft, long: v }); auto.queue({ description: v.trim() || null }); }}
            style={{ minHeight: 200 }}
          />
        </View>
      </Rise>
      {auto.error && <Text style={s.error}>{auto.error}</Text>}
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  preview: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  thumb: { width: 72, height: 72, borderRadius: 14, backgroundColor: c.fill },
  previewName: { fontFamily: "Montserrat_700Bold", fontSize: 15.5, color: c.text },
  previewShort: { fontFamily: "Inter_400Regular", fontSize: 13.5, lineHeight: 19, color: c.muted, marginTop: 3 },
  previewTown: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: c.faint, marginTop: 4 },
  fields: { gap: 22 },
  error: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: c.danger, textAlign: "center" },
});
