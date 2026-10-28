/**
 * Erbjudanden: de som är aktiva, pausade och avslutade. Varje kort visar hur många som använt det.
 * Tryck för att ändra, pausa, starta igen, avsluta, göra ett likadant eller ta bort (appens egen
 * meny, vid kortet). Nytt erbjudande ligger fast längst ner.
 */
import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { useRouter } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { Ticket } from "lucide-react-native";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { GoldButton } from "@/components/auth/AuthParts";
import { useActionMenu, type MenuItem } from "@/components/ActionMenu";
import { PortalSegmented, PortalToast, type PortalToastHandle } from "@/components/business/PortalParts";
import { rangeText } from "@/components/business/Pickers";
import { useBusinessOffers, useOfferActions, usePortalPlace } from "@/hooks/useBusiness";
import { businessError, type BusinessOffer } from "@/lib/business";
import { pushOnce } from "@/lib/navigateOnce";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { tb } from "@/i18n/business";

type Tab = "active" | "paused" | "ended";

const RULE: Record<string, string> = {
  once: "En gång per medlem", daily: "En gång om dagen", weekly: "En gång i veckan",
  monthly: "En gång i månaden", unlimited: "Hur ofta som helst",
};

function tabOf(o: BusinessOffer): Tab {
  if (o.offer.expires_at && new Date(o.offer.expires_at).getTime() < Date.now()) return "ended";
  return o.offer.is_active ? "active" : "paused";
}

export default function BusinessOffers() {
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { placeId } = usePortalPlace();
  const { data: offers } = useBusinessOffers(placeId);
  const actions = useOfferActions(placeId);
  const toast = useRef<PortalToastHandle>(null);
  const actionMenu = useActionMenu();
  const [tab, setTab] = useState<Tab>("active");
  const list = useMemo(() => (offers ?? []).filter((o) => tabOf(o) === tab), [offers, tab]);
  const counts = useMemo(() => {
    const c = { active: 0, paused: 0, ended: 0 };
    for (const o of offers ?? []) c[tabOf(o)]++;
    return c;
  }, [offers]);

  const run = async (id: string, action: "pause" | "resume" | "end" | "delete", done: string) => {
    try {
      const r = await actions.act(id, action);
      if (r && r.ok === false) toast.current?.show(r.reason === "expired" ? tb("Slutdatumet har passerat – ändra det först") : tb("Det gick inte"));
      else toast.current?.show(r?.ended ? tb("Avslutat (någon har använt det, så det sparas)") : done);
    } catch (e) {
      toast.current?.show(businessError(e));
    }
  };

  const menu = (e: GestureResponderEvent, o: BusinessOffer) => {
    const t = tabOf(o);
    const items: MenuItem[] = [];
    if (t !== "ended") items.push({ label: o.redemptions > 0 ? tb("Ändra bild eller slutdatum") : tb("Ändra"), onPress: () => pushOnce(router, `/business/offer?place=${placeId}&id=${o.offer.id}`) });
    if (t === "active") items.push({ label: tb("Pausa"), onPress: () => run(o.offer.id, "pause", tb("Pausat – syns inte förrän ni startar det igen")) });
    if (t === "paused") items.push({ label: tb("Starta igen"), onPress: () => run(o.offer.id, "resume", tb("Igång igen")) });
    items.push({ label: tb("Duplicera"), onPress: () => pushOnce(router, `/business/offer?place=${placeId}&copy=${o.offer.id}`) });
    if (t !== "ended") items.push({ label: tb("Avsluta nu"), destructive: true, confirm: { title: tb("Avsluta erbjudandet?"), message: tb("Det försvinner direkt ur appen."), actions: [{ label: tb("Avsluta"), destructive: true, onPress: () => run(o.offer.id, "end", tb("Avslutat")) }] } });
    if (o.redemptions === 0) items.push({ label: tb("Ta bort"), destructive: true, confirm: { title: tb("Ta bort erbjudandet?"), message: tb("Det går inte att ångra."), actions: [{ label: tb("Ta bort"), destructive: true, onPress: () => run(o.offer.id, "delete", tb("Borttaget")) }] } });
    actionMenu.open(e, { title: o.offer.title, items });
  };

  return (
    <>
      <SettingsScreen title={tb("Erbjudanden")} footer={<GoldButton label={tb("Nytt erbjudande")} onPress={() => pushOnce(router, `/business/offer?place=${placeId}`)} />}>
        <Rise index={0}>
          <PortalSegmented
            options={[
              { id: "active", label: tb("Aktiva{{0}}", { 0: counts.active ? ` · ${counts.active}` : "" }) },
              { id: "paused", label: tb("Pausade{{0}}", { 0: counts.paused ? ` · ${counts.paused}` : "" }) },
              { id: "ended", label: tb("Avslutade") },
            ]}
            value={tab}
            onChange={setTab}
          />
        </Rise>

        {!offers ? (
          <View style={{ gap: 12 }}><Skeleton height={112} radius={18} /><Skeleton height={112} radius={18} /></View>
        ) : list.length === 0 ? (
          <Rise index={1}>
            <View style={s.empty}>
              <View style={s.emptyIcon}><Ticket size={28} color={colors.goldText} strokeWidth={1.8} /></View>
              <Text style={s.emptyTitle}>
                {tab === "active" ? tb("Inget aktivt erbjudande") : tab === "paused" ? tb("Inga pausade") : tb("Inga avslutade än")}
              </Text>
              {tab === "active" && (
                <Text style={s.emptyText}>{tb("Ett erbjudande i Österlenpasset ger er nya gäster – och syns för alla medlemmar.")}</Text>
              )}
            </View>
          </Rise>
        ) : (
          list.map((o, i) => (
            <Rise key={o.offer.id} index={i + 1}>
              <Pressable onPress={(e) => menu(e, o)} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]} accessibilityRole="button">
                {o.offer.image_url ? (
                  <ExpoImage source={{ uri: o.offer.image_url }} style={s.image} contentFit="cover" />
                ) : <View style={s.image} />}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.title} numberOfLines={2}>{o.offer.title}</Text>
                  {!!o.offer.savings_label && <Text style={s.label}>{o.offer.savings_label}</Text>}
                  <Text style={s.meta}>
                    {tb(RULE[o.offer.redemption_interval ?? "once"])}
                    {" · "}
                    {o.offer.expires_at ? tb(tab === "ended" ? "slutade {{0}}" : "till {{0}}", { 0: rangeText(o.offer.expires_at.slice(0, 10)) }) : tb("tills vidare")}
                  </Text>
                  <Text style={s.used}>
                    {o.redemptions === 0 ? tb("Ingen har använt det än") : tb(o.redemptions === 1 ? "Använt 1 gång av 1 person" : o.people === 1 ? "Använt {{0}} gånger av 1 person" : "Använt {{0}} gånger av {{1}} personer", { 0: o.redemptions, 1: o.people })}
                  </Text>
                </View>
              </Pressable>
            </Rise>
          ))
        )}
      </SettingsScreen>
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
    flexDirection: "row", gap: 14, padding: 12, borderRadius: 18,
    backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border,
  },
  image: { width: 84, height: 84, borderRadius: 14, backgroundColor: c.fill },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 15.5, lineHeight: 20, color: c.text },
  label: {
    alignSelf: "flex-start", fontFamily: "Inter_700Bold", fontSize: 12, color: c.onGold, backgroundColor: c.gold,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: "hidden",
  },
  meta: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: c.muted },
  used: { fontFamily: "Inter_600SemiBold", fontSize: 12.5, color: c.goldText },
});
