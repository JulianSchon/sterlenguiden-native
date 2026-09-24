/** Profilbild: användarens foto, annars initialer på en färgad cirkel. */
import { View, Text, Image, StyleSheet } from "react-native";

export function Avatar({
  size, uri, name, color = "#2A2A2A", textColor = "#F5F1E8",
}: { size: number; uri?: string | null; name: string; color?: string; textColor?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <View style={[s.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <Text style={[s.initials, { fontSize: size * 0.36, color: textColor }]}>{initials || "?"}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  initials: { fontFamily: "PlayfairDisplay_700Bold" },
});
