/**
 * Inställningar — hubben. Profilbild och namn i mitten, sedan grupperade
 * rader. Språket väljs med flaggan uppe till höger.
 *
 * Sköter man ett företag finns Mitt företag här (och inbjudningar till ett företag, när någon
 * bjudit in en). Admin ser förfrågningarna som väntar. Alla andra ser en diskret rad längre ner:
 * Vill ert företag synas här?
 */
import { useState } from "react";
import { Text, TouchableOpacity, Pressable, Alert, Image, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { User, Crown, Palette, Bell, Info, LogOut, MessageSquarePlus, ThumbsUp, Store, MailOpen, ShieldCheck } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { answerInvite, useBusinessOverview } from "@/hooks/useBusiness";
import type { MyInvite } from "@/lib/business";
import { supabase } from "@/integrations/supabase/client";
import { setLanguage, currentLanguage, type LanguageCode } from "@/i18n";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { LanguageMenu } from "@/components/settings/LanguageMenu";
import { RoundFlag } from "@/components/RoundFlag";
import { Avatar } from "@/components/profile/Avatar";
import { ringOverflow } from "@/components/profile/AvatarRing";
import { GradientCard } from "@/components/GradientCard";
import { Rise } from "@/components/Rise";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export default function SettingsHub() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [langOpen, setLangOpen] = useState(false);
  const { data: business } = useBusinessOverview();
  const myPlaces = business?.places ?? [];
  const invites = business?.invites ?? [];
  const joinRequests = myPlaces.reduce((n, p) => n + p.requests, 0);

  const openInvite = (invite: MyInvite) => {
    Alert.alert(
      `Inbjudan från ${invite.place_name}`,
      `${invite.invited_by ?? "Någon"} har bjudit in dig att sköta ${invite.place_name} i appen${invite.role === "owner" ? " som ägare" : ""}.`,
      [
        { text: "Senare", style: "cancel" },
        { text: "Nej tack", style: "destructive", onPress: () => answerInvite(invite.id, false).finally(() => queryClient.invalidateQueries({ queryKey: ["business", "overview"] })) },
        {
          text: "Gå med",
          onPress: async () => {
            try {
              await answerInvite(invite.id, true);
              await queryClient.invalidateQueries({ queryKey: ["business", "overview"] });
              router.push(`/business/welcome?place=${invite.place_id}`);
            } catch {
              Alert.alert(t("common.error"), "Det gick inte att gå med just nu. Försök igen.");
            }
          },
        },
      ],
    );
  };

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "";
  // profilbilden (framsidan). Kortfotot på baksidan (profile_image_url) ska inte visas här.
  const photo = useAvatarUrl();

  const saveLanguage = useMutation({
    mutationFn: async (code: LanguageCode) => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      await supabase.from("profiles").update({ preferred_language: code }).eq("user_id", u.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  });

  const chooseLanguage = (code: LanguageCode) => {
    setLanguage(code);
    saveLanguage.mutate(code);
    setLangOpen(false);
  };

  const confirmSignOut = () => {
    Alert.alert(t("settings.signOut.title"), t("settings.signOut.message"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("settings.signOut.action"), style: "destructive", onPress: signOut },
    ]);
  };

  const flagButton = (
    <TouchableOpacity style={s.flagBtn} onPress={() => setLangOpen(true)} hitSlop={8} accessibilityLabel={t("settings.language")}>
      <RoundFlag code={currentLanguage()} size={30} />
    </TouchableOpacity>
  );

  return (
    <>
      <SettingsScreen title={t("settings.title")} right={flagButton} compact>
        {/* Blocken tonas in ett i taget: sidan veckas ut uppifrån och ner */}
        <Rise index={0}>
          {/* En profilring sticker ut utanför bilden: lika mycket luft runt den, så den inte hamnar under rubriken */}
          <TouchableOpacity style={[s.profile, { paddingVertical: 2 + ringOverflow(profile?.avatar_ring, 76) }]} activeOpacity={0.8} onPress={() => router.push("/settings/account")}>
            <Avatar size={76} uri={photo} name={displayName} color={profile?.circle_color ?? "#2A2A2A"} ring={profile?.avatar_ring} />
            <Text style={s.name} numberOfLines={1}>{displayName}</Text>
          </TouchableOpacity>
        </Rise>

        <Rise index={1}>
        <SettingsGroup>
          <SettingsRow icon={User} label={t("settings.sections.account")} onPress={() => router.push("/settings/account")} />
          <SettingsRow icon={ThumbsUp} label={t("settings.sections.interests")} onPress={() => router.push("/settings/interests")} />
          <SettingsRow icon={Crown} label={t("settings.sections.pass")} onPress={() => router.push("/settings/pass")} />
          <SettingsRow icon={Palette} label={t("settings.sections.appearance")} onPress={() => router.push("/settings/appearance")} />
          <SettingsRow icon={Bell} label={t("settings.sections.notifications")} onPress={() => router.push("/settings/notifications")} />
          <SettingsRow icon={Info} label={t("settings.sections.about")} onPress={() => router.push("/settings/about")} />
        </SettingsGroup>
        </Rise>

        {/* Mindre viktig än raderna ovan, därför lägre och utan undertext */}
        {(myPlaces.length > 0 || invites.length > 0 || business?.admin != null) && (
          <Rise index={2}>
            <SettingsGroup>
              {myPlaces.length > 0 && (
                <SettingsRow
                  icon={Store}
                  label="Mitt företag"
                  subtitle={myPlaces.map((p) => p.name).join(", ")}
                  value={joinRequests > 0 ? `${joinRequests} vill gå med` : undefined}
                  tint={colors.goldText}
                  onPress={() => router.push(`/business?place=${myPlaces[0].id}`)}
                />
              )}
              {invites.map((invite) => (
                <SettingsRow
                  key={invite.id}
                  icon={MailOpen}
                  label={`Inbjudan: ${invite.place_name}`}
                  subtitle={`${invite.invited_by ?? "Någon"} har bjudit in dig`}
                  tint={colors.goldText}
                  onPress={() => openInvite(invite)}
                />
              ))}
              {business?.admin != null && (
                <SettingsRow
                  icon={ShieldCheck}
                  label="Admin"
                  value={business.admin > 0 ? `${business.admin} väntar` : undefined}
                  onPress={() => router.push("/admin")}
                />
              )}
            </SettingsGroup>
          </Rise>
        )}

        <Rise index={2}>
          <SettingsGroup>
            <SettingsRow
              compact
              icon={MessageSquarePlus}
              label={t("settings.suggest.title")}
              subtitle={t("settings.suggest.subtitle")}
              strong
              tint={colors.warm}
              onPress={() => router.push("/settings/suggest")}
            />
            {myPlaces.length === 0 && (
              <SettingsRow
                compact
                icon={Store}
                label="Vill ert företag synas här?"
                subtitle="Ta hand om er sida i appen – gratis"
                strong
                tint={colors.warm}
                onPress={() => router.push("/business/start")}
              />
            )}
          </SettingsGroup>
        </Rise>

        <Rise index={3}>
          <GradientCard>
            <Pressable
              style={({ pressed }) => [s.signOut, pressed && s.signOutPressed]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                confirmSignOut();
              }}
            >
              <LogOut size={18} color={colors.text} strokeWidth={1.6} />
              <Text style={s.signOutText}>{t("settings.signOut.action")}</Text>
            </Pressable>
          </GradientCard>
        </Rise>

        {/* Loggan i sin egen guldfärg, som en diskret signatur */}
        <Rise index={4}>
          <Image
            source={require("../assets/Osterlenappen-logo.png")}
            style={s.logo}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </Rise>

      </SettingsScreen>

      <LanguageMenu
        visible={langOpen}
        top={Math.max(insets.top, 44) + 54}
        onSelect={chooseLanguage}
        onClose={() => setLangOpen(false)}
      />
    </>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  // Flaggan fyller hela cirkeln; en tunn kant gör att den syns mot bakgrunden även i ljust läge
  flagBtn: { width: 30, height: 30, borderRadius: 15, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong },
  profile: { alignItems: "center", gap: 4, paddingVertical: 2 },
  name: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 22, color: c.text, marginTop: 8 },

  signOut: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 48 },
  signOutPressed: { backgroundColor: c.fill },
  signOutText: { fontFamily: "Montserrat_500Medium", fontSize: 14.5, letterSpacing: -0.3, color: c.text },

  logo: { alignSelf: "center", width: 40, height: 45, marginTop: 8 },
});
