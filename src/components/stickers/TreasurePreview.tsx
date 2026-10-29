/**
 * En skatt i stort när man trycker på den i samlingen (Mitt Österlen): resten av skärmen mörknar
 * och skatten hamnar i mitten, med namn och ort — och för den som hittat den även när och
 * kuriosan. Två val: Stäng, eller Visa på kartan (kartan flyger dit och zoomar in på skatten).
 * Ej hittade visas som samma mörka skymt som i samlingen.
 *
 * Kartan öppnas först när rutan är helt stängd (iOS onDismiss) — öppnas en ny sida medan en
 * Modal tonas bort kan iPhone låsa sig. Skatten växer fram när rutan faktiskt visas (onShow),
 * inte vid mount, så animationen aldrig hinner spelas klart osynligt.
 *
 * Mörkt i både ljust och mörkt läge, som appens andra stora ögonblick med skatter.
 */
import { useRef } from "react";
import { View, Text, Modal, Pressable, Platform, StyleSheet, useWindowDimensions } from "react-native";
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { MapPin } from "lucide-react-native";
import i18n from "i18next";
import type { Collectible } from "@/hooks/useCollectibles";
import { formatDate } from "@/i18n/dates";
import { PressableScale } from "@/components/PressableScale";
import { StickerArt } from "./StickerArt";

const PURPLE = "#A78BFA";
const TEXT = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.62)";

export function TreasurePreview({
  collectible, foundAt, onClose, onShowOnMap,
}: {
  /** Skatten som visas; null = stängd */
  collectible: Collectible | null;
  /** När den hittades (ISO), saknas om den inte är hittad */
  foundAt: string | undefined;
  onClose: () => void;
  onShowOnMap: (c: Collectible) => void;
}) {
  const { width } = useWindowDimensions();
  const art = Math.round(Math.min(width * 0.62, 280));
  // Innehållet ligger kvar medan rutan tonas bort, även när föräldern redan satt null
  const last = useRef<Collectible | null>(null);
  if (collectible) last.current = collectible;
  const c = collectible ?? last.current;

  const grow = useSharedValue(0.7);
  const artStyle = useAnimatedStyle(() => ({ transform: [{ scale: grow.value }] }));

  const pending = useRef<(() => void) | null>(null);
  const dismissed = () => {
    grow.value = 0.7;
    const fn = pending.current;
    pending.current = null;
    fn?.();
  };
  const showOnMap = () => {
    if (!c) return;
    pending.current = () => onShowOnMap(c);
    onClose();
    // Android har ingen onDismiss
    if (Platform.OS !== "ios") setTimeout(dismissed, 250);
  };

  const found = !!foundAt;
  return (
    <Modal
      visible={!!collectible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onShow={() => { grow.value = withSpring(1, { damping: 24, stiffness: 240 }); }}
      onDismiss={dismissed}
      onRequestClose={onClose}
    >
      <Pressable style={[StyleSheet.absoluteFill, s.backdrop]} onPress={onClose} accessibilityLabel={i18n.t("treasure.close")} />
      {c && (
        <View style={s.center} pointerEvents="box-none">
          <Reanimated.View style={artStyle} pointerEvents="none">
            <StickerArt imagePath={c.imagePath} size={art} silhouette={!found} />
          </Reanimated.View>
          <Text style={s.name}>{c.name}</Text>
          {!!c.town && <Text style={s.town}>{c.town}</Text>}
          {found && <Text style={s.found}>{i18n.t("treasure.found", { date: formatDate(foundAt!, "d MMMM yyyy") })}</Text>}
          {found && !!c.description && <Text style={s.description}>{c.description}</Text>}
          <View style={s.buttons}>
            {/* Varje knapp i en egen ruta som tar halva raden: PressableScale lägger sin stil på den
                inre vyn, så flex:1 direkt på den gav knappen bredden 0 */}
            <View style={s.slot}>
              <PressableScale style={[s.button, s.closeButton]} scale={0.97} onPress={onClose}>
                <Text style={s.closeText}>{i18n.t("treasure.close")}</Text>
              </PressableScale>
            </View>
            <View style={s.slot}>
              <PressableScale style={[s.button, s.mapButton]} scale={0.97} onPress={showOnMap}>
                <MapPin size={17} color="#17121F" strokeWidth={2.2} />
                <Text style={s.mapText}>{i18n.t("treasure.showOnMap")}</Text>
              </PressableScale>
            </View>
          </View>
        </View>
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.82)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  name: { fontFamily: "Montserrat_700Bold", fontSize: 24, color: TEXT, textAlign: "center", marginTop: 22 },
  town: { fontFamily: "Inter_500Medium", fontSize: 14, color: MUTED, textAlign: "center", marginTop: 4 },
  found: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: PURPLE, textAlign: "center", marginTop: 10 },
  description: {
    fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21, color: MUTED, textAlign: "center",
    marginTop: 12, maxWidth: 340,
  },
  buttons: { flexDirection: "row", gap: 12, marginTop: 28, alignSelf: "stretch", maxWidth: 360, width: "100%" },
  slot: { flex: 1 },
  button: {
    height: 50, borderRadius: 25, flexDirection: "row", gap: 7,
    alignItems: "center", justifyContent: "center",
  },
  closeButton: { borderWidth: 1, borderColor: "rgba(245,241,232,0.28)" },
  closeText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: TEXT },
  mapButton: { backgroundColor: PURPLE },
  mapText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#17121F" },
});
