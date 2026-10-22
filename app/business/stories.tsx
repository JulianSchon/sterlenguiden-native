/**
 * Berättelser: de som är ute nu (24 timmar) och de senaste 30 dagarna, med hur många som sett var
 * och en. Tryck på en för att ta bort den. Nya skapas med Ny berättelse (business/story).
 */
import { useRef } from "react";
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { Camera, Eye } from "lucide-react-native";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { GoldButton } from "@/components/auth/AuthParts";
import { Note, PortalToast, SectionHeader, type PortalToastHandle } from "@/components/business/PortalParts";
import { usePlaceStories, usePortalPlace, useStoryActions } from "@/hooks/useBusiness";
import { businessError, removePlaceImages, type BusinessStory } from "@/lib/business";
import { pushOnce } from "@/lib/navigateOnce";
import { useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

/** "3 h kvar", "Ute i 20 min till" */
function left(st: BusinessStory): string {
  const ms = new Date(st.expires_at ?? 0).getTime() - Date.now();
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `${h} h kvar` : `${Math.max(1, Math.round(ms / 60_000))} min kvar`;
}

export default function BusinessStories() {
  const router = useRouter();
  const s = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const { placeId } = usePortalPlace();
  const { data: stories } = usePlaceStories(placeId);
  const actions = useStoryActions(placeId);
  const toast = useRef<PortalToastHandle>(null);
  const live = (stories ?? []).filter((st) => st.expires_at && new Date(st.expires_at).getTime() > Date.now());
  const old = (stories ?? []).filter((st) => !live.includes(st));
  const w = (width - 32 - 20) / 3;

  const ask = (st: BusinessStory) => {
    Alert.alert("Ta bort berättelsen?", "Den försvinner direkt för alla.", [
      { text: "Avbryt", style: "cancel" },
      {
        text: "Ta bort", style: "destructive",
        onPress: () => actions.remove(st.id)
          .then(() => { removePlaceImages([st.image_url]); toast.current?.show("Borttagen"); })
          .catch((e) => toast.current?.show(businessError(e))),
      },
    ]);
  };

  const tile = (st: BusinessStory, isLive: boolean) => (
    <Pressable key={st.id} onPress={() => ask(st)} style={[s.tile, { width: w, height: w * 16 / 9 }]} accessibilityLabel="Berättelse">
      <ExpoImage source={{ uri: st.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
      <View style={s.tileShade} />
      {isLive && <Text style={s.tileLive}>{left(st)}</Text>}
      <View style={s.tileViews}>
        <Eye size={13} color="#FFFFFF" strokeWidth={2.2} />
        <Text style={s.tileViewsText}>{st.views}</Text>
      </View>
    </Pressable>
  );

  return (
    <>
      <SettingsScreen title="Berättelser">
        <Rise index={0}>
          <Note icon={Camera} text="En berättelse syns överst på Hem i 24 timmar – för alla, och först för dem som sparat er." />
        </Rise>
        {!stories ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            {[0, 1, 2].map((i) => <Skeleton key={i} width={w} height={w * 16 / 9} radius={14} />)}
          </View>
        ) : (
          <>
            <Rise index={1}>
              <View>
                <SectionHeader title={live.length ? `Ute nu · ${live.length}` : "Ute nu"} />
                {live.length ? <View style={s.grid}>{live.map((st) => tile(st, true))}</View> : (
                  <Text style={s.none}>Ingen berättelse ute just nu.</Text>
                )}
              </View>
            </Rise>
            {old.length > 0 && (
              <Rise index={2}>
                <View>
                  <SectionHeader title="Senaste 30 dagarna" />
                  <View style={s.grid}>{old.map((st) => tile(st, false))}</View>
                </View>
              </Rise>
            )}
          </>
        )}
        <Rise index={3}>
          <GoldButton label="Ny berättelse" onPress={() => pushOnce(router, `/business/story?place=${placeId}`)} />
        </Rise>
      </SettingsScreen>
      <PortalToast ref={toast} />
    </>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { borderRadius: 14, overflow: "hidden", backgroundColor: c.fill },
  tileShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.12)" },
  tileLive: {
    position: "absolute", top: 8, left: 8, fontFamily: "Inter_700Bold", fontSize: 11, color: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, overflow: "hidden",
  },
  tileViews: { position: "absolute", bottom: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  tileViewsText: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#FFFFFF", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4 },
  none: { fontFamily: "Inter_400Regular", fontSize: 14, color: c.muted, paddingHorizontal: 4 },
});
