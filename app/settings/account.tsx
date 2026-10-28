/**
 * Inställningar › Konto: profilbild med cirkelfärger, sedan uppgifterna rad för rad (en liten rubrik
 * över värdet): namn och användarnamn (går att ändra en gång i månaden), e-post och födelsedatum
 * (låsta), hemort och intressen, lösenord. Raderna med pil öppnar en panel där värdet ändras; ett
 * lås betyder att det inte går att ändra. Längst ner raderas kontot.
 *
 * Kortfotot på baksidan av medlemskortet hör till Österlenpasset, inte hit.
 */
import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Pressable, Alert,
  ActivityIndicator, StyleSheet, useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { addDays } from "date-fns";
import Svg, { Circle } from "react-native-svg";
import { AtSign, Cake, Camera, KeyRound, Lock, Mail, MapPin, ThumbsUp, Trash2, User } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { usePhotoMenu } from "@/hooks/usePhotoMenu";
import { useChangeAvatar, useRemoveAvatar, useUpdateProfile, useDeleteAccount } from "@/hooks/useAccount";
import { formatDate } from "@/i18n/dates";
import { MIN_AGE, toIsoDate, ageOn } from "@/lib/birthDate";
import { OSTERLEN_TOWNS } from "@/lib/osterlenTowns";
import { categoryLabel, type CategoryId } from "@/theme/categories";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { Sheet, PrimaryButton, useSheetInput } from "@/components/Sheet";
import { passwordChecks } from "@/components/onboarding/AccountSteps";
import { Avatar } from "@/components/profile/Avatar";
import { ringOverflow } from "@/components/profile/AvatarRing";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { isNetworkError } from "@/lib/network";

// Sex färger, tre mörka och tre ljusa om vartannat (mörk cirkel → ljusa bokstäver,
// ljus cirkel → mörka bokstäver; bokstäverna får automatiskt samma nyans som cirkeln).
const CIRCLE_COLORS = ["#1F3A5F", "#C5A059", "#24493A", "#8FB8DE", "#5C2A35", "#D9A5A5"];
const COOLDOWN_DAYS = 30;
const CAMERA_RING = 42;
const COLOR_RING = 34;
/** Panelens luft mot kanterna (Sheet), för att räkna ut ortrutornas bredd */
const SHEET_GUTTER = 20;
const TOWN_GAP = 8;

type Editing = "name" | "username" | "birth" | "home" | "password" | null;

