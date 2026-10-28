/**
 * Profilbild: användarens foto, annars initialer på en färgad cirkel, med valfri profilring.
 * Fotot ges antingen som en färdig adress (uri) eller som sökvägen i den privata bildmappen (path) —
 * då hämtas en tillfällig länk här. Sökvägen kommer från servern bara för en själv och för vänner
 * (migration 032/034), så för alla andra blir det initialer.
 */
import { View, Text, StyleSheet } from "react-native";
import { initialsOf, toneOnTone } from "@/lib/color";
import { AvatarRing } from "@/components/profile/AvatarRing";
import { useOtherAvatarUrl } from "@/hooks/useAvatarUrl";
import { Image as ExpoImage } from "expo-image";
import { imageSource } from "@/lib/imageSource";

export function Avatar({
  size, uri: givenUri, path, name, color = "#2A2A2A", textColor, ring,
}: { size: number; uri?: string | null; path?: string | null; name: string; color?: string; textColor?: string; ring?: string | null }) {
  const signed = useOtherAvatarUrl(givenUri ? null : path ?? null);
  const uri = givenUri ?? signed;
  return (
    <AvatarRing ring={ring} size={size}>
      <View style={[s.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
        {uri ? (
          <ExpoImage source={imageSource(uri)} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Text style={[s.initials, { fontSize: size * 0.36, color: textColor ?? toneOnTone(color) }]}>
            {initialsOf(name) || "?"}
          </Text>
        )}
      </View>
    </AvatarRing>
  );
}

const s = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  initials: { fontFamily: "PlayfairDisplay_700Bold" },
});
