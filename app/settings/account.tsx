/**
 * Inställningar › Konto: profilbild, visningsnamn (en gång i månaden),
 * personuppgifter, e-post, lösenord och radering av kontot.
 *
 * Kortfotot på baksidan av medlemskortet hör till Österlenpasset, inte hit.
 */
import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, Linking, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { addDays } from "date-fns";
import { Camera, Image as ImageIcon, Lock, Mail, KeyRound, Trash2, type LucideIcon } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { useChangeAvatar, useRemoveAvatar, useUpdateProfile, useDeleteAccount } from "@/hooks/useAccount";
import { formatDate } from "@/i18n/dates";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { GradientCard } from "@/components/GradientCard";
import { Avatar } from "@/components/profile/Avatar";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

// Åtta färger, fyra mörka och fyra ljusa om vartannat (mörk cirkel → ljusa bokstäver,
// ljus cirkel → mörka bokstäver; bokstäverna får automatiskt samma nyans som cirkeln).
const CIRCLE_COLORS = ["#1F3A5F", "#C5A059", "#24493A", "#8FB8DE", "#5C2A35", "#9DB8A0", "#4A2F5C", "#D9A5A5"];
const NAME_COOLDOWN_DAYS = 30;
const MIN_AGE = 13;

/** "2005-3-9" (delar) → "2005-03-09", eller null om det inte är ett riktigt datum. */
function toIsoDate(day: string, month: string, year: string): string | null {
  const d = Number(day), m = Number(month), y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y) || year.length !== 4) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

