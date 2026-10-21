/**
 * Stegen om vad man gillar: kategorierna (Vad gillar du?) och ställen man redan tycker om (Har du
 * redan favoriter?). Båda är frivilliga — man kan alltid gå vidare utan att välja något.
 */
import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Search } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { AUTH_GUTTER, AuthButton, AuthField } from "@/components/auth/AuthParts";
import { HeartButton, type BurstFn } from "@/components/LikeHeart";
import { Skeleton } from "@/components/Skeleton";
import { StepLayout } from "./StepLayout";
import { InterestGrid } from "./InterestGrid";
import { findCategory, type CategoryId } from "@/theme/categories";
import { firstImageUrl, getTierScore, type Place } from "@/hooks/usePlaces";
import { splitTowns } from "@/lib/towns";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

// ── Vad gillar du? ───────────────────────────────────────────────────────────

export function InterestsStep({
  selected, onToggle, photos, loading, onSubmit,
}: {
  selected: CategoryId[];
  onToggle: (id: CategoryId) => void;
  photos: Partial<Record<CategoryId, string>>;
  loading: boolean;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <StepLayout
      scroll
      title={t("onboarding.interests.title")}
      subtitle={t("onboarding.interests.subtitle")}
      footer={<AuthButton label={selected.length > 0 ? t("onboarding.next") : t("onboarding.skip")} onPress={onSubmit} />}
    >
      <InterestGrid selected={selected} onToggle={onToggle} photos={photos} loading={loading} gutter={AUTH_GUTTER} />
    </StepLayout>
  );
}

// ── Har du redan favoriter? ──────────────────────────────────────────────────

/** Utan sökning visas så här många förslag */
const SUGGESTED = 30;
/** Med sökning visas som mest så här många träffar */
const MATCHES = 60;

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function FavoritesStep({
  places, loading, interests, selected, onToggle, onBurst, onSubmit,
}: {
  places: Place[];
  loading: boolean;
  interests: CategoryId[];
  selected: number[];
  onToggle: (placeId: number) => void;
  onBurst: BurstFn;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const s = useThemedStyles(createStyles);
  const [query, setQuery] = useState("");
  const chosen = useMemo(() => new Set(selected), [selected]);

  // Förslagen: platser med foto, de man sagt att man gillar först, sedan företagen med högst nivå.
  // Står still medan man trycker på hjärtan (ordningen beror inte på vad man sparat).
  const suggested = useMemo(() => {
    const liked = new Set(interests);
    const rank = (p: Place) => {
      const cat = findCategory(p.category)?.id;
      return (cat && liked.has(cat) ? 1000 : 0) + getTierScore(p.business_tier) + (p.description ? 10 : 0);
    };
    return places
      .filter((p) => firstImageUrl(p.image_url))
      .sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name, "sv"))
      .slice(0, SUGGESTED);
  }, [places, interests]);

  const matches = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return null;
    return places
      .filter((p) => fold(p.name).includes(q) || fold(p.nearest_town ?? "").includes(q))
      .sort((a, b) => {
        // Namn som börjar med det man skrivit först
        const sa = fold(a.name).startsWith(q) ? 0 : 1;
        const sb = fold(b.name).startsWith(q) ? 0 : 1;
        return sa - sb || a.name.localeCompare(b.name, "sv");
      })
      .slice(0, MATCHES);
  }, [places, query]);

  const data = matches ?? suggested;
  const renderItem = useCallback(({ item }: { item: Place }) => (
    <PlaceRow place={item} saved={chosen.has(item.id)} onToggle={onToggle} onBurst={onBurst} />
  ), [chosen, onToggle, onBurst]);

  return (
    <StepLayout
      title={t("onboarding.favorites.title")}
      subtitle={t("onboarding.favorites.subtitle")}
      footer={<AuthButton label={selected.length > 0 ? t("onboarding.next") : t("onboarding.skip")} onPress={onSubmit} />}
    >
      <AuthField
        icon={Search}
        value={query}
        onChangeText={setQuery}
        placeholder={t("onboarding.favorites.search")}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      {loading && places.length === 0 ? (
        <View style={s.skeletons} pointerEvents="none">
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={s.row}>
              <Skeleton width={64} height={64} radius={14} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton width="70%" height={14} radius={6} />
                <Skeleton width="45%" height={12} radius={6} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(p) => String(p.id)}
          renderItem={renderItem}
          extraData={chosen}
          style={s.list}
          contentContainerStyle={s.listBody}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={7}
          ListEmptyComponent={<Text style={s.empty}>{t("onboarding.favorites.none")}</Text>}
        />
      )}
    </StepLayout>
  );
}

const PlaceRow = memo(function PlaceRow({
  place, saved, onToggle, onBurst,
}: {
  place: Place; saved: boolean; onToggle: (id: number) => void; onBurst: BurstFn;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const photo = firstImageUrl(place.image_url);
  const cat = findCategory(place.category);
  const town = place.nearest_town ? splitTowns(place.nearest_town)[0] : null;
  const sub = [town, cat?.label].filter(Boolean).join(" · ");
  return (
    <View style={s.row}>
      <View style={s.thumb}>
        {photo ? <ExpoImage source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} cachePolicy="memory-disk" recyclingKey={String(place.id)} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.name} numberOfLines={1}>{place.name}</Text>
        {sub ? <Text style={s.sub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <HeartButton isFav={saved} onToggle={() => onToggle(place.id)} onBurst={onBurst} size={26} outline={colors.muted} />
    </View>
  );
});

const createStyles = (c: ThemeColors) => StyleSheet.create({
  list: { flex: 1, marginHorizontal: -AUTH_GUTTER, marginTop: 4 },
  listBody: { paddingHorizontal: AUTH_GUTTER, paddingBottom: 12 },
  skeletons: { gap: 4, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 8 },
  thumb: { width: 64, height: 64, borderRadius: 14, overflow: "hidden", backgroundColor: c.fill },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 15.5, color: c.text },
  sub: { fontFamily: "Inter_400Regular", fontSize: 13.5, color: c.muted, marginTop: 3 },
  empty: { fontFamily: "Inter_400Regular", fontSize: 15, color: c.muted, paddingVertical: 24, textAlign: "center" },
});
