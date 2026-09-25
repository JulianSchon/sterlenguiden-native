/**
 * Inställningar › Konto: profilbild med cirkelfärger, en box med namn (går att
 * ändra en gång i månaden), födelsedatum och e-post (låsta), lösenord, om man
 * bor på Österlen och radering av kontot.
 *
 * Kortfotot på baksidan av medlemskortet hör till Österlenpasset, inte hit.
 */
import { useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  ActivityIndicator, StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import { addDays } from "date-fns";
import Svg, { Circle } from "react-native-svg";
import { Calendar, Camera, ChevronDown, ChevronUp, Lock, Mail, Pencil, Trash2 } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { usePhotoMenu } from "@/hooks/usePhotoMenu";
import { useChangeAvatar, useRemoveAvatar, useUpdateProfile, useDeleteAccount } from "@/hooks/useAccount";
import { formatDate } from "@/i18n/dates";
import { toIsoDate, ageOn } from "@/lib/birthDate";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { GradientCard } from "@/components/GradientCard";
import { IconSwitch } from "@/components/IconSwitch";
import { QuietButton } from "@/components/QuietButton";
import { Avatar } from "@/components/profile/Avatar";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

// Sex färger, tre mörka och tre ljusa om vartannat (mörk cirkel → ljusa bokstäver,
// ljus cirkel → mörka bokstäver; bokstäverna får automatiskt samma nyans som cirkeln).
const CIRCLE_COLORS = ["#1F3A5F", "#C5A059", "#24493A", "#8FB8DE", "#5C2A35", "#D9A5A5"];
const NAME_COOLDOWN_DAYS = 30;
const MIN_AGE = 13;
const CAMERA_RING = 42;
const COLOR_RING = 34;

/** Guldig ring av korta streck med en kamera i mitten: lägg till foto. */
function CameraRing({ size, onPress, disabled, label }: { size: number; onPress: () => void; disabled: boolean; label: string }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityLabel={label} style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={size / 2 - 1.5} stroke={colors.gold} strokeWidth={2} strokeDasharray="3 4" fill="none" />
      </Svg>
      <View style={styles.cameraIcon}>
        <Camera size={size * 0.42} color={colors.gold} strokeWidth={1.8} />
      </View>
    </TouchableOpacity>
  );
}

