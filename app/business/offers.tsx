/**
 * Erbjudanden: de som är igång, pausade och avslutade. Varje kort visar hur många som använt det.
 * Tryck för att ändra, pausa, starta igen, avsluta, göra ett likadant eller ta bort.
 */
import { useMemo, useRef, useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { Ticket } from "lucide-react-native";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { GoldButton } from "@/components/auth/AuthParts";
import { PortalSegmented, PortalToast, type PortalToastHandle } from "@/components/business/PortalParts";
import { rangeText } from "@/components/business/Pickers";
import { useBusinessOffers, useOfferActions, usePortalPlace } from "@/hooks/useBusiness";
import { businessError, type BusinessOffer } from "@/lib/business";
import { pushOnce } from "@/lib/navigateOnce";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

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
      if (r && r.ok === false) toast.current?.show(r.reason === "expired" ? "Slutdatumet har passerat – ändra det först" : "Det gick inte");
      else toast.current?.show(r?.ended ? "Avslutat (någon har använt det, så det sparas)" : done);
    } catch (e) {
      toast.current?.show(businessError(e));
    }
  };

  const menu = (o: BusinessOffer) => {
    const t = tabOf(o);
    const items: { label: string; destructive?: boolean; onPress: () => void }[] = [];
    if (t !== "ended") items.push({ label: o.redemptions > 0 ? "Ändra bild eller slutdatum" : "Ändra", onPress: () => pushOnce(router, `/business/offer?place=${placeId}&id=${o.offer.id}`) });
    if (t === "active") items.push({ label: "Pausa", onPress: () => run(o.offer.id, "pause", "Pausat – syns inte förrän ni startar det igen") });
    if (t === "paused") items.push({ label: "Starta igen", onPress: () => run(o.offer.id, "resume", "Igång igen") });
    items.push({ label: "Gör ett likadant", onPress: () => pushOnce(router, `/business/offer?place=${placeId}&copy=${o.offer.id}`) });
    if (t !== "ended") items.push({ label: "Avsluta nu", destructive: true, onPress: () => confirm("Avsluta erbjudandet?", "Det försvinner direkt ur appen.", "Avsluta", () => run(o.offer.id, "end", "Avslutat")) });
    if (o.redemptions === 0) items.push({ label: "Ta bort", destructive: true, onPress: () => confirm("Ta bort erbjudandet?", "Det går inte att ångra.", "Ta bort", () => run(o.offer.id, "delete", "Borttaget")) });

    if (Platform.OS === "ios") {
      const options = [...items.map((i) => i.label), "Avbryt"];
      const destructive = items.map((i, n) => (i.destructive ? n : -1)).filter((n) => n >= 0);
      ActionSheetIOS.showActionSheetWithOptions(
        { title: o.offer.title, options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: destructive },
        (n) => items[n]?.onPress(),
      );
    } else {
      Alert.alert(o.offer.title, undefined, [...items.map((i) => ({ text: i.label, style: i.destructive ? "destructive" as const : "default" as const, onPress: i.onPress })), { text: "Avbryt", style: "cancel" }]);
    }
  };

  return (
    <>
      <SettingsScreen title="Erbjudanden">
        <Rise index={0}>
          <PortalSegmented
            options={[
              { id: "active", label: `Igång${counts.active ? ` · ${counts.active}` : ""}` },
              { id: "paused", label: `Pausade${counts.paused ? ` · ${counts.paused}` : ""}` },
              { id: "ended", label: "Avslutade" },
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
                {tab === "active" ? "Inget erbjudande igång" : tab === "paused" ? "Inga pausade" : "Inga avslutade än"}
              </Text>
              {tab === "active" && (
                <Text style={s.emptyText}>Ett erbjudande i Österlenpasset ger er nya gäster – och syns för alla medlemmar.</Text>
              )}
            </View>
          </Rise>
        ) : (
          list.map((o, i) => (
            <Rise key={o.offer.id} index={i + 1}>
              <Pressable onPress={() => menu(o)} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]} accessibilityRole="button">
                {o.offer.image_url ? (
                  <ExpoImage source={{ uri: o.offer.image_url }} style={s.image} contentFit="cover" />
                ) : <View style={s.image} />}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.title} numberOfLines={2}>{o.offer.title}</Text>
                  {o.offer.savings_label && <Text style={s.label}>{o.offer.savings_label}</Text>}
                  <Text style={s.meta}>
                    {RULE[o.offer.redemption_interval ?? "once"]}
                    {" · "}
                    {o.offer.expires_at ? `${tab === "ended" ? "slutade" : "till"} ${rangeText(o.offer.expires_at.slice(0, 10))}` : "tills vidare"}
                  </Text>
                  <Text style={s.used}>
                    {o.redemptions === 0 ? "Ingen har använt det än" : `Använt ${o.redemptions} ${o.redemptions === 1 ? "gång" : "gånger"} av ${o.people} ${o.people === 1 ? "person" : "personer"}`}
                  </Text>
                </View>
              </Pressable>
            </Rise>
          ))
        )}

        <Rise index={2}>
          <GoldButton label="Nytt erbjudande" onPress={() => pushOnce(router, `/business/offer?place=${placeId}`)} />
        </Rise>
      </SettingsScreen>
      <PortalToast ref={toast} />
    </>
  );
}

function confirm(title: string, message: string, action: string, onYes: () => void) {
  Alert.alert(title, message, [{ text: "Avbryt", style: "cancel" }, { text: action, style: "destructive", onPress: onYes }]);
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
