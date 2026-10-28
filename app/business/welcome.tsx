/**
 * Första gången man kommer in i Mitt företag: välkommen, tre löften om hur det fungerar, och
 * villkoren (som godkänns med Kom igång). Visas en gång per person och plats.
 */
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { CircleCheck, Eye, HandCoins, X } from "lucide-react-native";
import { GoldButton, FieldNote } from "@/components/auth/AuthParts";
import { Rise } from "@/components/Rise";
import { acceptTerms, usePortalPlace } from "@/hooks/useBusiness";
import { placeImages } from "@/hooks/usePlaces";
import { businessError } from "@/lib/business";
import { pushOnce } from "@/lib/navigateOnce";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { tb } from "@/i18n/business";

const PROMISES = [
  { Icon: CircleCheck, title: "Allt sparas medan ni skriver", text: "Ingen spara-knapp att glömma. Ändrar ni något syns det i appen direkt." },
  { Icon: Eye, title: "Ni ser hur det blir", text: "Tryck på Visa sidan när som helst för att se er sida som gästerna ser den." },
  { Icon: HandCoins, title: "Det kostar ingenting", text: "Inga avgifter och ingen del av försäljningen. Bara fler gäster." },
];

export default function BusinessWelcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { mine, placeId } = usePortalPlace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const image = placeImages(mine?.image_url)[0];

  const start = async () => {
    if (!mine) return;
    setBusy(true);
    setError(null);
    try {
      await acceptTerms(placeId);
      await queryClient.invalidateQueries({ queryKey: ["business", "overview"] });
      router.replace(`/business?place=${placeId}`);
    } catch (e) {
      setError(businessError(e));
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={[s.hero, { paddingTop: insets.top }]}>
          {!!image && <ExpoImage source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />}
          <LinearGradient colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)", colors.bg]} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
          <TouchableOpacity style={[s.close, { top: insets.top + 10 }]} onPress={() => router.back()} hitSlop={10} accessibilityLabel={tb("Stäng")}>
            <X size={22} color="#FFFFFF" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
        <View style={s.body}>
          <Rise index={0}>
            <Text style={s.kicker}>{tb("Mitt företag")}</Text>
            <Text style={s.title}>{tb("Välkommen,")} {mine?.name ?? ""}!</Text>
            <Text style={s.lead}>
              {tb("Här tar ni hand om er sida i Österlenappen: öppettider, bilder, erbjudanden i Österlenpasset, evenemang och stories.")}
            </Text>
          </Rise>
          <View style={s.promises}>
            {PROMISES.map(({ Icon, title: sv, text: svText }, i) => ({ Icon, title: tb(sv), text: tb(svText), i })).map(({ Icon, title, text, i }) => (
              <Rise key={title} index={i + 1}>
                <View style={s.promise}>
                  <View style={s.promiseIcon}>
                    <Icon size={20} color={colors.goldText} strokeWidth={1.9} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.promiseTitle}>{title}</Text>
                    <Text style={s.promiseText}>{text}</Text>
                  </View>
                </View>
              </Rise>
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {error && <FieldNote tone="danger" text={error} />}
        <GoldButton label={tb("Kom igång")} onPress={start} loading={busy} />
        <Text style={s.fine}>
          {tb("Genom att fortsätta godkänner ni")}{" "}
          <Text style={s.link} onPress={() => pushOnce(router, "/business/terms")}>{tb("villkoren för företag")}</Text>.
        </Text>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  hero: { height: 260, backgroundColor: c.card },
  close: {
    position: "absolute", right: 16, width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)",
  },
  body: { paddingHorizontal: 24, marginTop: -28 },
  kicker: { fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1.8, textTransform: "uppercase", color: c.goldText },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 28, lineHeight: 34, letterSpacing: -0.7, color: c.text, marginTop: 8 },
  lead: { fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 23, color: c.muted, marginTop: 10 },
  promises: { marginTop: 26, gap: 18 },
  promise: { flexDirection: "row", gap: 14 },
  promiseIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.goldSoft },
  promiseTitle: { fontFamily: "Montserrat_600SemiBold", fontSize: 15.5, color: c.text },
  promiseText: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, color: c.muted, marginTop: 3 },
  footer: { paddingHorizontal: 24, paddingTop: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.bg },
  fine: { fontFamily: "Inter_400Regular", fontSize: 12.5, lineHeight: 18, color: c.muted, textAlign: "center" },
  link: { fontFamily: "Inter_600SemiBold", color: c.goldText },
});
