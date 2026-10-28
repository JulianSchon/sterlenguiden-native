/**
 * Kontakt och länkar: telefon, e-post, hemsida, bokning, Instagram, Facebook och närmaste
 * hållplats. Varje fält sparas när det ser rätt ut; ett fel visas i klartext först när man lämnat
 * fältet (inte medan man skriver). Instagram och Facebook går att skriva som "@namn".
 * Överst syns knapparna som gästerna får på er sida.
 */
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Bus, CalendarCheck, Globe, Mail, Map as MapIcon, Phone } from "lucide-react-native";
import { FacebookIcon, InstagramIcon } from "@/components/BrandIcons";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { PortalField, SaveIndicator, SectionHeader } from "@/components/business/PortalParts";
import { useBusinessPlace, usePlaceAutosave, usePortalPlace } from "@/hooks/useBusiness";
import {
  cleanFacebook, cleanInstagram, cleanUrl, isEmail, isPhone, socialHandle, type PlacePatch,
} from "@/lib/business";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { tb } from "@/i18n/business";

type Key = "phone" | "email" | "website_url" | "book_url" | "instagram_url" | "facebook_url" | "transit_stop_name";

/** Vad som sparas för det man skrivit: ett värde, null (tomt) eller false (ser inte rätt ut) */
function clean(key: Key, v: string): string | null | false {
  const t = v.trim();
  if (!t) return null;
  if (key === "phone") return isPhone(t) ? t : false;
  if (key === "email") return isEmail(t) ? t : false;
  if (key === "instagram_url") return cleanInstagram(t);
  if (key === "facebook_url") return cleanFacebook(t);
  if (key === "transit_stop_name") return t.slice(0, 80);
  return cleanUrl(t);
}

const ERRORS: Record<Key, string> = {
  phone: "Telefonnumret ser inte rätt ut. Skriv bara siffror, t.ex. 0414-123 45.",
  email: "E-postadressen ser inte rätt ut.",
  website_url: "Adressen ser inte rätt ut. Skriv t.ex. orumsnygard.se.",
  book_url: "Länken ser inte rätt ut. Klistra in adressen till er bokningssida.",
  instagram_url: "Skriv ert namn på Instagram, t.ex. @orumsnygard.",
  facebook_url: "Skriv namnet på er Facebooksida eller klistra in länken.",
  transit_stop_name: "",
};