function ageOn(isoDate: string, now = new Date()): number {
  const birth = new Date(isoDate);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function ActionPill({ icon: Icon, label, onPress, busy }: { icon: LucideIcon; label: string; onPress: () => void; busy?: boolean }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <TouchableOpacity style={s.pill} activeOpacity={0.8} disabled={busy} onPress={onPress}>
      <Icon size={16} color={colors.text} strokeWidth={1.7} />
      <Text style={s.pillText}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function AccountSettings() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const avatarUrl = useAvatarUrl();
  const changeAvatar = useChangeAvatar();
  const removeAvatar = useRemoveAvatar();
  const updateProfile = useUpdateProfile();
  const deleteAccount = useDeleteAccount();

  const displayName = profile?.display_name ?? "";
  const [name, setName] = useState(displayName);
  useEffect(() => setName(displayName), [displayName]);

  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confPw, setConfPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const nextNameChange = profile?.display_name_changed_at
    ? addDays(new Date(profile.display_name_changed_at), NAME_COOLDOWN_DAYS)
    : null;
  const nameLocked = !!nextNameChange && nextNameChange.getTime() > Date.now();
  const nameChanged = name.trim() !== displayName && name.trim().length > 1;

  const errorMessage = (e: unknown) => (e instanceof Error ? e.message : t("common.error"));

  async function pickPhoto(source: "library" | "camera") {
    try {
      await changeAvatar.mutateAsync(source);
    } catch (e) {
      if (errorMessage(e) === "camera_denied") {
        Alert.alert(t("account.photo.cameraDeniedTitle"), t("account.photo.cameraDeniedBody"), [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("account.photo.openSettings"), onPress: () => Linking.openSettings() },
        ]);
      } else {
        Alert.alert(t("common.error"), t("account.photo.failed"));
      }
    }
  }

  async function saveName() {
    try {
      await updateProfile.mutateAsync({ display_name: name.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      Alert.alert(t("common.error"), errorMessage(e) === "display_name_cooldown" ? t("account.name.cooldown") : t("common.error"));
    }
  }

  function saveBirthDate() {
    const iso = toIsoDate(birthDay, birthMonth, birthYear);
    if (!iso) return Alert.alert(t("common.error"), t("account.about.invalidDate"));
    if (ageOn(iso) < MIN_AGE) return Alert.alert(t("common.error"), t("account.about.tooYoung"));
    Alert.alert(t("account.about.confirmBirthDateTitle"), t("account.about.confirmBirthDateBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.save"), onPress: () => updateProfile.mutate({ birth_date: iso }) },
    ]);
  }

  async function changePassword() {
    if (newPw !== confPw) return Alert.alert(t("common.error"), t("account.password.mismatch"));
    if (newPw.length < 8) return Alert.alert(t("common.error"), t("account.password.tooShort"));
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwBusy(false);
    if (error) return Alert.alert(t("common.error"), error.message);
    Alert.alert(t("account.password.updated"));
    setNewPw("");
    setConfPw("");
    setPwOpen(false);
  }

  function confirmDelete() {
    Alert.alert(t("account.delete.title"), t("account.delete.message"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("account.delete.confirm"), style: "destructive",
        onPress: () => deleteAccount.mutate(undefined, {
          onError: () => Alert.alert(t("common.error"), t("account.delete.failed")),
        }),
      },
    ]);
  }

  const circleColor = profile?.circle_color ?? "#2A2A2A";
  const hasPhoto = !!profile?.avatar_url;
  const input = [s.input];

  return (
    <SettingsScreen title={t("account.title")}>
      {/* Profilbild */}
      <View style={s.photoBlock}>
        <View>
          <Avatar size={108} uri={avatarUrl} name={displayName || user?.email || ""} color={circleColor} />
          {changeAvatar.isPending && (
            <View style={s.photoBusy}><ActivityIndicator color="#FFFFFF" /></View>
          )}
        </View>
        <View style={s.pillRow}>
          <ActionPill icon={ImageIcon} label={t("account.photo.choose")} onPress={() => pickPhoto("library")} busy={changeAvatar.isPending} />
          <ActionPill icon={Camera} label={t("account.photo.take")} onPress={() => pickPhoto("camera")} busy={changeAvatar.isPending} />
        </View>
        {hasPhoto ? (
          <TouchableOpacity onPress={() => removeAvatar.mutate()} hitSlop={8}>
            <Text style={s.removeText}>{t("account.photo.remove")}</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.colorBlock}>
            <Text style={s.hint}>{t("account.photo.circleColorHint")}</Text>
            <View style={s.colorRow}>
              {CIRCLE_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[s.swatch, { backgroundColor: c }, circleColor === c && { borderColor: colors.gold, borderWidth: 2 }]}
                  onPress={() => updateProfile.mutate({ circle_color: c })}
                  accessibilityLabel={t("account.photo.circleColor")}
                />
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Visningsnamn */}
      <View>
        <Text style={s.label}>{t("account.name.title")}</Text>
        <GradientCard style={s.card}>
          <View style={s.cardBody}>
            <TextInput
              style={[...input, nameLocked && s.inputLocked]}
              value={name}
              onChangeText={setName}
              editable={!nameLocked}
              maxLength={40}
              autoCapitalize="words"
              placeholder={t("account.name.placeholder")}
              placeholderTextColor={colors.faint}
            />
            <Text style={s.hint}>
              {nameLocked && nextNameChange
                ? t("account.name.nextChange", { date: formatDate(nextNameChange, "d MMMM yyyy") })
                : t("account.name.hint")}
            </Text>
            {!nameLocked && (
              <TouchableOpacity
                style={[s.button, (!nameChanged || updateProfile.isPending) && s.buttonOff]}
                disabled={!nameChanged || updateProfile.isPending}
                onPress={saveName}
              >
                <Text style={s.buttonText}>{t("account.name.save")}</Text>
              </TouchableOpacity>
            )}
          </View>
        </GradientCard>
      </View>

      {/* Om dig */}
      <View>
        <Text style={s.label}>{t("account.about.title")}</Text>
        <GradientCard style={s.card}>
          <View style={s.cardBody}>
            <Text style={s.fieldTitle}>{t("account.about.birthDate")}</Text>
            {profile?.birth_date ? (
              <View style={s.lockedRow}>
                <Lock size={15} color={colors.muted} strokeWidth={1.8} />
                <Text style={s.lockedText}>{formatDate(profile.birth_date, "d MMMM yyyy")}</Text>
              </View>
            ) : (
              <>
                <View style={s.dateRow}>
                  <TextInput style={[...input, s.dateInput]} value={birthDay} onChangeText={setBirthDay} placeholder={t("account.about.day")} placeholderTextColor={colors.faint} keyboardType="number-pad" maxLength={2} />
                  <TextInput style={[...input, s.dateInput]} value={birthMonth} onChangeText={setBirthMonth} placeholder={t("account.about.month")} placeholderTextColor={colors.faint} keyboardType="number-pad" maxLength={2} />
                  <TextInput style={[...input, s.dateInputYear]} value={birthYear} onChangeText={setBirthYear} placeholder={t("account.about.year")} placeholderTextColor={colors.faint} keyboardType="number-pad" maxLength={4} />
                </View>
                <Text style={s.hint}>{t("account.about.birthDateHint")}</Text>
                <TouchableOpacity
                  style={[s.button, (!birthDay || !birthMonth || birthYear.length !== 4) && s.buttonOff]}
                  disabled={!birthDay || !birthMonth || birthYear.length !== 4}
                  onPress={saveBirthDate}
                >
                  <Text style={s.buttonText}>{t("account.about.saveBirthDate")}</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={s.separator} />

            <Text style={s.fieldTitle}>{t("account.about.lives")}</Text>
            <View style={s.segment}>
              {([true, false] as const).map((value) => {
                const active = profile?.lives_in_osterlen === value;
                return (
                  <TouchableOpacity
                    key={String(value)}
                    style={[s.segmentItem, active && s.segmentItemActive]}
                    activeOpacity={0.8}
                    onPress={() => updateProfile.mutate({ lives_in_osterlen: value })}
                  >
                    <Text style={[s.segmentText, active && { color: colors.onGold }]}>
                      {value ? t("account.about.livesHere") : t("account.about.visitor")}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </GradientCard>
      </View>

      {/* E-post och lösenord */}
      <SettingsGroup>
        <SettingsRow icon={Mail} label={t("account.email.title")} value={user?.email ?? ""} />
        <SettingsRow icon={KeyRound} label={t("account.password.change")} onPress={() => setPwOpen((open) => !open)} />
      </SettingsGroup>

      {pwOpen && (
        <GradientCard style={s.card}>
          <View style={s.cardBody}>
            <TextInput style={input} value={newPw} onChangeText={setNewPw} secureTextEntry autoCapitalize="none" placeholder={t("account.password.newPassword")} placeholderTextColor={colors.faint} />
            <TextInput style={input} value={confPw} onChangeText={setConfPw} secureTextEntry autoCapitalize="none" placeholder={t("account.password.confirm")} placeholderTextColor={colors.faint} />
            <TouchableOpacity style={[s.button, (pwBusy || !newPw) && s.buttonOff]} disabled={pwBusy || !newPw} onPress={changePassword}>
              {pwBusy ? <ActivityIndicator color={colors.onGold} /> : <Text style={s.buttonText}>{t("account.password.update")}</Text>}
            </TouchableOpacity>
          </View>
        </GradientCard>
      )}

      <TouchableOpacity style={s.deleteBtn} onPress={confirmDelete} disabled={deleteAccount.isPending}>
        {deleteAccount.isPending ? (
          <ActivityIndicator color={colors.danger} />
        ) : (
          <>
            <Trash2 size={16} color={colors.danger} strokeWidth={1.7} />
            <Text style={s.deleteText}>{t("account.delete.action")}</Text>
          </>
        )}
      </TouchableOpacity>
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  photoBlock: { alignItems: "center", gap: 14 },
  photoBusy: {
    ...StyleSheet.absoluteFillObject, borderRadius: 54, backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  pillRow: { flexDirection: "row", gap: 10 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 11,
    borderRadius: 999, backgroundColor: c.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong,
  },
  pillText: { fontFamily: "Montserrat_500Medium", fontSize: 13.5, letterSpacing: -0.2, color: c.text },
  removeText: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: c.danger },
  colorBlock: { alignItems: "center", gap: 12 },
  colorRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: c.borderStrong },

  label: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.6, color: c.muted,
    paddingLeft: 6, marginBottom: 8, textTransform: "uppercase",
  },
  card: {},
  cardBody: { padding: 16, gap: 12 },
  fieldTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: c.text },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12.5, lineHeight: 18, color: c.muted },
  // fontSize 16 hindrar iOS från att zooma in vid fokus
  input: {
    fontFamily: "Inter_400Regular", fontSize: 16, color: c.text, backgroundColor: c.raised,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong,
  },
  inputLocked: { opacity: 0.55 },
  dateRow: { flexDirection: "row", gap: 10 },
  dateInput: { flex: 1, textAlign: "center" },
  dateInputYear: { flex: 1.6, textAlign: "center" },
  lockedRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  lockedText: { fontFamily: "Inter_500Medium", fontSize: 15, color: c.text },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginVertical: 4 },
  button: { height: 46, borderRadius: 12, backgroundColor: c.gold, alignItems: "center", justifyContent: "center" },
  buttonOff: { opacity: 0.4 },
  buttonText: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, color: c.onGold },

  segment: { flexDirection: "row", padding: 4, gap: 4, borderRadius: 14, backgroundColor: c.fill },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  segmentItemActive: { backgroundColor: c.gold },
  segmentText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: c.muted },

  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  deleteText: { fontFamily: "Montserrat_500Medium", fontSize: 13.5, letterSpacing: -0.3, color: c.danger },
});
