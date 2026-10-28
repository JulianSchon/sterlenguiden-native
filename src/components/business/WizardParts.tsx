/**
 * Delar som guiderna delar: bildväljaren (platsens egna bilder eller en ny) och klart-ögonblicket
 * (en guldbock som poppar fram, en rad om vad som hänt och vad man kan göra sen).
 */
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Reanimated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Camera, Check, ImagePlus } from "lucide-react-native";
import { AUTH_GUTTER, AuthButton, TextButton } from "@/components/auth/AuthParts";
import { Skeleton } from "@/components/Skeleton";
import { businessError, uploadPlaceImage } from "@/lib/business";
import { pickPhotos, type PickedPhoto } from "@/lib/photos";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { tb } from "@/i18n/business";
import { appAlert } from "@/components/ActionMenu";

// ── Bildväljaren ────────────────────────────────────────────────────────────

/**
 * Platsens bilder som rutor (tryck för att välja), plus "Välj ny" och "Ta en bild". En ny bild
 * laddas upp direkt och blir vald. `value` är den valda adressen.
 */
export function ImageChooser({ placeId, images, value, onChange, onError }: {
  placeId: number;
  images: string[];
  value: string | null;
  onChange: (url: string) => void;
  onError: (message: string) => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const [extra, setExtra] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const size = (width - AUTH_GUTTER * 2 - 16) / 3;
  const all = [...extra, ...images.filter((u) => !extra.includes(u))];

  const add = async (source: "library" | "camera") => {
    try {
      let photo: PickedPhoto | null = null;
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          appAlert(tb("Kameran är avstängd"), tb("Slå på kameran för Österlenappen i telefonens inställningar."), [
            { text: tb("Avbryt"), style: "cancel" },
            { text: tb("Öppna inställningar"), onPress: () => Linking.openSettings() },
          ]);
          return;
        }
        const r = await ImagePicker.launchCameraAsync({ quality: 0.9 });
        if (!r.canceled) photo = { uri: r.assets[0].uri, width: r.assets[0].width, height: r.assets[0].height };
      } else {
        photo = (await pickPhotos(1))[0] ?? null;
      }
      if (!photo) return;
      setUploading(true);
      const url = await uploadPlaceImage(placeId, photo);
      setExtra((e) => [url, ...e]);
      onChange(url);
    } catch (e) {
      onError(businessError(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={s.grid}>
      <Pressable style={[s.addTile, { width: size, height: size }]} onPress={() => add("library")} accessibilityRole="button" accessibilityLabel={tb("Välj en ny bild")}>
        <ImagePlus size={24} color={colors.goldText} strokeWidth={1.9} />
        <Text style={s.addText}>{tb("Välj ny")}</Text>
      </Pressable>
      <Pressable style={[s.addTile, { width: size, height: size }]} onPress={() => add("camera")} accessibilityRole="button" accessibilityLabel={tb("Ta en bild")}>
        <Camera size={24} color={colors.goldText} strokeWidth={1.9} />
        <Text style={s.addText}>{tb("Ta en bild")}</Text>
      </Pressable>
      {uploading && <Skeleton width={size} height={size} radius={14} />}
      {all.map((url) => {
        const on = url === value;
        return (
          <Pressable
            key={url}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(url); }}
            style={[s.tile, { width: size, height: size }, on && { borderColor: colors.gold }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <ExpoImage source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
            {on && (
              <View style={s.check}>
                <Check size={14} color={colors.onGold} strokeWidth={3} />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Klart ───────────────────────────────────────────────────────────────────

export function DoneMoment({ title, text, primary, secondary }: {
  title: string;
  text: string;
  primary: { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const pop = useSharedValue(0);
  const tick = useSharedValue(0);
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    pop.value = withSequence(withTiming(1.12, { duration: 260, easing: Easing.out(Easing.cubic) }), withSpring(1, { damping: 14, stiffness: 220 }));
    tick.value = withDelay(180, withTiming(1, { duration: 260 }));
  }, [pop, tick]);
  const circle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }], opacity: Math.min(1, pop.value * 1.5) }));
  const check = useAnimatedStyle(() => ({ opacity: tick.value, transform: [{ scale: 0.6 + tick.value * 0.4 }] }));
  return (
    <View style={[s.done, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={s.doneTop}>
        <Reanimated.View style={[s.doneCircle, circle]}>
          <Reanimated.View style={check}>
            <Check size={44} color={colors.onGold} strokeWidth={3} />
          </Reanimated.View>
        </Reanimated.View>
        <Reanimated.Text entering={FadeIn.delay(220).duration(320)} style={s.doneTitle}>{title}</Reanimated.Text>
        <Reanimated.Text entering={FadeIn.delay(320).duration(320)} style={s.doneText}>{text}</Reanimated.Text>
      </View>
      <View style={s.doneButtons}>
        <AuthButton label={primary.label} onPress={primary.onPress} />
        {secondary && <TextButton label={secondary.label} onPress={secondary.onPress} />}
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  addTile: {
    borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1.5, borderStyle: "dashed", borderColor: c.goldBorder, backgroundColor: c.goldSoft,
  },
  addText: { fontFamily: "Inter_600SemiBold", fontSize: 12.5, color: c.goldText },
  tile: { borderRadius: 14, overflow: "hidden", borderWidth: 2.5, borderColor: "transparent", backgroundColor: c.fill },
  check: {
    position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: c.gold, alignItems: "center", justifyContent: "center",
  },

  done: { flex: 1, paddingHorizontal: AUTH_GUTTER, justifyContent: "space-between" },
  doneTop: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  doneCircle: { width: 104, height: 104, borderRadius: 52, backgroundColor: c.gold, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  doneTitle: { fontFamily: "Montserrat_700Bold", fontSize: 26, lineHeight: 32, letterSpacing: -0.6, color: c.text, textAlign: "center" },
  doneText: { fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 23, color: c.muted, textAlign: "center", paddingHorizontal: 8 },
  doneButtons: { gap: 4 },
});
