/**
 * Kategori och meny: vad ni är (högst tre kategorier, den första är huvudkategorin), vilken sorts
 * ställe inom kategorin, vad ni serverar eller säljer (så sökningen hittar er på "fisk", "pizza",
 * "ost" …). Sparas direkt.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Check } from "lucide-react-native";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { Chip, PortalToast, SaveIndicator, SectionHeader, type PortalToastHandle } from "@/components/business/PortalParts";
import { useBusinessPlace, usePlaceAutosave, usePortalPlace } from "@/hooks/useBusiness";
import { SUB_LABELS } from "@/lib/business";
import { TASTES } from "@/lib/search";
import { CATEGORIES, CATEGORY_DB_VALUE, SUBCATEGORIES, categoryLabel, findCategory, type CategoryId } from "@/theme/categories";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import i18n from "i18next";
import { tb } from "@/i18n/business";

const MAX_CATS = 3;
const TASTE_CATS: CategoryId[] = ["mat-dryck", "cafe-bageri", "butiker"];

const split = (v: string | null | undefined) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export default function BusinessCategories() {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { placeId } = usePortalPlace();
  const { data: place } = useBusinessPlace(placeId);
  const auto = usePlaceAutosave(placeId, 300);
  const toast = useRef<PortalToastHandle>(null);
  const [state, setState] = useState<{ cats: CategoryId[]; subs: string[]; tastes: string[] } | null>(null);

  useEffect(() => {
    if (!place || state) return;
    const cats: CategoryId[] = [];
    for (const part of split(place.categories)) {
      const id = findCategory(part)?.id;
      if (id && !cats.includes(id)) cats.push(id);
    }
    setState({ cats: cats.slice(0, MAX_CATS), subs: split(place.sub_category), tastes: place.tastes ?? [] });
  }, [place, state]);

  const save = (next: NonNullable<typeof state>) => {
    setState(next);
    const allowed = new Set(next.cats.flatMap((c) => SUBCATEGORIES[c]));
    const tastesAllowed = next.cats.some((c) => TASTE_CATS.includes(c));
    auto.queue({
      categories: next.cats.map((c) => CATEGORY_DB_VALUE[c]).join(", ") || null,
      sub_category: next.subs.filter((x) => allowed.has(x)).join(", ") || null,
      tastes: tastesAllowed ? next.tastes : [],
    });
  };

  const tasteOptions = useMemo(() => Object.keys(TASTES).map((key) => ({ key, label: i18n.t(`search.tastes.${key}` as "search.tastes.fish") })), []);

  if (!state) {
    return (
      <SettingsScreen title={tb("Kategori och meny")}>
        <Skeleton height={240} radius={18} />
        <Skeleton height={120} radius={18} />
      </SettingsScreen>
    );
  }

  const toggleCat = (id: CategoryId) => {
    if (state.cats.includes(id)) {
      save({ ...state, cats: state.cats.filter((c) => c !== id) });
    } else if (state.cats.length >= MAX_CATS) {
      toast.current?.show(tb("Välj högst tre – ta bort en först"));
    } else {
      save({ ...state, cats: [...state.cats, id] });
    }
  };
  const toggle = (list: "subs" | "tastes", key: string) => {
    const has = state[list].includes(key);
    save({ ...state, [list]: has ? state[list].filter((x) => x !== key) : [...state[list], key] });
  };

  return (
    <>
      <SettingsScreen title={tb("Kategori och meny")} right={<SaveIndicator state={auto.state} onRetry={auto.flush} />}>
        <Rise index={0}>
          <View>
            <SectionHeader title={tb("Vad är ni?")} />
            <Text style={s.lead}>{tb("Välj upp till tre. Den första blir er huvudkategori – den syns först och styr färgen på er sida.")}</Text>
            <View style={s.grid}>
              {CATEGORIES.map((cat) => {
                const i = state.cats.indexOf(cat.id);
                const on = i >= 0;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); toggleCat(cat.id); }}
                    style={({ pressed }) => [s.cat, on && { borderColor: colors.gold, backgroundColor: colors.raised }, pressed && { opacity: 0.8 }]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    <View style={[s.catIcon, { backgroundColor: cat.screen }]}>
                      <cat.icon size={19} color="#FFFFFF" strokeWidth={1.9} />
                    </View>
                    <Text style={s.catLabel} numberOfLines={2}>{categoryLabel(cat.id)}</Text>
                    {on && (
                      <View style={s.catCheck}>
                        {i === 0 ? <Text style={s.catMain}>1</Text> : <Check size={13} color={colors.onGold} strokeWidth={3} />}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Rise>

        {state.cats.map((cat, i) => (
          <Rise key={cat} index={i + 1}>
            <View>
              <SectionHeader title={tb("{{0}} – vilken sort?", { 0: categoryLabel(cat) })} />
              <View style={s.chips}>
                {SUBCATEGORIES[cat].map((sub) => (
                  <Chip key={sub} label={tb(SUB_LABELS[sub] ?? sub)} selected={state.subs.includes(sub)} onPress={() => toggle("subs", sub)} />
                ))}
              </View>
            </View>
          </Rise>
        ))}

        {state.cats.some((c) => TASTE_CATS.includes(c)) && (
          <Rise index={4}>
            <View>
              <SectionHeader title={tb("Vad serverar eller säljer ni?")} />
              <Text style={s.lead}>{tb("Då hittar gästerna er när de söker på t.ex. \"fisk\", \"husmanskost\" eller \"ost\".")}</Text>
              <View style={s.chips}>
                {tasteOptions.map((t) => (
                  <Chip key={t.key} label={t.label} selected={state.tastes.includes(t.key)} onPress={() => toggle("tastes", t.key)} />
                ))}
              </View>
            </View>
          </Rise>
        )}

        {auto.error && <Text style={s.error}>{auto.error}</Text>}
      </SettingsScreen>
      <PortalToast ref={toast} />
    </>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  lead: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, color: c.muted, paddingHorizontal: 4, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cat: {
    width: "48.4%", flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16,
    backgroundColor: c.card, borderWidth: 1.5, borderColor: c.border, minHeight: 64,
  },
  catIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  catLabel: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 13.5, lineHeight: 17, color: c.text },
  catCheck: {
    position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: 10,
    backgroundColor: c.gold, alignItems: "center", justifyContent: "center",
  },
  catMain: { fontFamily: "Inter_700Bold", fontSize: 11, color: c.onGold },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  error: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: c.danger, textAlign: "center" },
});
