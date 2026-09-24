/**
 * Inställningar — hubben. Profilbild och namn i mitten, sedan grupperade
 * rader. Språket väljs med flaggan uppe till höger.
 */
import { useState } from "react";
import { Text, TouchableOpacity, Pressable, Alert, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { User, Crown, Palette, Bell, Info, LogOut, MessageSquarePlus, Trash2 } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { setLanguage, currentLanguage, type LanguageCode } from "@/i18n";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { LanguageMenu } from "@/components/settings/LanguageMenu";
import { RoundFlag } from "@/components/RoundFlag";
import { Avatar } from "@/components/profile/Avatar";
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

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "";
  // avatar_url = profilbilden (framsidan). profile_image_url är kortfotot på baksidan och ska inte visas här.
  const photo = profile?.avatar_url ?? null;

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

  // OBS: raderar än så länge bara delar av datan. Byts mot en riktig radering i nästa steg.
  const confirmDelete = () => {
    Alert.alert(t("settings.deleteAccount.title"), t("settings.deleteAccount.message"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.deleteAccount.confirm"), style: "destructive",
        onPress: async () => {
          try {
            const { data: { user: u } } = await supabase.auth.getUser();
            if (!u) return;
            await supabase.from("favorites").delete().eq("user_id", u.id);
            await supabase.from("visits").delete().eq("user_id", u.id);
            await supabase.from("achievements").delete().eq("user_id", u.id);
            await supabase.from("profiles").delete().eq("user_id", u.id);
          } finally {
            signOut();
          }
        },
      },
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
          <TouchableOpacity style={s.profile} activeOpacity={0.8} onPress={() => router.push("/settings/account" as any)}>
            <Avatar size={76} uri={photo} name={displayName} color={profile?.circle_color ?? "#2A2A2A"} />
            <Text style={s.name} numberOfLines={1}>{displayName}</Text>
          </TouchableOpacity>
        </Rise>

        <Rise index={1}>
        <SettingsGroup>
          <SettingsRow icon={User} label={t("settings.sections.account")} onPress={() => router.push("/settings/account" as any)} />
          <SettingsRow icon={Crown} label={t("settings.sections.pass")} onPress={() => router.push("/settings/pass" as any)} />
          <SettingsRow icon={Palette} label={t("settings.sections.appearance")} onPress={() => router.push("/settings/appearance" as any)} />
          <SettingsRow icon={Bell} label={t("settings.sections.notifications")} onPress={() => router.push("/settings/notifications" as any)} />
          <SettingsRow icon={Info} label={t("settings.sections.about")} onPress={() => router.push("/settings/about" as any)} />
        </SettingsGroup>
        </Rise>

        {/* Mindre viktig än raderna ovan, därför lägre och utan undertext */}
        <Rise index={2}>
          <SettingsGroup>
            <SettingsRow
              compact
              icon={MessageSquarePlus}
              label={t("settings.suggest.title")}
              subtitle={t("settings.suggest.subtitle")}
              strong
              tint={colors.warm}
            />
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

        <Rise index={4}>
          <TouchableOpacity style={s.deleteBtn} onPress={confirmDelete}>
            <Trash2 size={16} color={colors.danger} strokeWidth={1.7} />
            <Text style={s.deleteText}>{t("settings.deleteAccount.action")}</Text>
          </TouchableOpacity>
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

  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10 },
  deleteText: { fontFamily: "Montserrat_500Medium", fontSize: 13.5, letterSpacing: -0.3, color: c.danger },
});