/** När ett värde med månadsspärr kan ändras igen, eller null om det går nu. */
function nextChange(changedAt: string | null | undefined): Date | null {
  if (!changedAt) return null;
  const next = addDays(new Date(changedAt), COOLDOWN_DAYS);
  return next.getTime() > Date.now() ? next : null;
}

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
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const input = useSheetInput();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const avatarUrl = useAvatarUrl();
  const changeAvatar = useChangeAvatar();
  const removeAvatar = useRemoveAvatar();
  const updateProfile = useUpdateProfile();
  const deleteAccount = useDeleteAccount();

  const displayName = profile?.display_name ?? "";
  const username = profile?.username ?? "";
  const circleColor = profile?.circle_color ?? "#2A2A2A";
  const nextNameChange = nextChange(profile?.display_name_changed_at);
  const nextUsernameChange = nextChange(profile?.username_changed_at);

  const [editing, setEditing] = useState<Editing>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [usernameDraft, setUsernameDraft] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [livesDraft, setLivesDraft] = useState(true);
  const [cityDraft, setCityDraft] = useState("");
  const [otherTown, setOtherTown] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confPw, setConfPw] = useState("");
  const [busy, setBusy] = useState(false);

  /** Kameraringen: välj bild eller ta foto (systemets egen meny på iOS). */
  const addPhoto = usePhotoMenu(changeAvatar.mutateAsync, t("account.photo.title"));
  const busyPhoto = changeAvatar.isPending || removeAvatar.isPending;

  const towns = OSTERLEN_TOWNS.map((town) => town.name);
  const townW = Math.floor((width - SHEET_GUTTER * 2 - TOWN_GAP * 2) / 3);
  const interests = ((profile?.interests ?? []) as CategoryId[]).map((id) => categoryLabel(id));
  const homeValue = profile?.city
    ? `${profile.city} · ${t(profile.lives_in_osterlen === false ? "account.home.visiting" : "account.home.living")}`
    : t("account.add");

  const open = (what: Exclude<Editing, null>) => {
    if (what === "name") setNameDraft(displayName);
    if (what === "username") setUsernameDraft(username);
    if (what === "birth") { setBirthDay(""); setBirthMonth(""); setBirthYear(""); }
    if (what === "home") {
      const lives = profile?.lives_in_osterlen !== false;
      const city = profile?.city ?? "";
      setLivesDraft(lives);
      setCityDraft(city);
      setOtherTown(lives && city.length > 0 && !towns.some((town) => town.toLowerCase() === city.toLowerCase()));
    }
    if (what === "password") { setNewPw(""); setConfPw(""); }
    setEditing(what);
  };

  const showCooldown = (date: Date, key: "name" | "username") =>
    Alert.alert(t(`account.${key}.label`), t(`account.${key}.nextChange`, { date: formatDate(date, "d MMMM yyyy") }));

  /** Sparar och stänger panelen. Felen visas med appens egna ord, aldrig serverns. */
  async function save(changes: Parameters<typeof updateProfile.mutateAsync>[0]) {
    setBusy(true);
    try {
      await updateProfile.mutateAsync(changes);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setEditing(null);
    } catch (e) {
      // Utan nät har appen redan sagt det (OfflineNotice)
      if (isNetworkError(e)) return;
      const code = e instanceof Error ? e.message : "";
      const message = code === "display_name_cooldown" ? t("account.name.cooldown")
        : code === "username_cooldown" ? t("account.username.cooldown")
        : code === "username_taken" ? t("account.username.taken")
        : code === "username_invalid" ? t("account.username.invalid")
        : t("common.error");
      Alert.alert(t("common.error"), message);
    } finally {
      setBusy(false);
    }
  }

  function saveBirthDate() {
    const iso = toIsoDate(birthDay, birthMonth, birthYear);
    if (!iso) return Alert.alert(t("common.error"), t("account.about.invalidDate"));
    if (ageOn(iso) < MIN_AGE) return Alert.alert(t("common.error"), t("account.about.tooYoung"));
    Alert.alert(t("account.about.confirmBirthDateTitle"), t("account.about.confirmBirthDateBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.save"), onPress: () => save({ birth_date: iso }) },
    ]);
  }

  async function changePassword() {
    if (newPw !== confPw) return Alert.alert(t("common.error"), t("account.password.mismatch"));
    const rules = passwordChecks(newPw);
    if (!rules.length || !rules.upper || !rules.digit) return Alert.alert(t("common.error"), t("account.password.weak"));
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setBusy(false);
    if (error) {
      // Supabases egna (engelska) felmeddelanden visas aldrig
      const key = error.code === "same_password" ? "same" : error.code === "weak_password" ? "weak" : "failed";
      return Alert.alert(t("common.error"), t(`onboarding.password.${key}`));
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setEditing(null);
    Alert.alert(t("account.password.updated"));
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

  const lock = <Lock size={16} color={colors.faint} strokeWidth={1.8} />;
  const nameOk = nameDraft.trim().length > 1 && nameDraft.trim() !== displayName;
  const usernameOk = usernameDraft.trim().length >= 3 && usernameDraft.trim() !== username;
  const birthOk = !!birthDay && !!birthMonth && birthYear.length === 4;
  const homeOk = cityDraft.trim().length >= 2;

  return (
    <>
      <SettingsScreen title={t("account.title")}>
        {/* Profilbild och cirkelfärger */}
        {/* En profilring sticker ut utanför bilden: lika mycket luft runt den, så den inte hamnar under rubriken */}
        <View style={[s.profile, { paddingVertical: 4 + ringOverflow(profile?.avatar_ring, 96) }]}>
          <View>
            <Avatar size={96} uri={avatarUrl} name={displayName || user?.email || ""} color={circleColor} ring={profile?.avatar_ring} />
            {busyPhoto && <View style={s.busy}><ActivityIndicator color="#FFFFFF" /></View>}
          </View>

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

        <SettingsGroup label={t("account.details")}>
          <SettingsRow
            icon={User}
            eyebrow={t("account.name.label")}
            label={displayName || t("account.add")}
            right={nextNameChange ? lock : undefined}
            onPress={() => (nextNameChange ? showCooldown(nextNameChange, "name") : open("name"))}
          />
          <SettingsRow
            icon={AtSign}
            eyebrow={t("account.username.label")}
            label={username ? `@${username}` : t("account.add")}
            right={nextUsernameChange ? lock : undefined}
            onPress={() => (nextUsernameChange ? showCooldown(nextUsernameChange, "username") : open("username"))}
          />
          <SettingsRow icon={Mail} eyebrow={t("account.email")} label={user?.email ?? ""} right={lock} />
          {profile?.birth_date ? (
            <SettingsRow icon={Cake} eyebrow={t("account.about.birthDate")} label={formatDate(profile.birth_date, "d MMMM yyyy")} right={lock} />
          ) : (
            <SettingsRow icon={Cake} eyebrow={t("account.about.birthDate")} label={t("account.add")} onPress={() => open("birth")} />
          )}
        </SettingsGroup>

        <SettingsGroup label={t("account.aboutYou")}>
          <SettingsRow icon={MapPin} eyebrow={t("account.home.label")} label={homeValue} onPress={() => open("home")} />
          <SettingsRow
            icon={ThumbsUp}
            eyebrow={t("account.interests")}
            label={interests.length ? interests.join(", ") : t("account.add")}
            onPress={() => router.push("/settings/interests")}
          />
        </SettingsGroup>

        <SettingsGroup label={t("account.security")}>
          <SettingsRow icon={KeyRound} eyebrow={t("account.password.label")} label="••••••••" onPress={() => open("password")} />
        </SettingsGroup>

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

      <Sheet visible={editing === "name"} onClose={() => setEditing(null)} title={t("account.name.label")}>
        <View style={s.sheetBody}>
          <TextInput
            style={input}
            value={nameDraft}
            onChangeText={setNameDraft}
            autoFocus
            maxLength={40}
            autoCapitalize="words"
            placeholder={t("account.name.placeholder")}
            placeholderTextColor={colors.faint}
          />
          <Text style={s.hint}>{t("account.name.hint")}</Text>
          <PrimaryButton label={t("common.save")} onPress={() => save({ display_name: nameDraft.trim() })} disabled={!nameOk} loading={busy} />
        </View>
      </Sheet>

      <Sheet visible={editing === "username"} onClose={() => setEditing(null)} title={t("account.username.label")}>
        <View style={s.sheetBody}>
          <View style={[input, s.atField]}>
            <Text style={s.at}>@</Text>
            <TextInput
              style={s.atInput}
              value={usernameDraft}
              onChangeText={(v) => setUsernameDraft(v.replace(/\s/g, ""))}
              autoFocus
              maxLength={20}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t("account.username.placeholder")}
              placeholderTextColor={colors.faint}
            />
          </View>
          <Text style={s.hint}>{t("account.username.hint")}</Text>
          <PrimaryButton label={t("common.save")} onPress={() => save({ username: usernameDraft.trim() })} disabled={!usernameOk} loading={busy} />
        </View>
      </Sheet>

      <Sheet visible={editing === "birth"} onClose={() => setEditing(null)} title={t("account.about.birthDate")}>
        <View style={s.sheetBody}>
          <View style={s.dateRow}>
            <TextInput style={[input, s.dateInput]} value={birthDay} onChangeText={setBirthDay} placeholder={t("account.about.day")} placeholderTextColor={colors.faint} keyboardType="number-pad" maxLength={2} autoFocus />
            <TextInput style={[input, s.dateInput]} value={birthMonth} onChangeText={setBirthMonth} placeholder={t("account.about.month")} placeholderTextColor={colors.faint} keyboardType="number-pad" maxLength={2} />
            <TextInput style={[input, s.dateInputYear]} value={birthYear} onChangeText={setBirthYear} placeholder={t("account.about.year")} placeholderTextColor={colors.faint} keyboardType="number-pad" maxLength={4} />
          </View>
          <Text style={s.hint}>{t("account.about.birthDateHint")}</Text>
          <PrimaryButton label={t("common.save")} onPress={saveBirthDate} disabled={!birthOk} loading={busy} />
        </View>
      </Sheet>

      <Sheet visible={editing === "home"} onClose={() => setEditing(null)} title={t("account.home.label")}>
        <View style={s.sheetBody}>
          {/* Bor man här eller besöker man: två lägen, det valda guldfyllt */}
          <View style={s.segment}>
            {[true, false].map((lives) => {
              const active = livesDraft === lives;
              return (
                <Pressable
                  key={String(lives)}
                  style={[s.segmentItem, active && s.segmentItemActive]}
                  onPress={() => {
                    if (active) return;
                    Haptics.selectionAsync().catch(() => {});
                    setLivesDraft(lives);
                    setCityDraft("");
                    setOtherTown(false);
                  }}
                >
                  <Text style={[s.segmentText, active && { color: colors.onGold }]}>
                    {t(lives ? "onboarding.home.here" : "onboarding.home.away")}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {livesDraft ? (
            <View style={s.towns}>
              {towns.map((town) => {
                const active = !otherTown && cityDraft.toLowerCase() === town.toLowerCase();
                return (
                  <Pressable
                    key={town}
                    style={[s.town, { width: townW }, active && s.townActive]}
                    onPress={() => { setOtherTown(false); setCityDraft(town); }}
                  >
                    <Text style={[s.townText, active && { color: colors.goldText }]} numberOfLines={1}>{town}</Text>
                  </Pressable>
                );
              })}
              <Pressable style={[s.town, { width: "100%" }, otherTown && s.townActive]} onPress={() => { setOtherTown(true); setCityDraft(""); }}>
                <Text style={[s.townText, otherTown && { color: colors.goldText }]}>{t("onboarding.home.otherTown")}</Text>
              </Pressable>
            </View>
          ) : null}

          {!livesDraft || otherTown ? (
            <TextInput
              style={input}
              value={cityDraft}
              onChangeText={setCityDraft}
              autoFocus
              autoCapitalize="words"
              textContentType="addressCity"
              placeholder={t(livesDraft ? "onboarding.home.townPlaceholder" : "onboarding.home.cityPlaceholder")}
              placeholderTextColor={colors.faint}
            />
          ) : null}
          <Text style={s.hint}>{t("onboarding.home.public")}</Text>
          <PrimaryButton label={t("common.save")} onPress={() => save({ lives_in_osterlen: livesDraft, city: cityDraft.trim() })} disabled={!homeOk} loading={busy} />
        </View>
      </Sheet>

      <Sheet visible={editing === "password"} onClose={() => setEditing(null)} title={t("account.password.change")}>
        <View style={s.sheetBody}>
          <TextInput style={input} value={newPw} onChangeText={setNewPw} secureTextEntry autoCapitalize="none" autoFocus placeholder={t("account.password.newPassword")} placeholderTextColor={colors.faint} />
          <TextInput style={input} value={confPw} onChangeText={setConfPw} secureTextEntry autoCapitalize="none" placeholder={t("account.password.confirm")} placeholderTextColor={colors.faint} />
          <Text style={s.hint}>{t("account.password.weak")}</Text>
          <PrimaryButton label={t("account.password.update")} onPress={changePassword} disabled={!newPw || !confPw} loading={busy} />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  cameraIcon: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
});

const createStyles = (c: ThemeColors) => StyleSheet.create({
  profile: { alignItems: "center", gap: 14, paddingVertical: 4 },
  busy: {
    ...StyleSheet.absoluteFillObject, borderRadius: 48, backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  rings: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9 },
  ring: { width: COLOR_RING, height: COLOR_RING, borderRadius: COLOR_RING / 2, borderWidth: 1, borderColor: c.borderStrong },
  removeText: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: c.danger },

  sheetBody: { gap: 12 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12.5, lineHeight: 18, color: c.muted },
  atField: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 0 },
  at: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: c.faint },
  atInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 16, color: c.text, paddingVertical: 12 },
  dateRow: { flexDirection: "row", gap: 10 },
  dateInput: { flex: 1, textAlign: "center" },
  dateInputYear: { flex: 1.6, textAlign: "center" },

  segment: { flexDirection: "row", padding: 4, gap: 4, borderRadius: 16, backgroundColor: c.fill },
  segmentItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 11, borderRadius: 12 },
  segmentItemActive: { backgroundColor: c.gold },
  segmentText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: c.muted },
  towns: { flexDirection: "row", flexWrap: "wrap", gap: TOWN_GAP },
  town: {
    height: 40, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", borderRadius: 12,
    borderWidth: 1, borderColor: c.borderStrong,
  },
  townActive: { borderColor: c.goldBorder, backgroundColor: c.goldSoft },
  townText: { fontFamily: "Inter_500Medium", fontSize: 13, color: c.muted },

  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  deleteText: { fontFamily: "Montserrat_500Medium", fontSize: 13.5, letterSpacing: -0.3, color: c.danger },
});
