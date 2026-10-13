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
 *
 * Prestanda: korten är memo — ett hjärta ritar bara om sitt eget kort. Gilla-animationens ring och
 * prickar finns EN gång för hela sidan (LikeBurst) och flyttas till hjärtat man trycker på; med
 * en egen uppsättning per kort blev det hundratals animerade delar, vilket gjorde bytet mellan
 * kort och lista segt och fick gillningen att hacka.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet, Image, Share,
} from "react-native";
import Reanimated, {
  Easing, FadeInDown, interpolate, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Heart, Square, AlignJustify } from "lucide-react-native";
import { Skeleton } from "@/components/Skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { ShareIcon } from "@/components/ShareIcon";
import { CategoryHeader } from "@/components/CategoryHeader";
import { darkColors } from "@/theme/colors";
import { pushOnce } from "@/lib/navigateOnce";

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
  const toggledRef = useRef(toggledOff);
  toggledRef.current = toggledOff;
  const scrollRef = useRef<ScrollView>(null);

  // Gilla-animationens ring och prickar — en uppsättning för hela sidan
  const burst = useSharedValue(0);
  const burstX = useSharedValue(0);
  const burstY = useSharedValue(0);
  const burstSize = useSharedValue(28);
  const showBurst = useCallback((x: number, y: number, size: number) => {
    burstX.value = x;
    burstY.value = y;
    burstSize.value = size;
    burst.value = 0;
    burst.value = withTiming(1, { duration: 560, easing: Easing.out(Easing.cubic) });
  }, [burst, burstX, burstY, burstSize]);

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

  // När man lämnar sidan försvinner de avmarkerade ur den sparade listan, så de inte syns (med
  // ifyllt hjärta) nästa gång sidan öppnas medan den hämtas på nytt
  useEffect(() => () => {
    if (toggledRef.current.size === 0) return;
    queryClient.setQueryData<FavItem[]>(["favorites-detail"], (old) => old?.filter((i) => !toggledRef.current.has(i.key)));
    queryClient.invalidateQueries({ queryKey: ["favorites-detail"], refetchType: "none" });
  }, [queryClient]);

  const openItem = useCallback((item: FavItem) => pushOnce(router, item.route), [router]);

  const handleToggleFavorite = useCallback(async (item: FavItem) => {
    const wasFav = !toggledRef.current.has(item.key);
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
  }, [queryClient]);

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

      {/* Sidan i grått medan favoriterna laddas, i den vy (kort/lista) man valt */}
      {isLoading && (
        <View style={s.body} pointerEvents="none">
          <Skeleton tone="dark" width={170} height={16} radius={6} style={{ alignSelf: "center", marginVertical: 10 }} />
          <View style={s.toolbar}>
            <Skeleton tone="dark" width={90} height={14} radius={5} />
            <Skeleton tone="dark" width={76} height={34} radius={17} />
          </View>
          {mode === "cards" ? (
            <View style={s.cards}>
              {[0, 1].map((i) => (
                <View key={i}>
                  <Skeleton tone="dark" width="100%" radius={20} style={{ aspectRatio: 1.55 }} />
                  <View style={{ gap: 8, marginTop: 14, paddingHorizontal: 2 }}>
                    <Skeleton tone="dark" width="60%" height={18} radius={6} />
                    <Skeleton tone="dark" width="30%" height={12} radius={5} />
                    <Skeleton tone="dark" width="85%" height={12} radius={5} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={s.rows}>
              {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={s.row}>
                  <Skeleton tone="dark" width={64} height={64} radius={12} />
                  <View style={{ flex: 1, gap: 7 }}>
                    <Skeleton tone="dark" width="65%" height={15} radius={5} />
                    <Skeleton tone="dark" width="30%" height={11} radius={4} />
                    <Skeleton tone="dark" width="80%" height={11} radius={4} />
                  </View>
                </View>
              ))}
            </View>
          )}
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
            {visible.map((item, index) =>
              mode === "cards" ? (
                <FavoriteCard key={item.key} index={index} item={item} isFav={!toggledOff.has(item.key)} onOpen={openItem} onToggle={handleToggleFavorite} onBurst={showBurst} />
              ) : (
                <FavoriteRow key={item.key} index={index} item={item} isFav={!toggledOff.has(item.key)} onOpen={openItem} onToggle={handleToggleFavorite} onBurst={showBurst} />
              )
            )}
          </View>
        </ScrollView>
      )}
      <LikeBurst burst={burst} x={burstX} y={burstY} size={burstSize} />
    </View>
  );
}

type BurstFn = (x: number, y: number, size: number) => void;

/**
 * Hjärtat, som en gilla-knapp i de stora apparna: gillar man trycks hjärtat ihop, poppar upp större
 * och fjädrar tillbaka, och sidans ring och prickar (LikeBurst) sprutar ut runt det — med en
 * vibration. Tar man bort gillningen krymper det bara lite och studsar tillbaka.
 */
