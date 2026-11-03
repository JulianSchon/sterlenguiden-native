/**
 * "Ditt användarnamn" — visas en gång, första gången man öppnar Mitt Österlen eller Vänner.
 *
 * Användarnamnet väljs inte i onboardingen: appen skapar det ur namnet (lib/onboarding), så alla
 * konton alltid har ett. Här får man se det och byta det om man vill, innan det börjar betyda något
 * (vänner hittar en med det, det syns i topplistor och listor). Klar utan ändring = det står kvar.
 *
 * Visas inte om man redan bytt användarnamn (username_changed_at), och telefonen minns när man
 * tryckt Klar. Byter man här räknas det som månadens byte (samma regel som under Konto).
 */
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Sheet, PrimaryButton } from "@/components/Sheet";
import { AuthField, FieldNote } from "@/components/auth/AuthParts";
import { useProfile } from "@/hooks/useProfile";
import { useUpdateProfile } from "@/hooks/useAccount";
import { USERNAME_PATTERN, usernameTaken } from "@/lib/onboarding";
import { isNetworkError } from "@/lib/network";
import { useTheme } from "@/theme/ThemeProvider";

const keyOf = (userId: string) => `username-confirmed:v1:${userId}`;

export function UsernameSheet() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Visas en kort stund efter att sidan glidit fram
  useEffect(() => {
    if (!profile?.user_id || profile.username_changed_at) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    AsyncStorage.getItem(keyOf(profile.user_id)).then((done) => {
      if (!alive || done) return;
      setName(profile.username ?? "");
      timer = setTimeout(() => setVisible(true), 600);
    }).catch(() => {});
    return () => { alive = false; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.user_id]);

  // Ledigt? Kontrolleras en kort stund efter att man slutat skriva (null = vet inte än)
  const valid = USERNAME_PATTERN.test(name);
  const unchanged = name === (profile?.username ?? "");
  const [free, setFree] = useState<{ name: string; free: boolean | null } | null>(null);
  useEffect(() => {
    if (!valid || unchanged) return;
    let alive = true;
    const timer = setTimeout(async () => {
      const taken = await usernameTaken(name);
      if (alive) setFree({ name, free: taken === null ? null : !taken });
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [name, valid, unchanged]);
  const known = unchanged ? true : free?.name === name ? free.free : undefined;
  const ok = valid && known !== false;

  let note: { text: string; tone: "muted" | "danger" | "success" } = { text: t("onboarding.username.rules"), tone: "muted" };
  if (name.length > 0 && !/^[a-zA-Z0-9_.]*$/.test(name)) note = { text: t("onboarding.username.invalid"), tone: "danger" };
  else if (valid && !unchanged && known === true) note = { text: t("onboarding.username.free"), tone: "success" };
  else if (valid && known === false) note = { text: t("onboarding.username.taken"), tone: "danger" };
  if (error) note = { text: error, tone: "danger" };

  const finish = () => {
    if (profile?.user_id) AsyncStorage.setItem(keyOf(profile.user_id), "1").catch(() => {});
    setVisible(false);
  };

  const save = async () => {
    if (!ok || update.isPending) return;
    if (unchanged) return finish();
    setError(null);
    try {
      await update.mutateAsync({ username: name });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      finish();
    } catch (e) {
      if (isNetworkError(e)) return;
      const code = e instanceof Error ? e.message : "";
      setError(code === "username_taken" ? t("onboarding.username.taken")
        : code === "username_invalid" ? t("onboarding.username.invalid")
        : code === "username_cooldown" ? t("account.username.cooldown")
        : t("common.error"));
    }
  };

  return (
    <Sheet visible={visible} onClose={finish} title={t("usernameSheet.title")}>
      <View style={s.body}>
        <Text style={[s.text, { color: colors.muted }]}>{t("usernameSheet.text")}</Text>
        <AuthField
          prefix="@"
          value={name}
          onChangeText={(v) => { setName(v.replace(/\s/g, "").toLowerCase().slice(0, 20)); setError(null); }}
          placeholder={t("onboarding.username.placeholder")}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          textContentType="username"
          returnKeyType="done"
          onSubmitEditing={save}
          invalid={note.tone === "danger"}
        />
        <FieldNote text={note.text} tone={note.tone} />
      </View>
      <PrimaryButton label={t("usernameSheet.done")} onPress={save} disabled={!ok} loading={update.isPending} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  body: { gap: 10, marginBottom: 18 },
  text: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21 },
});
