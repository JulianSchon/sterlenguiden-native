/**
 * Favoriter – enhetlig lista över sparade platser och event
 * Spec: native-subpages-spec.md §2 (omdesignad 2026-09-15)
 */
import { useMemo, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Image, Share, Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Heart } from "lucide-react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect as SvgRect } from "react-native-svg";
import { ShareIcon } from "@/components/ShareIcon";
import { CategoryChips } from "@/components/CategoryChips";

const BG        = "#121212";
const CARD      = "#1C1C1C";
const FG        = "#F5F1E8";
const MUTED     = "rgba(245,241,232,0.55)";
const GOLD      = "#C5A059";
const RED       = "#EF4444";
const BORDER    = "rgba(255,255,255,0.06)";

type FavKind = "place" | "event";

interface FavItem {
  key: string;
  kind: FavKind;
  id: number;
  title: string;
  subtitle: string;        // ort (plats) eller datum (event)
  description: string;
  categoryTags: string[];  // t.ex. ["Golf", "Aktivitet", "Natur"]
  category: string | null; // rå categories-sträng, används för pill-filtrering
  imageUrl: string | null;
  route: string;
}

// Samma matchningslogik som Sök-sidans kategori-chips (matchesDbValues)
function matchesDbValues(categories: string | null, dbValues: string[]): boolean {
  if (!categories) return false;
  const parts = categories.split(",").map((s) => s.trim().toLowerCase());
  return dbValues.some((target) =>
    parts.some(
      (p) =>
        p === target.toLowerCase() ||
        p.includes(target.toLowerCase()) ||
        target.toLowerCase().includes(p),
    ),
  );
}

// Favoriter-sidans grupperade filter — slår ihop Sök-sidans kategorier till fyra grupper + Event
interface FavFilter { id: string; label: string; dbValues?: string[]; isEvent?: boolean }
const FAV_FILTERS: FavFilter[] = [
  { id: "alla" },
  { id: "ata",       label: "Mat",         dbValues: ["Mat", "Mat & Dryck", "Café & Bageri", "Cafe & Bageri"] },
  { id: "sova",      label: "Boende",      dbValues: ["Hotell & B&B", "Boende"] },
  { id: "gora",      label: "Upplevelser", dbValues: ["Aktiviteter", "Sevärdheter", "Konst", "Natur", "Natur & Upplevelser"] },
  { id: "handla",    label: "Shopping",    dbValues: ["Butiker", "Hantverk & Service", "Hantverk"] },
  { id: "evenemang", label: "Evenemang", isEvent: true },
].map((f) => ({ ...f, label: f.label ?? "Alla" }));

