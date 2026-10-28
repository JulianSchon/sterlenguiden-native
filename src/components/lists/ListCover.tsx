/**
 * Omslag till en lista. En valfri egen omslagsbild (`coverImageUrl`) vinner alltid; annars byggs
 * den av listans platsbilder: inga bilder = mörk ruta med nål, 1–3 = första bilden, 4 = rutnät 2×2.
 *
 * ETT ställe som känner till den regeln, inte en kopierad if/else på varje ställe en lista visas
 * — det var precis så bytt-omslagsbild-funktionen hamnade i att bara synas på listans egen sida:
 * Mitt Österlens listrad och "Spara i lista"-arket hade sin egen separata rendering som aldrig
 * uppdaterades när coverImageUrl lades till.
 */
import { View, StyleSheet } from "react-native";
import { MapPin } from "lucide-react-native";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { Image as ExpoImage } from "expo-image";

/** width/height för en rektangulär yta (t.ex. listans stora Spotify-liknande header) — annars
 * en kvadrat på size×size, som i listöversikten och den gamla "Ny lista"-panelen. */
export function ListCover({
  coverImageUrl, images, size, width, height, radius = 16,
}: { coverImageUrl?: string | null; images: string[]; size?: number; width?: number; height?: number; radius?: number }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const w = width ?? size ?? 0;
  const h = height ?? size ?? 0;
  const box = { width: w, height: h, borderRadius: radius };

  if (coverImageUrl) {
    return <ExpoImage source={{ uri: coverImageUrl }} style={box} contentFit="cover" />;
  }

  if (images.length === 0) {
    return (
      <View style={[s.empty, box]}>
        <MapPin size={Math.min(w, h) * 0.16} color={colors.goldText} strokeWidth={1.8} />
      </View>
    );
  }

  if (images.length < 4) {
    return <ExpoImage source={{ uri: images[0] }} style={box} contentFit="cover" />;
  }

  const cellW = (w - 1) / 2;
  const cellH = (h - 1) / 2;
  return (
    <View style={[s.grid, box]}>
      {images.slice(0, 4).map((uri, i) => (
        <ExpoImage key={i} source={{ uri }} style={{ width: cellW, height: cellH }} contentFit="cover" />
      ))}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  empty: {
    backgroundColor: c.tile, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: c.goldBorder,
  },
  // 1 px svart mellanrum mellan rutorna kommer från bakgrunden
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 1, overflow: "hidden", backgroundColor: "#000" },
});