export default function AccountSettings() {
  const { t } = useTranslation();
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
  const circleColor = profile?.circle_color ?? "#2A2A2A";

  const nameInput = useRef<TextInput>(null);
  const [nameFocused, setNameFocused] = useState(false);
  const [name, setName] = useState(displayName);
  useEffect(() => setName(displayName), [displayName]);
  const nextNameChange = profile?.display_name_changed_at
    ? addDays(new Date(profile.display_name_changed_at), NAME_COOLDOWN_DAYS)
    : null;
  const nameLocked = !!nextNameChange && nextNameChange.getTime() > Date.now();
  const nameChanged = name.trim().length > 1 && name.trim() !== displayName;

  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const birthComplete = !!birthDay && !!birthMonth && birthYear.length === 4;

  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confPw, setConfPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  /** Kameraringen: välj bild eller ta foto (systemets egen meny på iOS). */
  const addPhoto = usePhotoMenu(changeAvatar.mutateAsync, t("account.photo.title"));

  async function saveName() {
    try {
      await updateProfile.mutateAsync({ display_name: name.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      const cooldown = e instanceof Error && e.message === "display_name_cooldown";
      Alert.alert(t("common.error"), cooldown ? t("account.name.cooldown") : t("common.error"));
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

  const busyPhoto = changeAvatar.isPending || removeAvatar.isPending;

  return (
    <SettingsScreen title={t("account.title")}>
      {/* Profilbild och cirkelfärger */}
      <View style={s.profile}>
        <View>
          <Avatar size={96} uri={avatarUrl} name={displayName || user?.email || ""} color={circleColor} />
          {busyPhoto && <View style={s.busy}><ActivityIndicator color="#FFFFFF" /></View>}
        </View>
        <Text style={s.name} numberOfLines={1}>{displayName}</Text>

        {/* Kameran längst till vänster, sedan färgerna (som försvinner om du har en bild) */}
        <View style={s.rings}>
          <CameraRing size={CAMERA_RING} onPress={addPhoto} disabled={busyPhoto} label={t("account.photo.choose")} />
          {!avatarUrl && CIRCLE_COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[s.ring, { backgroundColor: c }, circleColor === c && { borderColor: colors.gold, borderWidth: 2 }]}
              onPress={() => updateProfile.mutate({ circle_color: c })}
              accessibilityLabel={t("account.photo.circleColor")}
            />
          ))}
        </View>
        {avatarUrl ? (
          <TouchableOpacity onPress={() => removeAvatar.mutate()} hitSlop={8}>
            <Text style={s.removeText}>{t("account.photo.remove")}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Kontouppgifter: namn (går att ändra) och födelsedatum + e-post (låsta) */}
      <View>
        <Text style={s.sectionLabel}>{t("account.details")}</Text>
        <GradientCard>
          <View style={s.cardBody}>
            {/* Namnfältet är en tydlig ruta; pennan sätter markören i den, och ramen blir guld när den är vald */}
            <View style={[s.nameField, nameFocused && s.nameFieldFocused, nameLocked && { opacity: 0.6 }]}>
              <TextInput
                ref={nameInput}
                style={s.nameInput}
                value={name}
                onChangeText={setName}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                editable={!nameLocked}
                selectTextOnFocus
                maxLength={40}
                autoCapitalize="words"
                placeholder={t("account.name.placeholder")}
                placeholderTextColor={colors.faint}
              />
              {nameLocked ? (
                <Lock size={16} color={colors.faint} strokeWidth={1.8} />
              ) : (
                <TouchableOpacity onPress={() => nameInput.current?.focus()} hitSlop={12} accessibilityLabel={t("account.name.placeholder")}>
                  <Pencil size={17} color={colors.goldText} strokeWidth={1.8} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={s.hint}>
              {nameLocked && nextNameChange
                ? t("account.name.nextChange", { date: formatDate(nextNameChange, "d MMMM yyyy") })
                : t("account.name.hint")}
            </Text>
            {!nameLocked && nameChanged && (
              <QuietButton label={t("account.name.save")} onPress={saveName} loading={updateProfile.isPending} />
            )}

            {profile?.birth_date ? (
              <View style={[s.row, s.detailRow]}>
                <Calendar size={16} color={colors.faint} strokeWidth={1.7} />
                <Text style={s.value}>{formatDate(profile.birth_date, "d MMMM yyyy")}</Text>
                <Lock size={16} color={colors.faint} strokeWidth={1.8} />
              </View>
            ) : (
              <View style={[s.detailRow, { gap: 10 }]}>
                <View style={s.dateRow}>
                  <TextInput style={[s.input, s.dateInput]} value={birthDay} onChangeText={setBirthDay} placeholder={t("account.about.day")} placeholderTextColor={colors.faint} keyboardType="number-pad" maxLength={2} />
                  <TextInput style={[s.input, s.dateInput]} value={birthMonth} onChangeText={setBirthMonth} placeholder={t("account.about.month")} placeholderTextColor={colors.faint} keyboardType="number-pad" maxLength={2} />
                  <TextInput style={[s.input, s.dateInputYear]} value={birthYear} onChangeText={setBirthYear} placeholder={t("account.about.year")} placeholderTextColor={colors.faint} keyboardType="number-pad" maxLength={4} />
                </View>
                <Text style={s.hint}>{t("account.about.birthDateHint")}</Text>
                {birthComplete && <QuietButton label={t("account.about.saveBirthDate")} onPress={saveBirthDate} loading={updateProfile.isPending} />}
              </View>
            )}

            <View style={s.row}>
              <Mail size={16} color={colors.faint} strokeWidth={1.7} />
              <Text style={s.value} numberOfLines={1}>{user?.email ?? ""}</Text>
              <Lock size={16} color={colors.faint} strokeWidth={1.8} />
            </View>
          </View>
        </GradientCard>
      </View>

      {/* Lösenord */}
      <GradientCard>
        <TouchableOpacity style={[s.cardBody, s.row]} activeOpacity={0.7} onPress={() => setPwOpen((open) => !open)}>
          <Text style={s.label}>{t("account.password.change")}</Text>
          <View style={{ flex: 1 }} />
          {pwOpen ? <ChevronUp size={18} color={colors.faint} strokeWidth={2} /> : <ChevronDown size={18} color={colors.faint} strokeWidth={2} />}
        </TouchableOpacity>
        {pwOpen && (
          <View style={[s.cardBody, { paddingTop: 0 }]}>
            <TextInput style={s.input} value={newPw} onChangeText={setNewPw} secureTextEntry autoCapitalize="none" placeholder={t("account.password.newPassword")} placeholderTextColor={colors.faint} />
            <TextInput style={s.input} value={confPw} onChangeText={setConfPw} secureTextEntry autoCapitalize="none" placeholder={t("account.password.confirm")} placeholderTextColor={colors.faint} />
            <QuietButton label={t("account.password.update")} onPress={changePassword} disabled={!newPw || !confPw} loading={pwBusy} />
          </View>
        )}
      </GradientCard>

      {/* Bor du på Österlen? */}
      <GradientCard>
        <View style={[s.cardBody, s.row]}>
          <Text style={s.label}>{t("account.about.lives")}</Text>
          <View style={{ flex: 1 }} />
          <IconSwitch
            value={profile?.lives_in_osterlen === true}
            onChange={(value) => updateProfile.mutate({ lives_in_osterlen: value })}
          />
        </View>
      </GradientCard>

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

const styles = StyleSheet.create({
  cameraIcon: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
});

const createStyles = (c: ThemeColors) => StyleSheet.create({
  profile: { alignItems: "center", gap: 10, paddingVertical: 4 },
  busy: {
    ...StyleSheet.absoluteFillObject, borderRadius: 48, backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  name: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 24, color: c.text, marginTop: 4 },
  rings: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9 },
  ring: { width: COLOR_RING, height: COLOR_RING, borderRadius: COLOR_RING / 2, borderWidth: 1, borderColor: c.borderStrong },
  removeText: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: c.danger },

  cardBody: { padding: 16, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.6, color: c.muted,
    paddingLeft: 6, marginBottom: 8, textTransform: "uppercase",
  },
  detailRow: { marginTop: 6 },
  label: { fontFamily: "Inter_500Medium", fontSize: 15, color: c.text },
  value: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 15, color: c.muted },
  nameField: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12, backgroundColor: c.raised, borderWidth: 1, borderColor: c.borderStrong,
  },
  nameFieldFocused: { borderColor: c.gold },
  // fontSize över 16 hindrar iOS från att zooma in vid fokus
  nameInput: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 18, color: c.text, paddingVertical: 4 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12.5, lineHeight: 18, color: c.muted },
  input: {
    fontFamily: "Inter_400Regular", fontSize: 16, color: c.text, backgroundColor: c.raised,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong,
  },

  dateRow: { flexDirection: "row", gap: 10 },
  dateInput: { flex: 1, textAlign: "center" },
  dateInputYear: { flex: 1.6, textAlign: "center" },

  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  deleteText: { fontFamily: "Montserrat_500Medium", fontSize: 13.5, letterSpacing: -0.3, color: c.danger },
});