function useFavoritesDetailed() {
  return useQuery<FavItem[]>({
    queryKey: ["favorites-detail"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("favorites")
        .select(`
          id, created_at, place_id, event_id,
          places(id, name, image_url, nearest_town, categories, short_description, description),
          events(id, title, image_url, date, location)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const items: FavItem[] = [];
      for (const row of (data ?? []) as any[]) {
        if (row.places) {
          const categories: string = row.places.categories ?? "";
          items.push({
            key: `p${row.places.id}`,
            kind: "place",
            id: row.places.id,
            title: row.places.name,
            subtitle: row.places.nearest_town ?? "Österlen",
            description: row.places.short_description ?? row.places.description ?? "",
            categoryTags: categories.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 3),
            category: categories || null,
            imageUrl: row.places.image_url?.split(",")[0]?.trim() ?? null,
            route: `/place/${row.places.id}`,
          });
        } else if (row.events) {
          const dateLabel = row.events.date
            ? format(new Date(row.events.date), "d MMMM", { locale: sv })
            : row.events.location ?? "";
          items.push({
            key: `e${row.events.id}`,
            kind: "event",
            id: row.events.id,
            title: row.events.title,
            subtitle: dateLabel,
            description: row.events.location ?? "",
            categoryTags: [],
            category: null,
            imageUrl: row.events.image_url?.split(",")[0]?.trim() ?? null,
            route: `/event/${row.events.id}`,
          });
        }
      }
      return items;
    },
  });
}

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useFavoritesDetailed();
  const [activeFilter, setActiveFilter] = useState("alla");
  // Av/på-togglade kort denna vy — kortet ligger kvar i listan oavsett,
  // bara hjärtfärgen ändras. Riktigt borta blir det först när man navigerar
  // bort och tillbaka till Favoriter-sidan (då körs queryn på nytt).
  const [toggledOff, setToggledOff] = useState<Set<string>>(new Set());
  const safeTop = Math.max(insets.top, 44);

  const filter = FAV_FILTERS.find((f) => f.id === activeFilter) ?? FAV_FILTERS[0];
  const visible = useMemo(() => {
    if (filter.id === "alla") return items;
    if (filter.isEvent) return items.filter((i) => i.kind === "event");
    return items.filter((i) => i.kind === "place" && matchesDbValues(i.category, filter.dbValues ?? []));
  }, [items, filter]);

  const handleToggleFavorite = async (item: FavItem) => {
    const wasFav = !toggledOff.has(item.key);
    // Optimistisk UI-uppdatering direkt
    setToggledOff((prev) => {
      const next = new Set(prev);
      if (wasFav) next.add(item.key); else next.delete(item.key);
      return next;
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const column = item.kind === "place" ? "place_id" : "event_id";

    if (wasFav) {
      await supabase.from("favorites").delete().eq("user_id", user.id).eq(column, item.id);
    } else {
      await supabase.from("favorites").insert({
        user_id: user.id,
        place_id: item.kind === "place" ? item.id : null,
        event_id: item.kind === "event" ? item.id : null,
        service_point_id: null,
      });
    }
    // Synka andra delar av appen (t.ex. favorit-räknaren på profilsidan) —
    // men INTE denna lista, den uppdateras bara vid nästa besök på sidan.
    queryClient.invalidateQueries({ queryKey: ["favorites"] });
  };

  const handleShare = () => {
    if (items.length === 0) return;
    const names = items.map((i) => i.title).join(", ");
    Share.share({
      message: `Kolla in mina favoritplatser på Österlen: ${names} 🌾 via Österlenappen`,
    }).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[fav.header, { paddingTop: safeTop }]}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgGrad id="favHeaderFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor={BG} stopOpacity={1}    />
              <Stop offset="55%"  stopColor={BG} stopOpacity={0.98} />
              <Stop offset="100%" stopColor={BG} stopOpacity={0.78} />
            </SvgGrad>
          </Defs>
          <SvgRect width="100%" height="100%" fill="url(#favHeaderFade)" />
        </Svg>
        <View style={fav.headerRow}>
          <TouchableOpacity style={fav.iconBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={fav.headerTitle}>Favoriter</Text>
          {items.length > 0 && (
            <TouchableOpacity style={fav.iconBtn} onPress={handleShare}>
              <ShareIcon size={20} color={FG} strokeWidth={2} />
            </TouchableOpacity>
          )}
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

      {!isLoading && items.length === 0 && (
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

      {!isLoading && items.length > 0 && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={fav.list}>
          <View style={{ marginHorizontal: -20, marginBottom: 4 }}>
            <CategoryChips chips={FAV_FILTERS} activeId={activeFilter} onChange={setActiveFilter} />
          </View>

          {visible.map((item) => (
            <FavoriteRow
              key={item.key}
              item={item}
              isFav={!toggledOff.has(item.key)}
              onPress={() => router.push(item.route as any)}
              onToggleFavorite={() => handleToggleFavorite(item)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function FavoriteRow({ item, isFav, onPress, onToggleFavorite }: {
  item: FavItem;
  isFav: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  const heartScale = useRef(new Animated.Value(1)).current;

  const handleHeartPress = () => {
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.35, useNativeDriver: true, speed: 60, bounciness: 14 }),
      Animated.spring(heartScale, { toValue: 1,    useNativeDriver: true, speed: 40, bounciness: 8  }),
    ]).start();
    onToggleFavorite();
  };

  return (
    <TouchableOpacity style={fav.row} activeOpacity={0.9} onPress={onPress}>
      <View style={fav.thumbWrap}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#2A2A2A" }]} />
        )}
      </View>

      <View style={fav.content}>
        <Text style={fav.rowTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={fav.rowSub} numberOfLines={1}>{item.subtitle}</Text>
        {!!item.description && (
          <Text style={fav.rowDesc} numberOfLines={2}>{item.description}</Text>
        )}
        {item.categoryTags.length > 0 && (
          <View style={fav.pillsRow}>
            {item.categoryTags.map((tag) => (
              <View key={tag} style={fav.categoryPill}>
                <Text style={fav.categoryPillText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <TouchableOpacity
        style={fav.heartBtn}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        onPress={handleHeartPress}
      >
        <Animated.View style={{ transform: [{ scale: heartScale }] }}>
          <Heart size={20} color={RED} fill={isFav ? RED : "transparent"} strokeWidth={2} />
        </Animated.View>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const fav = StyleSheet.create({
  // Header-bar: fast 72px innehållshöjd + safe-area ovanpå, gradient-fade bakgrund
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  headerRow: {
    flexDirection: "row", alignItems: "center",
    height: 72,
    paddingHorizontal: 16,
    gap: 12,
  },
  iconBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.40)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  headerTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: FG, flex: 1 },

  list: { padding: 20, paddingBottom: 80, gap: 12 },
  // Kortet: overflow-hidden + borderRadius på YTTERRAMEN gör att bilden
  // automatiskt klipps rundad i vänsterkanten (top/bottom-left) och förblir
  // helt rak i höger — ingen egen radius behövs på bilden.
  row: {
    flexDirection: "row",
    backgroundColor: CARD,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1, borderColor: BORDER,
    minHeight: 112,
  },
  thumbWrap: {
    width: 108,
    backgroundColor: "#2A2A2A",
  },
  content: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 36, // lämnar plats åt hjärtat i hörnet
    gap: 3,
    justifyContent: "center",
  },
  rowTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 16, color: FG },
  rowSub:   { fontFamily: "Inter_400Regular", fontSize: 12, color: GOLD },
  rowDesc:  { fontFamily: "Inter_400Regular", fontSize: 11.5, color: MUTED, lineHeight: 16, marginTop: 1 },
  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 5 },
  categoryPill: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 7,
  },
  categoryPillText: { fontFamily: "Inter_500Medium", fontSize: 10, color: MUTED },
  heartBtn: {
    position: "absolute", top: 10, right: 10,
  },
});
