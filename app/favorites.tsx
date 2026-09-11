/**
 * Favoriter – masonry photo wall
 * Spec: native-subpages-spec.md §2
 */
import { useCallback } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Image, Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Heart } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const BG    = "#121212";
const CARD  = "#1C1C1C";
const FG    = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD  = "#C5A059";
const BORDER= "rgba(255,255,255,0.06)";

const SW = Dimensions.get("window").width;
// Two-column masonry: alternating tall / 2×short pattern
const COL_W  = (SW - 20 * 2 - 8) / 2;
const TALL_H = COL_W * 1.45;
const SM_H   = (TALL_H - 8) / 2;

interface FavPlace {
  id: number;
  name: string;
  image_url: string | null;
  sub_category: string | null;
}

function useFavorites() {
  return useQuery<FavPlace[]>({
    queryKey: ["favorites-detail"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("favorites")
        .select("place_id, places(id, name, image_url, sub_category)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => r.places).filter(Boolean) as FavPlace[];
    },
  });
}

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: places = [], isLoading } = useFavorites();
  const safeTop = Math.max(insets.top, 44);

  // Build two columns in masonry pattern: tall | 2×short alternating
  const leftCol: { place: FavPlace; tall: boolean }[]  = [];
  const rightCol: { place: FavPlace; tall: boolean }[] = [];

  places.forEach((place, i) => {
    const group = Math.floor(i / 3); // groups of 3
    const posInGroup = i % 3;        // 0=left tall, 1=right top, 2=right bottom
    if (group % 2 === 0) {
      if (posInGroup === 0) leftCol.push({ place, tall: true });
      else rightCol.push({ place, tall: false });
    } else {
      if (posInGroup === 0) rightCol.push({ place, tall: true });
      else leftCol.push({ place, tall: false });
    }
  });

  const renderCard = (item: { place: FavPlace; tall: boolean }, key: string) => (
    <TouchableOpacity
      key={key}
      style={[mCard.wrap, { height: item.tall ? TALL_H : SM_H }]}
      onPress={() => router.push(`/place/${item.place.id}` as any)}
      activeOpacity={0.88}
    >
      {item.place.image_url
        ? <Image source={{ uri: item.place.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: CARD }]} />
      }
      <View style={mCard.overlay} />
      <View style={mCard.info}>
        <Text style={mCard.name} numberOfLines={2}>{item.place.name}</Text>
        {item.place.sub_category ? <Text style={mCard.cat} numberOfLines={1}>{item.place.sub_category}</Text> : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[fav.header, { paddingTop: safeTop }]}>
        <TouchableOpacity style={fav.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={20} color={FG} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={fav.headerTitle}>Favoriter</Text>
        <View style={fav.countBadge}>
          <Heart size={13} color={GOLD} strokeWidth={1.8} fill={GOLD} />
          <Text style={fav.countText}>{places.length}</Text>
        </View>
      </View>

      {isLoading && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(197,160,89,0.15)", alignItems: "center", justifyContent: "center" }}>
            <Heart size={18} color={GOLD} strokeWidth={1.5} />
          </View>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED }}>Laddar favoriter…</Text>
        </View>
      )}

      {!isLoading && places.length === 0 && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 40 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(197,160,89,0.10)", borderWidth: 1, borderColor: "rgba(197,160,89,0.22)", alignItems: "center", justifyContent: "center" }}>
            <Heart size={28} color={GOLD} strokeWidth={1.5} />
          </View>
          <Text style={{ fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: FG, textAlign: "center" }}>Inga favoriter ännu</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, textAlign: "center", lineHeight: 21 }}>
            Tryck på hjärtat på en plats eller ett event för att spara det här.
          </Text>
          <TouchableOpacity
            style={{ marginTop: 8, height: 46, paddingHorizontal: 24, borderRadius: 14, backgroundColor: "rgba(197,160,89,0.14)", borderWidth: 1, borderColor: "rgba(197,160,89,0.25)", alignItems: "center", justifyContent: "center" }}
            onPress={() => router.push("/(tabs)/explore" as any)}
          >
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: GOLD }}>Utforska platser</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && places.length > 0 && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={fav.grid}
        >
          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* Left column */}
            <View style={{ flex: 1, gap: 8 }}>
              {leftCol.map((item, i) => renderCard(item, `l${i}`))}
            </View>
            {/* Right column */}
            <View style={{ flex: 1, gap: 8 }}>
              {rightCol.map((item, i) => renderCard(item, `r${i}`))}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const fav = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)",
    backgroundColor: BG,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  headerTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: FG, flex: 1 },
  countBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(197,160,89,0.12)",
    borderWidth: 1, borderColor: "rgba(197,160,89,0.22)",
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  countText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: GOLD },
  grid: { padding: 20, paddingBottom: 80 },
});

const mCard = StyleSheet.create({
  wrap: { borderRadius: 20, overflow: "hidden" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.30)",
    // Bottom-heavy gradient via nested views isn't possible without linear-gradient
    // so we use a solid low-opacity overlay + stronger bottom label bg
  },
  info: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.52)",
    paddingHorizontal: 12, paddingVertical: 10,
    gap: 2,
  },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: FG, lineHeight: 18 },
  cat: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.65)" },
});
