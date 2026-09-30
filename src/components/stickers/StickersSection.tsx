/**
 * "Samlarobjekt" på Mitt Österlen: stickers i ett rutnät, 3 per rad. Upplåsta i
 * färg, övriga som mörka silhuetter (som troféerna på Utmaningar). Tryck
 * öppnar kartan med stickerns kort.
 *
 * Visar bara 2 rader (6 st) till att börja med — "Visa fler" fäller ut resten.
 * Samma princip som troféraden/Samlarobjekt-sektionen på vänprofilen: aldrig
 * en lång lista rakt av på sidan.
 */
import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useCollectibles, useCollected } from "@/hooks/useCollectibles";
import { PressableScale } from "@/components/PressableScale";
import { StickerArt } from "./StickerArt";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const PURPLE = "#A78BFA";
const COLLAPSED_COUNT = 6;

export function StickersSection() {
  const router = useRouter();
  const { data: collectibles = [] } = useCollectibles();
  const { data: collected = new Map<string, string>() } = useCollected();
  const [expanded, setExpanded] = useState(false);

  if (collectibles.length === 0) return null;

  const have = collectibles.filter((c) => collected.has(c.id)).length;
  const visible = expanded ? collectibles : collectibles.slice(0, COLLAPSED_COUNT);
  const canExpand = collectibles.length > COLLAPSED_COUNT;

  return (
    <View style={s.section}>
      <View style={s.head}>
        <Text style={s.title}>Samlarobjekt</Text>
        <Text style={s.count}>{have} av {collectibles.length}</Text>
      </View>
      <View style={s.grid}>
        {visible.map((c) => {
          const has = collected.has(c.id);
          return (
            <TouchableOpacity
              key={c.id}
              style={s.cell}
              activeOpacity={0.8}
              onPress={() => router.push({ pathname: "/map", params: { sticker: c.id } } as any)}
            >
              <StickerArt imagePath={c.imagePath} size={68} silhouette={!has} />
              <Text style={[s.name, has && { color: FG }]} numberOfLines={2}>{c.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {canExpand && (
        <PressableScale style={s.moreBtn} scale={0.97} onPress={() => setExpanded((e) => !e)}>
          <Text style={s.moreBtnText}>{expanded ? "Visa färre" : "Visa fler"}</Text>
          {expanded ? (
            <ChevronUp size={16} color={PURPLE} strokeWidth={2.2} />
          ) : (
            <ChevronDown size={16} color={PURPLE} strokeWidth={2.2} />
          )}
        </PressableScale>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginTop: 32 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 16 },
  // Playfair bort — bara för personnamn i appen numera, sektionsrubriker delar Montserrat
  title: { fontFamily: "Montserrat_700Bold", fontSize: 18, letterSpacing: -0.2, color: FG },
  count: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: PURPLE },
  // 3 per rad (var 4) så 6 stycken blir exakt två rader innan "Visa fler"
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8, marginTop: 14 },
  cell: { width: "33.333%", alignItems: "center", paddingHorizontal: 4, paddingVertical: 8 },
  name: { fontFamily: "Inter_500Medium", fontSize: 11, color: MUTED, textAlign: "center", marginTop: 6 },
  moreBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: 6, marginHorizontal: 16, paddingVertical: 12, borderRadius: 12,
    backgroundColor: "rgba(167,139,250,0.10)", borderWidth: 1, borderColor: "rgba(167,139,250,0.25)",
  },
  moreBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: PURPLE },
});
