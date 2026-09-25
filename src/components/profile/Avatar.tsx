/** Profilbild: användarens foto, annars initialer på en färgad cirkel, med valfri profilring. */
import { View, Text, Image, StyleSheet } from "react-native";
import { initialsOf, toneOnTone } from "@/lib/color";
import { AvatarRing } from "@/components/profile/AvatarRing";

export function Avatar({
  size, uri, name, color = "#2A2A2A", textColor, ring,
}: { size: number; uri?: string | null; name: string; color?: string; textColor?: string; ring?: string | null }) {
  return (
    <AvatarRing ring={ring} size={size}>
      <View style={[s.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
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