function HeartButton({ isFav, onToggle, onBurst, size = 28 }: { isFav: boolean; onToggle: () => void; onBurst: BurstFn; size?: number }) {
  const scale = useSharedValue(1);
  const box = useRef<View>(null);
  const press = () => {
    if (!isFav) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      scale.value = withSequence(
        withTiming(0.6, { duration: 80, easing: Easing.in(Easing.quad) }),
        withTiming(1.35, { duration: 150, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 9, stiffness: 260 }),
      );
      box.current?.measureInWindow((x, y, w, h) => onBurst(x + w / 2, y + h / 2, size));
    } else {
      Haptics.selectionAsync().catch(() => {});
      scale.value = withSequence(withTiming(0.75, { duration: 90 }), withSpring(1, { damping: 12, stiffness: 260 }));
    }
    onToggle();
  };
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <TouchableOpacity style={s.heartBtn} activeOpacity={0.8} hitSlop={10} onPress={press} accessibilityLabel={isFav ? "Ta bort från favoriter" : "Spara som favorit"}>
      <View ref={box} collapsable={false}>
        <Reanimated.View style={heartStyle}>
          <Heart size={size} color={RED} fill={isFav ? RED : "transparent"} strokeWidth={2} />
        </Reanimated.View>
      </View>
    </TouchableOpacity>
  );
}

const PARTICLES = 8;
const PARTICLE_COLORS = [RED, GOLD];

/** Ring och prickar runt hjärtat man just gillade — en uppsättning för hela sidan, flyttas dit */
function LikeBurst({ burst, x, y, size }: { burst: SharedValue<number>; x: SharedValue<number>; y: SharedValue<number>; size: SharedValue<number> }) {
  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(burst.value, [0, 0.15, 1], [0, 0.55, 0]),
    width: size.value,
    height: size.value,
    borderRadius: size.value / 2,
    transform: [
      { translateX: x.value - size.value / 2 },
      { translateY: y.value - size.value / 2 },
      { scale: interpolate(burst.value, [0, 1], [0.4, 1.9]) },
    ],
  }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Reanimated.View style={[s.heartRing, ringStyle]} />
      {Array.from({ length: PARTICLES }, (_, i) => (
        <HeartParticle key={i} index={i} burst={burst} x={x} y={y} size={size} />
      ))}
    </View>
  );
}

function HeartParticle({ index, burst, x, y, size }: {
  index: number; burst: SharedValue<number>; x: SharedValue<number>; y: SharedValue<number>; size: SharedValue<number>;
}) {
  const angle = (index / PARTICLES) * Math.PI * 2 - Math.PI / 2;
  const dot = index % 2 === 0 ? 6 : 4.5;
  const style = useAnimatedStyle(() => {
    const r = interpolate(burst.value, [0, 1], [size.value * 0.35, size.value * 1.15]);
    return {
      opacity: interpolate(burst.value, [0, 0.1, 0.75, 1], [0, 1, 0.8, 0]),
      transform: [
        { translateX: x.value - dot / 2 + Math.cos(angle) * r },
        { translateY: y.value - dot / 2 + Math.sin(angle) * r },
        { scale: interpolate(burst.value, [0, 1], [1, 0.3]) },
      ],
    };
  });
  return (
    <Reanimated.View style={[{ position: "absolute", left: 0, top: 0, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: PARTICLE_COLORS[index % 2] }, style]} />
  );
}

/** Snabb inglidning för de första korten/raderna, kort efter varandra (resten ligger utanför skärmen) */
const enterAt = (index: number) => (index < 8 ? FadeInDown.delay(index * 45).duration(300) : undefined);

interface ItemProps {
  /** Läget i listan — de första glider in efter varandra när sidan, kategorin eller vyn byts */
  index: number;
  item: FavItem;
  isFav: boolean;
  onOpen: (item: FavItem) => void;
  onToggle: (item: FavItem) => void;
  onBurst: BurstFn;
}

/** Kortvyn: stor bild, och under den namn, kategori och kort beskrivning, hjärtat till höger */
const FavoriteCard = memo(function FavoriteCard({ index, item, isFav, onOpen, onToggle, onBurst }: ItemProps) {
  return (
    <Reanimated.View entering={enterAt(index)}>
    <TouchableOpacity activeOpacity={0.9} onPress={() => onOpen(item)}>
      <View style={s.cardImage}>
        {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      </View>
      <View style={s.cardInfo}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
          {!!item.category && <Text style={s.cardCategory} numberOfLines={1}>{item.category}</Text>}
          {!!item.description && <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>}
        </View>
        <HeartButton isFav={isFav} onToggle={() => onToggle(item)} onBurst={onBurst} />
      </View>
    </TouchableOpacity>
    </Reanimated.View>
  );
});

/** Listvyn: kompakt rad med liten bild */
const FavoriteRow = memo(function FavoriteRow({ index, item, isFav, onOpen, onToggle, onBurst }: ItemProps) {
  return (
    <Reanimated.View entering={enterAt(index)}>
    <TouchableOpacity style={s.row} activeOpacity={0.9} onPress={() => onOpen(item)}>
      <View style={s.thumb}>
        {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{item.title}</Text>
        {!!item.category && <Text style={s.rowCategory} numberOfLines={1}>{item.category}</Text>}
        {!!item.description && <Text style={s.rowDesc} numberOfLines={1}>{item.description}</Text>}
      </View>
      <HeartButton isFav={isFav} onToggle={() => onToggle(item)} onBurst={onBurst} size={24} />
    </TouchableOpacity>
    </Reanimated.View>
  );
});

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
  heartRing: { position: "absolute", left: 0, top: 0, borderWidth: 2, borderColor: RED },
});