export default function BusinessContact() {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { placeId } = usePortalPlace();
  const { data: place } = useBusinessPlace(placeId);
  const auto = usePlaceAutosave(placeId);
  const [draft, setDraft] = useState<Record<Key, string> | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});

  useEffect(() => {
    if (!place || draft) return;
    setDraft({
      phone: place.phone ?? "",
      email: place.email ?? "",
      website_url: place.website_url ?? "",
      book_url: place.book_url ?? "",
      instagram_url: socialHandle(place.instagram_url, "instagram"),
      facebook_url: socialHandle(place.facebook_url, "facebook"),
      transit_stop_name: place.transit_stop_name ?? "",
    });
  }, [place, draft]);

  const change = (key: Key, v: string) => {
    if (!draft) return;
    setDraft({ ...draft, [key]: v });
    const value = clean(key, v);
    if (value !== false) {
      if (errors[key]) setErrors({ ...errors, [key]: undefined });
      auto.queue({ [key]: value } as PlacePatch);
    }
  };
  const blur = (key: Key) => {
    if (!draft) return;
    if (clean(key, draft[key]) === false) setErrors({ ...errors, [key]: tb(ERRORS[key]) });
  };

  const buttons = useMemo(() => {
    if (!draft) return [];
    const out: { label: string; Icon: typeof Phone }[] = [];
    if (clean("phone", draft.phone)) out.push({ label: "Ring", Icon: Phone });
    if (clean("website_url", draft.website_url)) out.push({ label: "Hemsida", Icon: Globe });
    if (place?.lat != null) out.push({ label: "Karta", Icon: MapIcon });
    if (clean("instagram_url", draft.instagram_url)) out.push({ label: "Instagram", Icon: InstagramIcon as typeof Phone });
    if (clean("facebook_url", draft.facebook_url)) out.push({ label: "Facebook", Icon: FacebookIcon as typeof Phone });
    if (clean("email", draft.email)) out.push({ label: "E-post", Icon: Mail });
    return out;
  }, [draft, place?.lat]);

  if (!place || !draft) {
    return (
      <SettingsScreen title={tb("Kontakt och länkar")}>
        <Skeleton height={86} radius={18} />
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={84} radius={14} />)}
      </SettingsScreen>
    );
  }

  const field = (key: Key, label: string, Icon: typeof Phone, props: Partial<React.ComponentProps<typeof PortalField>> = {}) => (
    <PortalField
      label={label}
      icon={Icon}
      value={draft[key]}
      error={errors[key]}
      onChangeText={(v) => change(key, v)}
      onBlur={() => blur(key)}
      autoCorrect={false}
      {...props}
    />
  );

  return (
    <SettingsScreen title={tb("Kontakt och länkar")} right={<SaveIndicator state={auto.state} onRetry={auto.flush} />}>
      <Rise index={0}>
        <View>
          <SectionHeader title={tb("Knapparna på er sida")} />
          <View style={s.buttons}>
            {buttons.length === 0 ? (
              <Text style={s.none}>{tb("Fyll i något nedan så får gästerna knappar att trycka på.")}</Text>
            ) : buttons.map(({ label, Icon }) => (
              <View key={label} style={s.button}>
                <View style={s.buttonIcon}><Icon size={19} color={colors.text} strokeWidth={1.9} /></View>
                <Text style={s.buttonText}>{label}</Text>
              </View>
            ))}
          </View>
          {clean("book_url", draft.book_url) ? (
            <View style={s.book}>
              <CalendarCheck size={17} color={colors.onGold} strokeWidth={2.2} />
              <Text style={s.bookText}>{tb("Boka – längst ner på er sida")}</Text>
            </View>
          ) : null}
        </View>
      </Rise>

      <Rise index={1}>
        <View style={s.fields}>
          {field("phone", tb("Telefon"), Phone, { keyboardType: "phone-pad", placeholder: "0414-123 45", textContentType: "telephoneNumber" })}
          {field("email", tb("E-post"), Mail, { keyboardType: "email-address", autoCapitalize: "none", placeholder: "info@ertforetag.se", help: tb("Hit skickas också koden om någon ny vill ta hand om er sida.") })}
          {field("website_url", tb("Hemsida"), Globe, { keyboardType: "url", autoCapitalize: "none", placeholder: "ertforetag.se" })}
          {field("book_url", tb("Bokningslänk"), CalendarCheck, {
            keyboardType: "url", autoCapitalize: "none", placeholder: tb("Länken till er bokningssida"),
            help: tb("Finns den får ni en stor Boka-knapp längst ner på er sida."),
          })}
          {field("instagram_url", tb("Instagram"), InstagramIcon as typeof Phone, { autoCapitalize: "none", placeholder: "@ertforetag" })}
          {field("facebook_url", tb("Facebook"), FacebookIcon as typeof Phone, { autoCapitalize: "none", placeholder: tb("Namnet på er sida eller länken") })}
          {field("transit_stop_name", tb("Närmaste hållplats"), Bus, {
            placeholder: tb("T.ex. Kivik Torget"), maxLength: 80,
            help: tb("Visas under Hitta hit, för den som kommer med tåg eller buss."),
          })}
        </View>
      </Rise>
      {auto.error && <Text style={s.error}>{auto.error}</Text>}
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  button: { alignItems: "center", gap: 6, width: 64 },
  buttonIcon: {
    width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center",
    backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong,
  },
  buttonText: { fontFamily: "Inter_500Medium", fontSize: 12, color: c.muted },
  none: { fontFamily: "Inter_400Regular", fontSize: 14, color: c.muted, paddingHorizontal: 4 },
  book: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 14,
    backgroundColor: c.gold, marginTop: 14,
  },
  bookText: { fontFamily: "Inter_700Bold", fontSize: 14.5, color: c.onGold },
  fields: { gap: 20 },
  error: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: c.danger, textAlign: "center" },
});
