/**
 * "Samlarobjekt" på Mitt Österlen: alla stickers i ett rutnät. Upplåsta i
 * färg, övriga som mörka silhuetter (som troféerna på Utmaningar). Tryck
 * öppnar kartan med stickerns kort.
 */
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useCollectibles, useCollected } from "@/hooks/useCollectibles";
import { StickerArt } from "./StickerArt";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const PURPLE = "#A78BFA";

export function StickersSection() {
  const router = useRouter();
  const { data: collectibles = [] } = useCollectibles();
  const { data: collected = new Map<string, string>() } = useCollected();

  if (collectibles.length === 0) return null;

  const have = collectibles.filter((c) => collected.has(c.id)).length;

  return (
    <View style={s.section}>
      <View style={s.head}>
        <Text style={s.title}>Samlarobjekt</Text>
        <Text style={s.count}>{have} av {collectibles.length}</Text>
      </View>
      <View style={s.grid}>
        {collectibles.map((c) => {
          const has = collected.has(c.id);
          return (
            <TouchableOpacity
              key={c.id}
              style={s.cell}
              activeOpacity={0.8}
              onPress={() => router.push({ pathname: "/map", params: { sticker: c.id } } as any)}
            >
              <StickerArt collectible={c} size={68} silhouette={!has} />
              <Text style={[s.name, has && { color: FG }]} numberOfLines={2}>{c.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginTop: 32 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 16 },
  title: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 22, color: FG },
  count: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: PURPLE },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8, marginTop: 14 },
  cell: { width: "25%", alignItems: "center", paddingHorizontal: 4, paddingVertical: 8 },
  name: { fontFamily: "Inter_500Medium", fontSize: 11, color: MUTED, textAlign: "center", marginTop: 6 },
});
