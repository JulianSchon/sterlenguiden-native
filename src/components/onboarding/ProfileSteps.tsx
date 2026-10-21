/**
 * Stegen om personen: namn, användarnamn, födelsedag och var man bor. Svaren hålls av flödet
 * (app/(auth)/signup.tsx) och sparas på servern först när hela onboardingen är klar.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, TurboModuleRegistry, View } from "react-native";
import { Check, House, Luggage, User } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { AuthButton, AuthField, FieldNote } from "@/components/auth/AuthParts";
import { StepLayout } from "./StepLayout";
import { USERNAME_PATTERN, usernameTaken } from "@/lib/onboarding";
import { MIN_AGE, ageOn, toIsoDate } from "@/lib/birthDate";
import { formatDate } from "@/i18n/dates";
import { currentLanguage } from "@/i18n";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

// ── Namn ─────────────────────────────────────────────────────────────────────

export function NameStep({
  first, last, onChange, onSubmit,
}: {
  first: string; last: string; onChange: (first: string, last: string) => void; onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const lastRef = useRef<TextInput>(null);
  const ok = first.trim().length > 0 && last.trim().length > 0;
  return (
    <StepLayout
      title={t("onboarding.name.title")}
      subtitle={t("onboarding.name.subtitle")}
      footer={<AuthButton label={t("onboarding.next")} onPress={onSubmit} disabled={!ok} />}
    >
      <AuthField
        icon={User}
        value={first}
        onChangeText={(v) => onChange(v, last)}
        placeholder={t("onboarding.name.first")}
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="given-name"
        textContentType="givenName"
        returnKeyType="next"
        onSubmitEditing={() => lastRef.current?.focus()}
        submitBehavior="submit"
        autoFocus={!first}
      />
      <AuthField
        ref={lastRef}
        icon={User}
        value={last}
        onChangeText={(v) => onChange(first, v)}
        placeholder={t("onboarding.name.last")}
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="family-name"
        textContentType="familyName"
        returnKeyType="done"
        onSubmitEditing={() => ok && onSubmit()}
        autoFocus={!!first && !last}
      />
    </StepLayout>
  );
}

// ── Användarnamn ─────────────────────────────────────────────────────────────

export function UsernameStep({
  username, onChange, onSubmit, error,
}: {
  username: string; onChange: (v: string) => void; onSubmit: () => void;
  /** Från sparandet i slutet: namnet hann bli upptaget */
  error: string | null;
}) {
  const { t } = useTranslation();
  const valid = USERNAME_PATTERN.test(username);
  // Ledigt? Kontrolleras en kort stund efter att man slutat skriva (null = vet inte än)
  const [free, setFree] = useState<{ name: string; free: boolean | null } | null>(null);
  useEffect(() => {
    if (!valid) return;
    let alive = true;
    const timer = setTimeout(async () => {
      const taken = await usernameTaken(username);
      if (alive) setFree({ name: username, free: taken === null ? null : !taken });
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [username, valid]);
  const known = free?.name === username ? free.free : undefined;
  const ok = valid && known !== false;

  let note: { text: string; tone: "muted" | "danger" | "success" } = { text: t("onboarding.username.rules"), tone: "muted" };
  if (username.length > 0 && !/^[a-zA-Z0-9_.]*$/.test(username)) note = { text: t("onboarding.username.invalid"), tone: "danger" };
  else if (valid && known === true) note = { text: t("onboarding.username.free"), tone: "success" };
  else if (valid && known === false) note = { text: t("onboarding.username.taken"), tone: "danger" };
  if (error && known !== true) note = { text: error, tone: "danger" };

  return (
    <StepLayout
      title={t("onboarding.username.title")}
      subtitle={t("onboarding.username.subtitle")}
      footer={<AuthButton label={t("onboarding.next")} onPress={onSubmit} disabled={!ok} />}
    >
      <AuthField
        prefix="@"
        value={username}
        onChangeText={(v) => onChange(v.replace(/\s/g, "").toLowerCase().slice(0, 20))}
        placeholder={t("onboarding.username.placeholder")}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username-new"
        textContentType="username"
        returnKeyType="done"
        onSubmitEditing={() => ok && onSubmit()}
        autoFocus
        invalid={note.tone === "danger"}
      />
      <FieldNote text={note.text} tone={note.tone} />
    </StepLayout>
  );
}

// ── Födelsedag ───────────────────────────────────────────────────────────────

/** Telefonens datumväljare finns i appbygget (på Android måste modulen finnas innan den läses in) */
const NATIVE_PICKER = Platform.OS === "ios" || !!TurboModuleRegistry.get("RNCDatePicker");
const picker = NATIVE_PICKER
  ? (require("@react-native-community/datetimepicker") as typeof import("@react-native-community/datetimepicker"))
  : null;

const PICKER_LOCALE = { sv: "sv-SE", en: "en-GB", de: "de-DE" } as const;
/** Där hjulen står innan man valt */
const START = new Date(1985, 5, 15);
const OLDEST = new Date(1910, 0, 1);

const isoOf = (d: Date) => toIsoDate(String(d.getDate()), String(d.getMonth() + 1), String(d.getFullYear()));
const dateOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export function BirthdayStep({
  value, onChange, onSubmit,
}: {
  value: string | null; onChange: (iso: string) => void; onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const s = useThemedStyles(createStyles);
  const today = useMemo(() => new Date(), []);
  const age = value ? ageOn(value) : null;
  const tooYoung = age !== null && age < MIN_AGE;

  const pick = (date: Date | undefined) => {
    if (!date) return;
    const iso = isoOf(date);
    if (iso && iso !== value) {
      Haptics.selectionAsync().catch(() => {});
      onChange(iso);
    }
  };

  const openAndroid = () => {
    picker?.DateTimePickerAndroid.open({
      value: value ? dateOf(value) : START,
      mode: "date",
      display: "spinner",
      maximumDate: today,
      minimumDate: OLDEST,
      onChange: (event, date) => { if (event.type === "set") pick(date); },
    });
  };

  return (
    <StepLayout
      title={t("onboarding.birthday.title")}
      subtitle={t("onboarding.birthday.subtitle")}
      footer={<AuthButton label={t("onboarding.next")} onPress={onSubmit} disabled={!value || tooYoung} />}
    >
      <Pressable style={s.dateCard} onPress={Platform.OS === "android" && picker ? openAndroid : undefined} disabled={Platform.OS !== "android"}>
        <Text style={[s.date, !value && { color: colors.faint }]}>
          {value ? formatDate(dateOf(value), "d MMMM yyyy") : t("onboarding.birthday.pick")}
        </Text>
        {age !== null ? <Text style={s.age}>{t("onboarding.birthday.age", { count: age })}</Text> : null}
      </Pressable>

      {Platform.OS === "ios" && picker ? (
        <picker.default
          value={value ? dateOf(value) : START}
          mode="date"
          display="spinner"
          maximumDate={today}
          minimumDate={OLDEST}
          locale={PICKER_LOCALE[currentLanguage()]}
          themeVariant={scheme}
          textColor={colors.text}
          onChange={(_e, date) => pick(date)}
          style={s.wheel}
        />
      ) : null}
      {!picker ? <TypedDate value={value} onChange={onChange} /> : null}

      {tooYoung ? (
        <FieldNote tone="danger" text={t("onboarding.birthday.tooYoung", { age: MIN_AGE })} />
      ) : (
        <FieldNote text={t("onboarding.birthday.locked")} />
      )}
    </StepLayout>
  );
}

/** Reserv utan telefonens datumväljare: dag, månad och år som siffror */
function TypedDate({ value, onChange }: { value: string | null; onChange: (iso: string) => void }) {
  const { t } = useTranslation();
  const s = useThemedStyles(createStyles);
  const [y0, m0, d0] = value ? value.split("-") : ["", "", ""];
  const [day, setDay] = useState(d0 ? String(Number(d0)) : "");
  const [month, setMonth] = useState(m0 ? String(Number(m0)) : "");
  const [year, setYear] = useState(y0);
  useEffect(() => {
    const iso = toIsoDate(day, month, year);
    if (iso && iso !== value) onChange(iso);
  }, [day, month, year]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={s.typedRow}>
      <View style={{ flex: 1 }}><AuthField value={day} onChangeText={setDay} placeholder={t("account.about.day")} keyboardType="number-pad" maxLength={2} /></View>
      <View style={{ flex: 1 }}><AuthField value={month} onChangeText={setMonth} placeholder={t("account.about.month")} keyboardType="number-pad" maxLength={2} /></View>
      <View style={{ flex: 1.4 }}><AuthField value={year} onChangeText={setYear} placeholder={t("account.about.year")} keyboardType="number-pad" maxLength={4} /></View>
    </View>
  );
}

// ── Var man bor ──────────────────────────────────────────────────────────────

export function HomeStep({
  lives, city, towns, onChange, onSubmit,
}: {
  lives: boolean | null;
  city: string;
  /** Orterna på Österlen som finns i appen */
  towns: string[];
  onChange: (lives: boolean | null, city: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const s = useThemedStyles(createStyles);
  const isListed = towns.some((town) => town.toLowerCase() === city.trim().toLowerCase());
  // "Annan ort" på Österlen: ett eget fält i stället för en ort i listan
  const [otherTown, setOtherTown] = useState(lives === true && city.length > 0 && !isListed);
  const ok = lives !== null && city.trim().length >= 2;

  const choose = (next: boolean) => {
    if (next === lives) return;
    Haptics.selectionAsync().catch(() => {});
    setOtherTown(false);
    onChange(next, "");
  };

  return (
    <StepLayout
      scroll
      title={t("onboarding.home.title")}
      subtitle={t("onboarding.home.subtitle")}
      footer={<AuthButton label={t("onboarding.next")} onPress={onSubmit} disabled={!ok} />}
    >
      <View style={s.choices}>
        <Choice icon={House} title={t("onboarding.home.here")} sub={t("onboarding.home.hereSub")} selected={lives === true} onPress={() => choose(true)} />
        <Choice icon={Luggage} title={t("onboarding.home.away")} sub={t("onboarding.home.awaySub")} selected={lives === false} onPress={() => choose(false)} />
      </View>

      {lives === true ? (
        <View style={s.townBlock}>
          <Text style={s.label}>{t("onboarding.home.whichTown")}</Text>
          <View style={s.chips}>
            {towns.map((town) => (
              <Chip
                key={town}
                label={town}
                selected={!otherTown && city.trim().toLowerCase() === town.toLowerCase()}
                onPress={() => { setOtherTown(false); onChange(true, town); }}
              />
            ))}
            <Chip label={t("onboarding.home.otherTown")} selected={otherTown} onPress={() => { setOtherTown(true); onChange(true, ""); }} />
          </View>
          {otherTown ? (
            <AuthField
              value={city}
              onChangeText={(v) => onChange(true, v)}
              placeholder={t("onboarding.home.townPlaceholder")}
              autoCapitalize="words"
              autoComplete="postal-address-locality"
              textContentType="addressCity"
              returnKeyType="done"
              onSubmitEditing={() => ok && onSubmit()}
              autoFocus
            />
          ) : null}
        </View>
      ) : null}

      {lives === false ? (
        <View style={s.townBlock}>
          <Text style={s.label}>{t("onboarding.home.whereFrom")}</Text>
          <AuthField
            value={city}
            onChangeText={(v) => onChange(false, v)}
            placeholder={t("onboarding.home.cityPlaceholder")}
            autoCapitalize="words"
            autoComplete="postal-address-locality"
            textContentType="addressCity"
            returnKeyType="done"
            onSubmitEditing={() => ok && onSubmit()}
            autoFocus
          />
        </View>
      ) : null}
    </StepLayout>
  );
}

function Choice({ icon: Icon, title, sub, selected, onPress }: {
  icon: typeof House; title: string; sub: string; selected: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.choice, selected && s.choiceOn, pressed && { opacity: 0.8 }]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={[s.choiceIcon, selected && { backgroundColor: colors.goldSoft }]}>
        <Icon size={22} color={selected ? colors.goldText : colors.muted} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.choiceTitle}>{title}</Text>
        <Text style={s.choiceSub}>{sub}</Text>
      </View>
      <View style={[s.radio, selected && { backgroundColor: colors.gold, borderColor: colors.gold }]}>
        {selected ? <Check size={14} color={colors.onGold} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const s = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      style={({ pressed }) => [s.chip, selected && s.chipOn, pressed && { opacity: 0.8 }]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text style={[s.chipText, selected && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  dateCard: {
    alignItems: "center", gap: 4, paddingVertical: 18, borderRadius: 18,
    backgroundColor: c.raised, borderWidth: 1.5, borderColor: c.borderStrong,
  },
  date: { fontFamily: "Montserrat_700Bold", fontSize: 24, letterSpacing: -0.4, color: c.text },
  age: { fontFamily: "Inter_500Medium", fontSize: 14.5, color: c.muted },
  wheel: { height: 216, alignSelf: "stretch" },
  typedRow: { flexDirection: "row", gap: 10 },

  choices: { gap: 12 },
  choice: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 18,
    backgroundColor: c.raised, borderWidth: 1.5, borderColor: c.borderStrong,
  },
  choiceOn: { borderColor: c.gold },
  choiceIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.fill, alignItems: "center", justifyContent: "center" },
  choiceTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16.5, color: c.text },
  choiceSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: c.muted, marginTop: 2 },
  radio: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: c.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  townBlock: { gap: 14, marginTop: 14 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 13, letterSpacing: 1.2, textTransform: "uppercase", color: c.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 16, height: 42, borderRadius: 21, justifyContent: "center",
    backgroundColor: c.raised, borderWidth: 1.5, borderColor: c.borderStrong,
  },
  chipOn: { backgroundColor: c.gold, borderColor: c.gold },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 15, color: c.text },
  chipTextOn: { color: c.onGold, fontFamily: "Inter_600SemiBold" },
});
