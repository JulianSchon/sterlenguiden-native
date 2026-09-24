/**
 * Omslag till en lista, byggt av listans platsbilder:
 * inga bilder = mörk ruta med nål, 1–3 = första bilden, 4 = rutnät 2×2.
 */
import { View, Image, StyleSheet } from "react-native";
import { MapPin } from "lucide-react-native";

export function ListCover({ images, size, radius = 16 }: { images: string[]; size: number; radius?: number }) {
  const box = { width: size, height: size, borderRadius: radius };

  if (images.length === 0) {
    return (
      <View style={[s.empty, box]}>
        <MapPin size={size * 0.16} color="#C5A059" strokeWidth={1.8} />
      </View>
    );
  }

  if (images.length < 4) {
    return <Image source={{ uri: images[0] }} style={box} resizeMode="cover" />;
  }

  const cell = (size - 1) / 2;
  return (
    <View style={[s.grid, box]}>
      {images.slice(0, 4).map((uri, i) => (
        <Image key={i} source={{ uri }} style={{ width: cell, height: cell }} resizeMode="cover" />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  empty: {
    backgroundColor: "#1F1B15", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(197,160,89,0.25)",
  },
  // 1 px svart mellanrum mellan rutorna kommer från bakgrunden
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 1, overflow: "hidden", backgroundColor: "#000" },
});
