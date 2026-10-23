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
import Reanimated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Heart, Square, AlignJustify } from "lucide-react-native";
import { Skeleton } from "@/components/Skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { supabase } from "@/integrations/supabase/client";
import { ShareIcon } from "@/components/ShareIcon";
import { CategoryHeader } from "@/components/CategoryHeader";
import { darkColors } from "@/theme/colors";
import { pushOnce } from "@/lib/navigateOnce";
import { openEvent } from "@/lib/eventSheet";
import { DateBox } from "@/components/events/EventCards";
import { HeartButton, LikeBurst, useLikeBurst, type BurstFn } from "@/components/LikeHeart";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { findCategory } from "@/theme/categories";

const BG     = "#121212";
const CARD   = "#1C1C1C";
const FG     = "#F5F1E8";
const MUTED  = "rgba(245,241,232,0.55)";
const GOLD   = "#C5A059";
const BORDER = "rgba(255,255,255,0.06)";

type FavKind = "place" | "event";
type ViewMode = "cards" | "list";
const VIEW_KEY = "favorites-view:v1";

interface FavItem {
  key: string;
  kind: FavKind;
  id: number;
  title: string;
  /** Kategorin (platser) eller "Evenemang" (event — datumet står i rutan på bilden) */
  category: string;
  /** Ort (platser) eller plats (event) — i listvyn */
  subtitle: string;
  description: string;
  /** Rå categories-sträng, används för filtreringen */
  categories: string | null;
  imageUrl: string | null;
  route: string;
  /** Event: datumet, som visas i rutan uppe i bildens hörn */
  date?: { date: string | null; end_date: string | null };
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
interface FavFilter { id: string; readonly label: string; dbValues?: string[]; isEvent?: boolean }
const favFilter = (id: string, key: string, rest: Omit<FavFilter, "id" | "label"> = {}): FavFilter =>
  ({ id, ...rest, get label() { return i18n.t(`favoritesPage.filters.${key}` as "favoritesPage.filters.all"); } });
const FAV_FILTERS: FavFilter[] = [
  favFilter("alla", "all"),
  favFilter("ata", "eat", { dbValues: ["Mat", "Mat & Dryck", "Café & Bageri", "Cafe & Bageri"] }),
  favFilter("sova", "sleep", { dbValues: ["Hotell & B&B", "Boende"] }),
  favFilter("gora", "do", { dbValues: ["Aktiviteter", "Sevärdheter", "Konst", "Natur", "Natur & Upplevelser"] }),
  favFilter("handla", "shop", { dbValues: ["Butiker", "Hantverk & Service", "Hantverk"] }),
  favFilter("evenemang", "events", { isEvent: true }),
];

/** Kategorin som visas på kortet, på appens språk (category är databasens värde) */
const shownCategory = (item: FavItem) =>
  item.kind === "event" ? i18n.t("favoritesPage.event") : findCategory(item.category)?.label ?? item.category;

function useFavoritesDetailed() {
  return useQuery<FavItem[]>({
    // Under "favorites": när ett hjärta trycks någon annanstans (platssidan, Hem, Kalender …) och
    // de säger till om ["favorites"] hämtas den här listan också på nytt
    queryKey: ["favorites", "detail"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("favorites")
        .select(`
          id, created_at, place_id, event_id,
          places(id, name, image_url, nearest_town, categories, short_description, description),
          events(id, title, image_url, date, end_date, location)
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
            route: `/place/${row.places.id}?from=lists`,
          });
        } else if (row.events) {
          items.push({
            key: `e${row.events.id}`,
            kind: "event",
            id: row.events.id,
            title: row.events.title,
            category: "",
            subtitle: row.events.location ?? "",
            description: row.events.location ?? "",
            categories: null,
            imageUrl: row.events.image_url?.split(",")[0]?.trim() ?? null,
            route: "",
            date: { date: row.events.date, end_date: row.events.end_date },
          });
        }
      }
      return items;
    },
  });
}

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  useTranslation(); // ritas om när språket byts
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
  const { burst, show: showBurst } = useLikeBurst();

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
  // ifyllt hjärta) nästa gång sidan öppnas medan den hämtas på nytt. Resten av appen (Hem, Profil,
  // troféerna …) får veta om ändringarna först nu, när tillbaka-glidningen är klar — att uppdatera
  // allt det vid varje hjärttryck gav ett hack mitt i hjärtanimationen.
  const favoritesChanged = useRef(false);
  useEffect(() => () => {
    if (favoritesChanged.current) {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["favorites"] }), 450);
    }
    if (toggledRef.current.size === 0) return;
    queryClient.setQueryData<FavItem[]>(["favorites", "detail"], (old) => old?.filter((i) => !toggledRef.current.has(i.key)));
    queryClient.invalidateQueries({ queryKey: ["favorites", "detail"], refetchType: "none" });
  }, [queryClient]);

  // Platser är sidor, evenemang öppnas i panelen (med samma hjärta som kortet här)
  const handleToggleRef = useRef<(item: FavItem) => void>(() => {});
  const openItem = useCallback((item: FavItem) => {
    if (item.kind === "event") {
      openEvent(item.id, {
        saved: !toggledRef.current.has(item.key),
        onToggleSave: () => handleToggleRef.current(item),
      });
      return;
    }
    pushOnce(router, item.route);
  }, [router]);

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
      });
    }
    // Resten av appen synkas när man lämnar sidan, se överst
    favoritesChanged.current = true;
  }, []);
  handleToggleRef.current = handleToggleFavorite;

  const handleShare = () => {
    if (items.length === 0) return;
    const names = items.map((i) => i.title).join(", ");
    Share.share({ message: i18n.t("favoritesPage.shareMessage", { names }) }).catch(() => {});
  };

  const countLabel = visible.length === 1 ? i18n.t("favoritesPage.countOne") : i18n.t("favoritesPage.countOther", { count: visible.length });

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Fast header, samma som Mitt Österlen */}
      <View style={{ paddingTop: insets.top, backgroundColor: BG }}>
        <View style={s.header}>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.back()} accessibilityLabel={i18n.t("favoritesPage.back")}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{i18n.t("favoritesPage.title")}</Text>
          {items.length > 0 && (
            <TouchableOpacity style={s.headerBtn} onPress={handleShare} accessibilityLabel={i18n.t("favoritesPage.share")}>
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
          <Text style={s.emptyTitle}>{i18n.t("favoritesPage.emptyTitle")}</Text>
          <Text style={[s.muted, { textAlign: "center", lineHeight: 21 }]}>
            {i18n.t("favoritesPage.emptyText")}
          </Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => router.push("/(tabs)/explore")}>
            <Text style={s.emptyBtnText}>{i18n.t("favoritesPage.explore")}</Text>
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
              <Pressable style={[s.toggleBtn, mode === "cards" && s.toggleBtnOn]} onPress={() => chooseMode("cards")} hitSlop={6} accessibilityLabel={i18n.t("favoritesPage.asCards")}>
                <Square size={16} color={mode === "cards" ? FG : MUTED} strokeWidth={2.2} />
              </Pressable>
              <Pressable style={[s.toggleBtn, mode === "list" && s.toggleBtnOn]} onPress={() => chooseMode("list")} hitSlop={6} accessibilityLabel={i18n.t("favoritesPage.asList")}>
                <AlignJustify size={16} color={mode === "list" ? FG : MUTED} strokeWidth={2.2} />
              </Pressable>
            </View>
          </View>

          {visible.length === 0 && (
            <Text style={[s.muted, s.noneInFilter]}>{i18n.t("favoritesPage.noneInFilter", { filter: i18n.language === "de" ? filter.label : filter.label.toLowerCase() })}</Text>
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
      <LikeBurst burst={burst} />
    </View>
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
        {item.date && <DateBox event={item.date} style={s.cardDate} />}
      </View>
      <View style={s.cardInfo}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
          {!!shownCategory(item) && <Text style={s.cardCategory} numberOfLines={1}>{shownCategory(item)}</Text>}
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
        {item.date && <DateBox event={item.date} small style={s.thumbDate} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{item.title}</Text>
        {!!shownCategory(item) && <Text style={s.rowCategory} numberOfLines={1}>{shownCategory(item)}</Text>}
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
  // Eventets datumruta i bildens hörn, samma som på Kalender
  cardDate: { position: "absolute", top: 12, right: 12 },
  thumbDate: { position: "absolute", top: 4, left: 4 },
  rows: { gap: 10 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 10,
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER,
  },
  thumb: { width: 64, height: 64, borderRadius: 12, overflow: "hidden", backgroundColor: "#2A2A2A" },
  rowTitle: { fontFamily: "Montserrat_700Bold", fontSize: 15.5, color: FG },
  rowCategory: { fontFamily: "Inter_600SemiBold", fontSize: 12.5, color: GOLD },
  rowDesc: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED },

});
