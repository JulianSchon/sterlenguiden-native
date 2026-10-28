/**
 * Evenemang: kommande (närmast först) och tidigare. Tryck för att ändra, göra ett likadant eller
 * ta bort — för återkommande frågar appen om det gäller bara det tillfället eller alla kommande.
 * Menyn är appens egen och öppnas vid kortet. Nytt evenemang ligger fast längst ner.
 */
import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { useRouter } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { CalendarDays, Repeat } from "lucide-react-native";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { GoldButton } from "@/components/auth/AuthParts";
import { useActionMenu, type MenuItem } from "@/components/ActionMenu";
import { DateBox } from "@/components/events/EventCards";
import { PortalSegmented, PortalToast, type PortalToastHandle } from "@/components/business/PortalParts";
import { useEventActions, usePlaceEvents, usePortalPlace, type PlaceEvent } from "@/hooks/useBusiness";
import { businessError } from "@/lib/business";
import { dayKey, eventWhen, lastDay } from "@/lib/events";
import { pushOnce } from "@/lib/navigateOnce";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { tb } from "@/i18n/business";
import { currentLanguage } from "@/i18n";

export default function BusinessEvents() {
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { placeId } = usePortalPlace();
  const { data: events } = usePlaceEvents(placeId);
  const actions = useEventActions(placeId);
  const toast = useRef<PortalToastHandle>(null);
  const actionMenu = useActionMenu();
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
      .then((n) => toast.current?.show(n > 1 ? tb("{{0}} tillfällen borttagna", { 0: n }) : tb("Borttaget")))
      .catch((err) => toast.current?.show(businessError(err)));
  };
  const removeQuestion = (e: PlaceEvent): NonNullable<MenuItem["confirm"]> => (e.series_id
    ? {
      title: tb("Ta bort vilka?"), message: tb("Evenemanget återkommer."),
      actions: [
        { label: tb("Bara det här"), destructive: true, onPress: () => remove(e, "one") },
        { label: tb("Alla kommande"), destructive: true, onPress: () => remove(e, "series") },
      ],
    }
    : { title: tb("Ta bort evenemanget?"), message: tb("Det försvinner ur Kalendern direkt."), actions: [{ label: tb("Ta bort"), destructive: true, onPress: () => remove(e, "one") }] });

  const menu = (ev: GestureResponderEvent, e: PlaceEvent) => {
    const items: MenuItem[] = [];
    if (tab === "upcoming") items.push({ label: "Ändra", onPress: () => pushOnce(router, `/business/event?place=${placeId}&id=${e.id}`) });
    items.push({ label: "Gör ett likadant", onPress: () => pushOnce(router, `/business/event?place=${placeId}&copy=${e.id}`) });
    items.push({ label: "Ta bort", destructive: true, confirm: removeQuestion(e) });
    actionMenu.open(ev, { title: e.title, items });
  };

  return (
    <>
      <SettingsScreen title={tb("Evenemang")} footer={<GoldButton label={tb("Nytt evenemang")} onPress={() => pushOnce(router, `/business/event?place=${placeId}`)} />}>
        <Rise index={0}>
          <PortalSegmented
            options={[{ id: "upcoming", label: tb("Kommande{{0}}", { 0: upcoming.length ? ` · ${upcoming.length}` : "" }) }, { id: "past", label: tb("Tidigare") }]}
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
              <Text style={s.emptyTitle}>{tab === "upcoming" ? tb("Inga kommande evenemang") : tb("Inga tidigare evenemang")}</Text>
              {tab === "upcoming" && <Text style={s.emptyText}>{tb("Livemusik, quiz, provning eller marknad? Lägg in det, så syns det i Kalendern.")}</Text>}
            </View>
          </Rise>
        ) : (
          list.map((e, i) => (
            <Rise key={e.id} index={Math.min(i + 1, 8)}>
              <Pressable onPress={(ev) => menu(ev, e)} style={({ pressed }) => [s.card, tab === "past" && { opacity: 0.6 }, pressed && { opacity: 0.8 }]}>
                <View style={s.image}>
                  {!!e.image_url && <ExpoImage source={{ uri: e.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />}
                  <DateBox event={e} small style={s.date} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.title} numberOfLines={2}>{e.title}</Text>
                  <Text style={s.meta} numberOfLines={1}>{eventWhen(e, currentLanguage())}</Text>
                  {e.series_id && (
                    <View style={s.series}>
                      <Repeat size={12} color={colors.goldText} strokeWidth={2.2} />
                      <Text style={s.seriesText}>{tb("Återkommer")}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            </Rise>
          ))
        )}      </SettingsScreen>
      {actionMenu.element}
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
