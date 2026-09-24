/**
 * Kortet som öppnas när man trycker på en lila nål. Tre lägen:
 *  - har den:  stickern sitter "påklistrad" i färg, datum och kuriosa
 *  - nära:     inom 75 m — knappen Lås upp är aktiv
 *  - långt bort: silhuett, avstånd och uppmaning att gå närmare
 * Avståndet räknas ur användarens live-position (kartan följer den redan).
 */
import { useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, Animated, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { useCollectSticker, type Collectible } from "@/hooks/useCollectibles";
import { distanceMeters, formatDistance } from "@/lib/checkin";
import { STICKER_RADIUS_M } from "@/lib/stickers";
import { StickerArt } from "./StickerArt";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.6)";
const PURPLE = "#A78BFA";

export function StickerCard({
  collectible, collectedAt, userLoc, bottom, onClose,
}: {
  collectible: Collectible;
  /** ISO-tid när stickern låstes upp, eller undefined om användaren inte har den */
  collectedAt: string | undefined;
  userLoc: { latitude: number; longitude: number } | null;
  bottom: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const collect = useCollectSticker();
  const collected = !!collectedAt;
  const distance = userLoc
    ? distanceMeters(userLoc.latitude, userLoc.longitude, collectible.lat, collectible.lng)
    : null;
  const near = distance != null && distance <= STICKER_RADIUS_M;

  // "Landar" på kortet när den låses upp: krymper från stor och sätter sig med lite lutning
  const land = useRef(new Animated.Value(collected ? 1 : 0)).current;
  useEffect(() => {
    if (collected) Animated.spring(land, { toValue: 1, useNativeDriver: true, stiffness: 180, damping: 12 }).start();
  }, [collected, land]);

  async function unlock() {
    if (!userLoc) return;
    try {
      await collect.mutateAsync({ collectibleId: collectible.id, lat: userLoc.latitude, lng: userLoc.longitude });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      /* felet visas nedan via collect.error */
    }
  }

  const errorText = collect.isError
    ? collect.error.message === "too_far"
      ? "Du är för långt bort. Gå lite närmare och försök igen."
      : "Det gick inte att låsa upp. Försök igen."
    : null;

  return (
    <View style={[s.card, { bottom }]}>
      <TouchableOpacity style={s.close} onPress={onClose} hitSlop={12}>
        <X size={18} color="rgba(255,255,255,0.6)" strokeWidth={2} />
      </TouchableOpacity>

      <View style={s.row}>
        <Animated.View
          style={[
            s.art,
            collected && {
              transform: [
                { scale: land.interpolate({ inputRange: [0, 1], outputRange: [1.7, 1] }) },
                { rotate: land.interpolate({ inputRange: [0, 1], outputRange: ["-28deg", "-6deg"] }) },
              ],
            },
          ]}
        >
          <StickerArt collectible={collectible} size={96} silhouette={!collected} />
        </Animated.View>

        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>SAMLAROBJEKT</Text>
          <Text style={s.name} numberOfLines={2}>{collectible.name}</Text>
          {collectible.town ? <Text style={s.town}>{collectible.town}</Text> : null}
          {collectible.placeId != null && (
            <TouchableOpacity onPress={() => router.push(`/place/${collectible.placeId}` as any)} hitSlop={8}>
              <Text style={s.placeLink}>Visa platsen</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {collected ? (
        <View style={s.body}>
          <Text style={s.collectedAt}>
            Upplåst {format(new Date(collectedAt!), "d MMMM yyyy", { locale: sv })}
          </Text>
          {collectible.description ? <Text style={s.description}>{collectible.description}</Text> : null}
        </View>
      ) : (
        <View style={s.body}>
          <Text style={s.hint}>
            {distance == null
              ? "Slå på platsåtkomst för att kunna låsa upp."
              : near
                ? "Du är framme! Lås upp stickern."
                : `Du är ${formatDistance(distance)} bort. Befinn dig inom ${STICKER_RADIUS_M} m för att låsa upp.`}
          </Text>
          {errorText ? <Text style={s.error}>{errorText}</Text> : null}
          <Text style={s.safety}>Var uppmärksam på omgivningen och respektera privat mark.</Text>
          <TouchableOpacity
            style={[s.button, (!near || collect.isPending) && s.buttonOff]}
            disabled={!near || collect.isPending}
            activeOpacity={0.85}
            onPress={unlock}
          >
            <Text style={[s.buttonText, !near && { color: "rgba(255,255,255,0.4)" }]}>
              {collect.isPending ? "Låser upp…" : "Lås upp"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    position: "absolute", left: 12, right: 12, borderRadius: 22, padding: 16,
    backgroundColor: "rgba(18,18,22,0.97)", borderWidth: 0.5, borderColor: "rgba(167,139,250,0.45)",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24,
  },
  close: { position: "absolute", top: 14, right: 14, zIndex: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  art: {
    width: 96, height: 96,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 6,
  },
  eyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 10.5, letterSpacing: 1.4, color: PURPLE },
  name: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: FG, marginTop: 4, paddingRight: 24 },
  town: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED, marginTop: 2 },
  placeLink: { fontFamily: "Inter_500Medium", fontSize: 13, color: PURPLE, marginTop: 6 },
  body: { marginTop: 14, gap: 10 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 13.5, lineHeight: 20, color: MUTED },
  error: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#E57373" },
  safety: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: "rgba(245,241,232,0.4)" },
  button: { backgroundColor: "#7C3AED", borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  buttonOff: { backgroundColor: "rgba(255,255,255,0.08)" },
  buttonText: { fontFamily: "Inter_600SemiBold", fontSize: 15.5, color: "#FFFFFF" },
  collectedAt: { fontFamily: "Inter_500Medium", fontSize: 13, color: PURPLE },
  description: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, color: "rgba(245,241,232,0.85)" },
});
