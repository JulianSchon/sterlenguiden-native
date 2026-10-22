/**
 * Evenemang: kommande (närmast först) och tidigare. Tryck för att ändra, göra ett likadant eller
 * ta bort — för återkommande frågar appen om det gäller bara det tillfället eller alla kommande.
 */
import { useMemo, useRef, useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { CalendarDays, Repeat } from "lucide-react-native";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { GoldButton } from "@/components/auth/AuthParts";
import { DateBox } from "@/components/events/EventCards";
import { PortalSegmented, PortalToast, type PortalToastHandle } from "@/components/business/PortalParts";
import { useEventActions, usePlaceEvents, usePortalPlace, type PlaceEvent } from "@/hooks/useBusiness";
import { businessError } from "@/lib/business";
import { dayKey, eventWhen, lastDay } from "@/lib/events";
import { pushOnce } from "@/lib/navigateOnce";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export default function BusinessEvents() {
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { placeId } = usePortalPlace();
  const { data: events } = usePlaceEvents(placeId);
  const actions = useEventActions(placeId);
  const toast = useRef<PortalToastHandle>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const today = dayKey(new Date());
  const { upcoming, past } = useMemo(() => {
    const all = events ?? [];
    return {
      upcoming: all.filter((e) => (lastDay(e) ?? "") >= today),
      past: all.filter((e) => (lastDay(e) ?? "") < today).reverse().slice(0, 30),
    };
  }, [events, today]);
  const list = tab === "upcoming" ? upcoming : past;

  const remove = (e: PlaceEvent, scope: "one" | "series") => {
    actions.remove(e.id, scope)
      .then((n) => toast.current?.show(n > 1 ? `${n} tillfällen borttagna` : "Borttaget"))
      .catch((err) => toast.current?.show(businessError(err)));
  };
  const askRemove = (e: PlaceEvent) => {
    if (e.series_id) {
      Alert.alert("Ta bort vilka?", "Evenemanget återkommer.", [
        { text: "Avbryt", style: "cancel" },
        { text: "Bara det här", style: "destructive", onPress: () => remove(e, "one") },
        { text: "Alla kommande", style: "destructive", onPress: () => remove(e, "series") },
      ]);
    } else {
      Alert.alert("Ta bort evenemanget?", "Det försvinner ur Kalendern direkt.", [
        { text: "Avbryt", style: "cancel" },
        { text: "Ta bort", style: "destructive", onPress: () => remove(e, "one") },
      ]);
    }
  };

  const menu = (e: PlaceEvent) => {
    const items: { label: string; destructive?: boolean; onPress: () => void }[] = [];
    if (tab === "upcoming") items.push({ label: "Ändra", onPress: () => pushOnce(router, `/business/event?place=${placeId}&id=${e.id}`) });
    items.push({ label: "Gör ett likadant", onPress: () => pushOnce(router, `/business/event?place=${placeId}&copy=${e.id}`) });
    items.push({ label: "Ta bort", destructive: true, onPress: () => askRemove(e) });
    if (Platform.OS === "ios") {
      const options = [...items.map((i) => i.label), "Avbryt"];
      ActionSheetIOS.showActionSheetWithOptions(
        { title: e.title, options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: items.length - 1 },
        (n) => items[n]?.onPress(),
      );
    } else {
      Alert.alert(e.title, undefined, [...items.map((i) => ({ text: i.label, style: i.destructive ? "destructive" as const : "default" as const, onPress: i.onPress })), { text: "Avbryt", style: "cancel" }]);
    }
  };

  return (
    <>
      <SettingsScreen title="Evenemang">
        <Rise index={0}>
          <PortalSegmented
            options={[{ id: "upcoming", label: `Kommande${upcoming.length ? ` · ${upcoming.length}` : ""}` }, { id: "past", label: "Tidigare" }]}
            value={tab}
            onChange={setTab}
          />
        </Rise>
        {!events ? (
          <View style={{ gap: 12 }}><Skeleton height={96} radius={18} /><Skeleton height={96} radius={18} /></View>
        ) : list.length === 0 ? (
          <Rise index={1}>
            <View style={s.empty}>
              <View style={s.emptyIcon}><CalendarDays size={28} color={colors.goldText} strokeWidth={1.8} /></View>
              <Text style={s.emptyTitle}>{tab === "upcoming" ? "Inga kommande evenemang" : "Inga tidigare evenemang"}</Text>
              {tab === "upcoming" && <Text style={s.emptyText}>Livemusik, quiz, provning eller marknad? Lägg in det, så syns det i Kalendern.</Text>}
            </View>
          </Rise>
        ) : (
          list.map((e, i) => (
            <Rise key={e.id} index={Math.min(i + 1, 8)}>
              <Pressable onPress={() => menu(e)} style={({ pressed }) => [s.card, tab === "past" && { opacity: 0.6 }, pressed && { opacity: 0.8 }]}>
                <View style={s.image}>
                  {e.image_url && <ExpoImage source={{ uri: e.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />}
                  <DateBox event={e} small style={s.date} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.title} numberOfLines={2}>{e.title}</Text>
                  <Text style={s.meta} numberOfLines={1}>{eventWhen(e)}</Text>
                  {e.series_id && (
                    <View style={s.series}>
                      <Repeat size={12} color={colors.goldText} strokeWidth={2.2} />
                      <Text style={s.seriesText}>Återkommer</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            </Rise>
          ))
        )}
        <Rise index={2}>
          <GoldButton label="Nytt evenemang" onPress={() => pushOnce(router, `/business/event?place=${placeId}`)} />
        </Rise>
      </SettingsScreen>
      <PortalToast ref={toast} />
    </>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  empty: { alignItems: "center", paddingVertical: 28, gap: 10 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: c.goldSoft },
  emptyTitle: { fontFamily: "Montserrat_700Bold", fontSize: 17, color: c.text },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21, color: c.muted, textAlign: "center", paddingHorizontal: 16 },
  card: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 10, borderRadius: 18,
    backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border,
  },
  image: { width: 96, height: 76, borderRadius: 12, overflow: "hidden", backgroundColor: c.fill },
  date: { position: "absolute", top: 6, left: 6 },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 15, lineHeight: 19, color: c.text },
  meta: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.muted },
  series: { flexDirection: "row", alignItems: "center", gap: 5 },
  seriesText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: c.goldText },
});
