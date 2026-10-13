/**
 * Favoriter — sparade platser och event.
 *
 * Header som Mitt Österlens (tillbaka-knapp + rubrik i versaler), dela-knapp till höger. Kategorin
 * väljs med samma ‹ ── NAMN ── ›-väljare som Förmåner (CategoryHeader), bara med pilarna.
 *
 * Två vyer, som man väljer själv (sparas på telefonen):
 *  - Kort: stor bild med rundade hörn, och UNDER bilden namn, kategori och kort beskrivning, med
 *    hjärtat längst till höger. Inget ligger ovanpå bilden.
 *  - Lista: kompakta rader med en liten bild.
 *
 * Ett avmarkerat hjärta tar inte bort raden direkt (man kan ångra sig) — den försvinner först
 * nästa gång sidan öppnas.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet, Image, Share, Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Heart, Square, AlignJustify } from "lucide-react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { ShareIcon } from "@/components/ShareIcon";
import { CategoryHeader } from "@/components/CategoryHeader";
import { darkColors } from "@/theme/colors";

const BG     = "#121212";
const CARD   = "#1C1C1C";
const FG     = "#F5F1E8";
const MUTED  = "rgba(245,241,232,0.55)";
const GOLD   = "#C5A059";
const RED    = "#EF4444";
const BORDER = "rgba(255,255,255,0.06)";

type FavKind = "place" | "event";
type ViewMode = "cards" | "list";
const VIEW_KEY = "favorites-view:v1";

interface FavItem {
  key: string;
  kind: FavKind;
  id: number;
  title: string;
  /** Kategorin (platser) eller "Evenemang · datum" (event) */
  category: string;
  /** Ort (platser) eller plats (event) — i listvyn */
  subtitle: string;
  description: string;
  /** Rå categories-sträng, används för filtreringen */
  categories: string | null;
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

// Sök-sidans kategorier ihopslagna till fyra grupper + Evenemang
interface FavFilter { id: string; label: string; dbValues?: string[]; isEvent?: boolean }
const FAV_FILTERS: FavFilter[] = [
  { id: "alla",      label: "Alla" },
  { id: "ata",       label: "Mat",         dbValues: ["Mat", "Mat & Dryck", "Café & Bageri", "Cafe & Bageri"] },
  { id: "sova",      label: "Boende",      dbValues: ["Hotell & B&B", "Boende"] },
  { id: "gora",      label: "Upplevelser", dbValues: ["Aktiviteter", "Sevärdheter", "Konst", "Natur", "Natur & Upplevelser"] },
  { id: "handla",    label: "Shopping",    dbValues: ["Butiker", "Hantverk & Service", "Hantverk"] },
  { id: "evenemang", label: "Evenemang",   isEvent: true },
];

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
            category: categories.split(",").map((c) => c.trim()).filter(Boolean)[0] ?? "",
            subtitle: row.places.nearest_town ?? "Österlen",
            description: row.places.short_description ?? row.places.description ?? "",
            categories: categories || null,
            imageUrl: row.places.image_url?.split(",")[0]?.trim() ?? null,
            route: `/place/${row.places.id}`,
          });
        } else if (row.events) {
          const dateLabel = row.events.date ? format(new Date(row.events.date), "d MMMM", { locale: sv }) : "";
          items.push({
            key: `e${row.events.id}`,
            kind: "event",
            id: row.events.id,
            title: row.events.title,
            category: dateLabel ? `Evenemang · ${dateLabel}` : "Evenemang",
            subtitle: dateLabel || (row.events.location ?? ""),
            description: row.events.location ?? "",
            categories: null,
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
  const [filterIndex, setFilterIndex] = useState(0);
  const [mode, setMode] = useState<ViewMode>("cards");
  // Avmarkerade hjärtan den här gången — raden ligger kvar (man kan ångra sig), borta först nästa gång
  const [toggledOff, setToggledOff] = useState<Set<string>>(new Set());
  const scrollRef = useRef<ScrollView>(null);

  // Vyn man valde senast
  useEffect(() => {
    AsyncStorage.getItem(VIEW_KEY).then((v) => { if (v === "cards" || v === "list") setMode(v); }).catch(() => {});
  }, []);
  const chooseMode = (next: ViewMode) => {
    if (next === mode) return;
    Haptics.selectionAsync().catch(() => {});
    setMode(next);
    AsyncStorage.setItem(VIEW_KEY, next).catch(() => {});
  };

  const filter = FAV_FILTERS[filterIndex];
  const visible = useMemo(() => {
    if (filter.id === "alla") return items;
    if (filter.isEvent) return items.filter((i) => i.kind === "event");
    return items.filter((i) => i.kind === "place" && matchesDbValues(i.categories, filter.dbValues ?? []));
  }, [items, filter]);

  const step = (dir: 1 | -1) => {
    const next = filterIndex + dir;
    if (next < 0 || next >= FAV_FILTERS.length) return;
    Haptics.selectionAsync().catch(() => {});
    setFilterIndex(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const handleToggleFavorite = async (item: FavItem) => {
    const wasFav = !toggledOff.has(item.key);
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
    // Synka resten av appen (t.ex. räknaren på Profil) — men inte den här listan, se överst
    queryClient.invalidateQueries({ queryKey: ["favorites"] });
  };

  const handleShare = () => {
    if (items.length === 0) return;
    const names = items.map((i) => i.title).join(", ");
    Share.share({ message: `Kolla in mina favoritplatser på Österlen: ${names} 🌾 via Österlenappen` }).catch(() => {});
  };

  const countLabel = visible.length === 1 ? "1 favorit" : `${visible.length} favoriter`;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Fast header, samma som Mitt Österlen */}
      <View style={{ paddingTop: insets.top, backgroundColor: BG }}>
        <View style={s.header}>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>FAVORITER</Text>
          {items.length > 0 && (
            <TouchableOpacity style={s.headerBtn} onPress={handleShare}>
              <ShareIcon size={20} color={FG} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading && (
        <View style={s.center}>
          <View style={s.loadingIcon}>
            <Heart size={18} color={GOLD} strokeWidth={1.5} />
          </View>
          <Text style={s.muted}>Laddar favoriter…</Text>
        </View>
      )}

      {!isLoading && items.length === 0 && (
        <View style={[s.center, { paddingHorizontal: 40 }]}>
          <View style={s.emptyIcon}>
            <Heart size={28} color={GOLD} strokeWidth={1.5} />
          </View>
          <Text style={s.emptyTitle}>Inga favoriter ännu</Text>
          <Text style={[s.muted, { textAlign: "center", lineHeight: 21 }]}>
            Tryck på hjärtat på en plats eller ett event för att spara det här.
          </Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => router.push("/(tabs)/explore" as any)}>
            <Text style={s.emptyBtnText}>Utforska platser</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && items.length > 0 && (
        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={[s.body, { paddingBottom: Math.max(insets.bottom, 16) + 32 }]}>
          <CategoryHeader index={filterIndex} labels={FAV_FILTERS.map((f) => f.label)} onStep={step} palette={darkColors} />

          {/* Antal + val av vy (kort/lista) */}
          <View style={s.toolbar}>
            <Text style={s.count}>{countLabel}</Text>
            <View style={s.toggle}>
              <Pressable style={[s.toggleBtn, mode === "cards" && s.toggleBtnOn]} onPress={() => chooseMode("cards")} hitSlop={6} accessibilityLabel="Visa som kort">
                <Square size={16} color={mode === "cards" ? FG : MUTED} strokeWidth={2.2} />
              </Pressable>
              <Pressable style={[s.toggleBtn, mode === "list" && s.toggleBtnOn]} onPress={() => chooseMode("list")} hitSlop={6} accessibilityLabel="Visa som lista">
                <AlignJustify size={16} color={mode === "list" ? FG : MUTED} strokeWidth={2.2} />
              </Pressable>
            </View>
          </View>

          {visible.length === 0 && (
            <Text style={[s.muted, s.noneInFilter]}>Inga favoriter i {filter.label.toLowerCase()} än.</Text>
          )}

          <View style={mode === "cards" ? s.cards : s.rows}>
            {visible.map((item) =>
              mode === "cards" ? (
                <FavoriteCard
                  key={item.key}
                  item={item}
                  isFav={!toggledOff.has(item.key)}
                  onPress={() => router.push(item.route as any)}
                  onToggleFavorite={() => handleToggleFavorite(item)}
                />
              ) : (
                <FavoriteRow
                  key={item.key}
                  item={item}
                  isFav={!toggledOff.has(item.key)}
                  onPress={() => router.push(item.route as any)}
                  onToggleFavorite={() => handleToggleFavorite(item)}
                />
              )
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

/** Hjärtat: studsar till när man trycker */
function HeartButton({ isFav, onToggle, size = 22 }: { isFav: boolean; onToggle: () => void; size?: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.3, useNativeDriver: true, speed: 60, bounciness: 12 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }),
    ]).start();
    onToggle();
  };
  return (
    <TouchableOpacity style={s.heartBtn} activeOpacity={0.7} hitSlop={10} onPress={press} accessibilityLabel={isFav ? "Ta bort från favoriter" : "Spara som favorit"}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Heart size={size} color={RED} fill={isFav ? RED : "transparent"} strokeWidth={2} />
      </Animated.View>
    </TouchableOpacity>
  );
}

/** Kortvyn: stor bild, och under den namn, kategori och kort beskrivning, hjärtat till höger */
function FavoriteCard({ item, isFav, onPress, onToggleFavorite }: {
  item: FavItem; isFav: boolean; onPress: () => void; onToggleFavorite: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
      <View style={s.cardImage}>
        {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      </View>
      <View style={s.cardInfo}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
          {!!item.category && <Text style={s.cardCategory} numberOfLines={1}>{item.category}</Text>}
          {!!item.description && <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>}
        </View>
        <HeartButton isFav={isFav} onToggle={onToggleFavorite} />
      </View>
    </TouchableOpacity>
  );
}

/** Listvyn: kompakt rad med liten bild */
function FavoriteRow({ item, isFav, onPress, onToggleFavorite }: {
  item: FavItem; isFav: boolean; onPress: () => void; onToggleFavorite: () => void;
}) {
  return (
    <TouchableOpacity style={s.row} activeOpacity={0.9} onPress={onPress}>
      <View style={s.thumb}>
        {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{item.title}</Text>
        {!!item.category && <Text style={s.rowCategory} numberOfLines={1}>{item.category}</Text>}
        {!!item.description && <Text style={s.rowDesc} numberOfLines={1}>{item.description}</Text>}
      </View>
      <HeartButton isFav={isFav} onToggle={onToggleFavorite} size={20} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  headerBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, color: FG },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  muted: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED },
  loadingIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(197,160,89,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(197,160,89,0.10)",
    borderWidth: 1, borderColor: "rgba(197,160,89,0.22)", alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontFamily: "Montserrat_700Bold", fontSize: 20, color: FG, textAlign: "center" },
  emptyBtn: {
    marginTop: 8, height: 46, paddingHorizontal: 24, borderRadius: 14,
    backgroundColor: "rgba(197,160,89,0.14)", borderWidth: 1, borderColor: "rgba(197,160,89,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  emptyBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: GOLD },

  body: { paddingHorizontal: 16, paddingTop: 12 },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 14 },
  count: { fontFamily: "Montserrat_700Bold", fontSize: 16, color: FG },
  toggle: { flexDirection: "row", padding: 3, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)" },
  toggleBtn: { width: 38, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  toggleBtnOn: { backgroundColor: "rgba(255,255,255,0.14)" },
  noneInFilter: { textAlign: "center", marginTop: 30 },

  // Kortvyn
  cards: { gap: 28 },
  cardImage: { width: "100%", aspectRatio: 1.55, borderRadius: 20, overflow: "hidden", backgroundColor: "#2A2A2A" },
  cardInfo: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 12, paddingHorizontal: 2 },
  cardTitle: { fontFamily: "Montserrat_700Bold", fontSize: 19, letterSpacing: -0.2, color: FG },
  cardCategory: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: GOLD, marginTop: 3 },
  cardDesc: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, color: MUTED, marginTop: 4 },

  // Listvyn
  rows: { gap: 10 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 10,
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER,
  },
  thumb: { width: 64, height: 64, borderRadius: 12, overflow: "hidden", backgroundColor: "#2A2A2A" },
  rowTitle: { fontFamily: "Montserrat_700Bold", fontSize: 15.5, color: FG },
  rowCategory: { fontFamily: "Inter_600SemiBold", fontSize: 12.5, color: GOLD },
  rowDesc: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED },

  heartBtn: { paddingTop: 2, paddingHorizontal: 4 },
});
