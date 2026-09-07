/**
 * Signup-flöde – 6 steg med progress-streck
 *
 * Steg 0: E-post        → tangentbord (email)
 * Steg 1: OTP 6 rutor   → tangentbord (siffror) + 30s resend-timer
 * Steg 2: Lösenord      → kriterier + styrke-bar
 * Steg 3: Namn          → förnamn + efternamn + integritetsnot
 * Steg 4: Ålder         → 3-kolumns datum-hjul (Dag / Månad / År)
 * Steg 5: Plats         → GPS-detektering + manuell fallback
 */

import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  StatusBar,
  ScrollView,
  FlatList,
  Keyboard,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Location from "expo-location";
import { supabase } from "@/integrations/supabase/client";

// ── Design tokens ─────────────────────────────────────────────────────────
const GOLD         = "#C5A059";
const BG           = "#0D0D0D";
const WHITE        = "#FFFFFF";
const FIELD_BORDER = "rgba(255,255,255,0.12)";
const GREEN        = "#4CAF50";
const ORANGE       = "#FF9800";
const RED_C        = "#F44336";
const TOTAL_STEPS  = 6;

// ── Skärmmått ─────────────────────────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get("window");
const CONTENT_W = SCREEN_W - 64; // paddingHorizontal: 32 × 2

// ── Picker-konstanter ─────────────────────────────────────────────────────
const ITEM_H  = 52;
const VISIBLE = 5;

// ── Datum-data ────────────────────────────────────────────────────────────
const currentYear = new Date().getFullYear();
const DAYS   = Array.from({ length: 31 }, (_, i) => String(i + 1));
const MONTHS = ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];
const YEARS  = Array.from({ length: 100 }, (_, i) => String(currentYear - 5 - i));

// ── ScrollPicker ──────────────────────────────────────────────────────────
function ScrollPicker({
  items,
  selectedIndex,
  onSelect,
  width,
}: {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  width: number;
}) {
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    const safe = Math.max(0, Math.min(selectedIndex, items.length - 1));
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: safe, viewOffset: ITEM_H * 2, animated: false });
    }, 120);
  }, []);

  const handleScrollEnd = (e: any) => {
    const y   = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_H);
    onSelect(Math.max(0, Math.min(idx, items.length - 1)));
  };

  return (
    <View style={{ height: ITEM_H * VISIBLE, overflow: "hidden", width }}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(_, i) => String(i)}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * i, index: i })}
        ListHeaderComponent={<View style={{ height: ITEM_H * 2 }} />}
        ListFooterComponent={<View style={{ height: ITEM_H * 2 }} />}
        renderItem={({ item, index }) => {
          const sel = index === selectedIndex;
          return (
            <View style={{ height: ITEM_H, justifyContent: "center", alignItems: "center" }}>
              <Text style={sel ? sp.selected : sp.normal}>{item}</Text>
            </View>
          );
        }}
      />
      <View pointerEvents="none" style={[sp.fade, sp.fadeTop]} />
      <View pointerEvents="none" style={[sp.fade, sp.fadeBottom]} />
    </View>
  );
}

const sp = StyleSheet.create({
  normal:   { fontFamily: "Inter_300Light", fontSize: 18, color: "rgba(255,255,255,0.2)" },
  selected: { fontFamily: "Inter_500Medium", fontSize: 24, color: GOLD },
  fade:       { position: "absolute", left: 0, right: 0, height: ITEM_H * 2, zIndex: 2 },
  fadeTop:    { top: 0,    backgroundColor: BG, opacity: 0.8 },
  fadeBottom: { bottom: 0, backgroundColor: BG, opacity: 0.8 },
});

// ── DatePicker (Dag / Månad / År) ─────────────────────────────────────────
function DatePicker({
  day, month, year,
  onDay, onMonth, onYear,
}: {
  day: number; month: number; year: number;
  onDay: (d: number) => void;
  onMonth: (m: number) => void;
  onYear: (y: number) => void;
}) {
  const colDay   = Math.floor(CONTENT_W * 0.20);
  const colMonth = Math.floor(CONTENT_W * 0.42);
  const colYear  = CONTENT_W - colDay - colMonth;
  const yearIdx  = YEARS.indexOf(String(year));

  return (
    <View style={{ flexDirection: "row", position: "relative" }}>
      {/* Markeringslinjer runt mittrad */}
      <View pointerEvents="none" style={{
        position: "absolute",
        top: ITEM_H * 2,
        left: 0,
        right: 0,
        height: ITEM_H,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: GOLD,
        zIndex: 3,
      }} />
      <ScrollPicker
        items={DAYS}
        selectedIndex={day - 1}
        onSelect={i => onDay(i + 1)}
        width={colDay}
      />
      <ScrollPicker
        items={MONTHS}
        selectedIndex={month}
        onSelect={i => onMonth(i)}
        width={colMonth}
      />
      <ScrollPicker
        items={YEARS}
        selectedIndex={yearIdx >= 0 ? yearIdx : 0}
        onSelect={i => onYear(Number(YEARS[i]))}
        width={colYear}
      />
    </View>
  );
}

// ── Steg-metadata ─────────────────────────────────────────────────────────
const STEP_META = [
  {
    title: "Vilken är din e-post?",
    hint:  "Vi skickar en engångskod till din adress – ha den till hands.",
  },
  {
    title: "Kontrollera din inkorg",
    hint:  "Ange den 6-siffriga koden vi skickade till dig.",
  },
  { title: "Välj ett lösenord",  hint: "" },
  { title: "Vad heter du?",      hint: "" },
  {
    title: "Fyll i din ålder",
    hint:  "Din ålder används för att göra upplevelsen mer personlig.",
  },
  {
    title: "Dela din plats",
    hint:  "Vi använder din plats för att beräkna avstånd och göra appen till just din.",
  },
];

// ── Huvud-komponent ───────────────────────────────────────────────────────
export default function SignupScreen() {
  const [step, setStep]               = useState(0);
  const [email, setEmail]             = useState("");
  const [otp, setOtp]                 = useState(Array(6).fill(""));
  const [password, setPassword]       = useState("");
  const [showPw, setShowPw]           = useState(false);
  const [firstName, setFirstName]     = useState("");
  const [lastName, setLastName]       = useState("");
  const [birthDay, setBirthDay]       = useState(1);
  const [birthMonth, setBirthMonth]   = useState(0);
  const [birthYear, setBirthYear]     = useState(1990);
  const [resendTimer, setResendTimer] = useState(0);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  // Plats
  const [locState, setLocState]                 = useState<"detecting"|"found"|"manual">("detecting");
  const [detectedCity, setDetectedCity]         = useState("");
  const [detectedCountry, setDetectedCountry]   = useState("");
  const [manualCity, setManualCity]             = useState("");
  const [manualCountry, setManualCountry]       = useState("Sverige");

  // Refs
  const emailRef     = useRef<TextInput>(null);
  const passwordRef  = useRef<TextInput>(null);
  const firstNameRef = useRef<TextInput>(null);
  const lastNameRef  = useRef<TextInput>(null);
  const cityRef      = useRef<TextInput>(null);
  const countryRef   = useRef<TextInput>(null);
  const otpRefs      = useRef<(TextInput | null)[]>(Array(6).fill(null));

  // ── Lösenords-kriterier ──────────────────────────────────────────────────
  const pwCriteria = {
    length: password.length >= 8,
    upper:  /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const pwScore = Object.values(pwCriteria).filter(Boolean).length;
  const pwAllOk = pwScore === 3;

  // Knapp grå/aktiv
  const isContinueDisabled =
    loading ||
    (step === 2 && !pwAllOk) ||
    (step === 3 && (!firstName.trim() || !lastName.trim()));

  // Fokus vid stegbyte
  useEffect(() => {
    const t = setTimeout(() => {
      if      (step === 0) emailRef.current?.focus();
      else if (step === 1) otpRefs.current[0]?.focus();
      else if (step === 2) passwordRef.current?.focus();
      else if (step === 3) firstNameRef.current?.focus();
      else if (step === 4 || step === 5) Keyboard.dismiss();
    }, 80);
    return () => clearTimeout(t);
  }, [step]);

  // GPS vid steg 5
  useEffect(() => { if (step === 5) detectLocation(); }, [step]);

  // Resend-timer startar vid steg 1
  useEffect(() => { if (step === 1) setResendTimer(30); }, [step]);
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  // ── GPS ──────────────────────────────────────────────────────────────────
  const detectLocation = async () => {
    setLocState("detecting");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setLocState("manual"); return; }
      const pos  = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geo] = await Location.reverseGeocodeAsync(pos.coords);
      const city    = geo.city || geo.subregion || geo.district || "";
      const country = geo.country || "";
      if (city) { setDetectedCity(city); setDetectedCountry(country); setLocState("found"); }
      else { setLocState("manual"); }
    } catch { setLocState("manual"); }
  };

  // ── OTP ──────────────────────────────────────────────────────────────────
  const handleOtpChange = (text: string, i: number) => {
    const digit = text.replace(/[^0-9]/g, "").slice(-1);
    const next  = [...otp];
    next[i]     = digit;
    setOtp(next);
    setError("");
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
    if (next.filter(Boolean).length === 6) verifyOtp(next.join(""));
  };

  const handleOtpBack = (e: any, i: number) => {
    if (e.nativeEvent.key === "Backspace" && !otp[i] && i > 0)
      otpRefs.current[i - 1]?.focus();
  };

  const verifyOtp = async (token: string) => {
    setLoading(true);
    setError("");
    try {
      const { error: e } = await supabase.auth.verifyOtp({ email, token, type: "email" });
      if (e) throw e;
      setStep(2);
    } catch {
      setError("Fel kod – kontrollera och försök igen.");
      setOtp(Array(6).fill(""));
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    setOtp(Array(6).fill(""));
    setError("Ny kod skickad!");
    setResendTimer(30);
  };

  // ── Fortsätt per steg ────────────────────────────────────────────────────
  const handleContinue = async () => {
    setError("");
    switch (step) {
      case 0:
        if (!/.+@.+\..+/.test(email.trim())) { setError("Ange en giltig e-postadress."); return; }
        setLoading(true);
        try {
          const { error: e } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: { shouldCreateUser: true },
          });
          if (e) throw e;
          setStep(1);
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
        break;

      case 1:
        verifyOtp(otp.join(""));
        break;

      case 2:
        if (!pwAllOk) return;
        setLoading(true);
        try {
          const { error: e } = await supabase.auth.updateUser({ password });
          if (e) throw e;
          setStep(3);
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
        break;

      case 3:
        if (!firstName.trim() || !lastName.trim()) { setError("Fyll i både för- och efternamn."); return; }
        setStep(4);
        break;

      case 4:
        setStep(5);
        break;

      case 5: {
        const city    = locState === "found" ? detectedCity    : manualCity.trim();
        const country = locState === "found" ? detectedCountry : manualCountry.trim();
        if (!city) { setError("Ange din stad."); return; }
        setLoading(true);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error("Inte inloggad");
          await supabase.from("profiles").upsert({
            user_id:      user.id,
            display_name: `${firstName.trim()} ${lastName.trim()}`,
            birth_year:   birthYear,
            city,
            country,
          });
          router.replace("/(tabs)");
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
        break;
      }
    }
  };

  const goBack = () => {
    setError("");
    step === 0 ? router.back() : setStep(s => s - 1);
  };

  // ── Render per steg ───────────────────────────────────────────────────────
  const renderStepContent = () => {
    switch (step) {

      // ── E-post ──────────────────────────────────────────────────────────
      case 0:
        return (
          <View style={s.field}>
            <Ionicons name="mail-outline" size={17} color="rgba(255,255,255,0.3)" style={s.fieldIcon} />
            <TextInput
              ref={emailRef}
              style={s.fieldInput}
              placeholder="din@email.se"
              placeholderTextColor="rgba(255,255,255,0.28)"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor={GOLD}
              value={email}
              onChangeText={v => { setError(""); setEmail(v); }}
              returnKeyType="done"
              onSubmitEditing={handleContinue}
            />
          </View>
        );

      // ── OTP ─────────────────────────────────────────────────────────────
      case 1:
        return (
          <View>
            <Text style={s.otpHint}>
              Koden skickades till{" "}
              <Text style={{ color: WHITE }}>{email}</Text>
              {"  "}
              <Text style={s.otpChangeEmail} onPress={() => setStep(0)}>Ändra</Text>
            </Text>
            <View style={s.otpRow}>
              {otp.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={el => { otpRefs.current[i] = el; }}
                  style={[s.otpBox, digit ? s.otpBoxFilled : null]}
                  value={digit}
                  onChangeText={t => handleOtpChange(t, i)}
                  onKeyPress={e => handleOtpBack(e, i)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectionColor={GOLD}
                />
              ))}
            </View>
            <TouchableOpacity
              onPress={resendTimer === 0 ? handleResend : undefined}
              disabled={resendTimer > 0}
              style={s.resendRow}
            >
              <Text style={[s.resendText, resendTimer > 0 && s.resendDisabled]}>
                {resendTimer > 0 ? `Skicka en ny kod (${resendTimer}s)` : "Skicka en ny kod"}
              </Text>
            </TouchableOpacity>
          </View>
        );

      // ── Lösenord med styrke-indikatorer ─────────────────────────────────
      case 2:
        return (
          <View>
            <View style={s.field}>
              <Ionicons name="lock-closed-outline" size={17} color="rgba(255,255,255,0.3)" style={s.fieldIcon} />
              <TextInput
                ref={passwordRef}
                style={s.fieldInput}
                placeholder="Ditt lösenord"
                placeholderTextColor="rgba(255,255,255,0.28)"
                secureTextEntry={!showPw}
                selectionColor={GOLD}
                value={password}
                onChangeText={v => { setError(""); setPassword(v); }}
                returnKeyType="done"
                onSubmitEditing={handleContinue}
              />
              <TouchableOpacity onPress={() => setShowPw(p => !p)} style={s.eyeBtn}>
                <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={19} color="rgba(255,255,255,0.35)" />
              </TouchableOpacity>
            </View>

            {/* Styrke-bar */}
            <View style={s.pwBar}>
              {[0, 1, 2].map(i => (
                <View
                  key={i}
                  style={[s.pwBarSeg, {
                    backgroundColor:
                      i < pwScore
                        ? pwScore === 1 ? RED_C
                        : pwScore === 2 ? ORANGE
                        : GREEN
                        : "rgba(255,255,255,0.1)",
                  }]}
                />
              ))}
            </View>

            {/* Kriterier */}
            <View style={s.pwCriteria}>
              {[
                { ok: pwCriteria.length, label: "Minst 8 tecken" },
                { ok: pwCriteria.upper,  label: "Minst en stor bokstav" },
                { ok: pwCriteria.number, label: "Minst en siffra" },
              ].map(({ ok, label }) => (
                <View key={label} style={s.pwRow}>
                  <Ionicons
                    name={ok ? "checkmark-circle" : "ellipse-outline"}
                    size={16}
                    color={ok ? GREEN : "rgba(255,255,255,0.3)"}
                  />
                  <Text style={[s.pwLabel, ok && { color: GREEN }]}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        );

      // ── Namn – förnamn + efternamn ───────────────────────────────────────
      case 3:
        return (
          <View>
            <View style={[s.field, { marginBottom: 20 }]}>
              <TextInput
                ref={firstNameRef}
                style={s.fieldInput}
                placeholder="Förnamn"
                placeholderTextColor="rgba(255,255,255,0.28)"
                autoCapitalize="words"
                autoCorrect={false}
                selectionColor={GOLD}
                value={firstName}
                onChangeText={v => { setError(""); setFirstName(v); }}
                returnKeyType="next"
                onSubmitEditing={() => lastNameRef.current?.focus()}
              />
            </View>
            <View style={s.field}>
              <TextInput
                ref={lastNameRef}
                style={s.fieldInput}
                placeholder="Efternamn"
                placeholderTextColor="rgba(255,255,255,0.28)"
                autoCapitalize="words"
                autoCorrect={false}
                selectionColor={GOLD}
                value={lastName}
                onChangeText={v => { setError(""); setLastName(v); }}
                returnKeyType="done"
                onSubmitEditing={handleContinue}
              />
            </View>
            <View style={s.privacyRow}>
              <Ionicons name="lock-closed" size={13} color="rgba(255,255,255,0.3)" />
              <Text style={s.privacyText}>
                Ditt namn är enbart synligt för dig och används för att verifiera ditt medlemskap.
              </Text>
            </View>
          </View>
        );

      // ── Ålder – 3-kolumns datum-hjul ────────────────────────────────────
      case 4:
        return (
          <DatePicker
            day={birthDay}
            month={birthMonth}
            year={birthYear}
            onDay={setBirthDay}
            onMonth={setBirthMonth}
            onYear={setBirthYear}
          />
        );

      // ── Plats – GPS + manuell ────────────────────────────────────────────
      case 5:
        if (locState === "detecting") {
          return (
            <View style={s.locCenter}>
              <ActivityIndicator color={GOLD} size="large" />
              <Text style={s.locHint}>Hittar din plats…</Text>
            </View>
          );
        }

        if (locState === "found") {
          return (
            <View style={s.locFound}>
              <Ionicons name="location" size={28} color={GOLD} />
              <Text style={s.locCity}>{detectedCity}</Text>
              <Text style={s.locCountry}>{detectedCountry}</Text>
              <Text style={s.locQuestion}>Stämmer det?</Text>
              <View style={s.locBtns}>
                <TouchableOpacity style={s.locBtnYes} onPress={handleContinue}>
                  <Text style={s.locBtnYesText}>Ja, det stämmer</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.locBtnNo} onPress={() => setLocState("manual")}>
                  <Text style={s.locBtnNoText}>Ange manuellt</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }

        return (
          <View>
            <Text style={s.fieldLabel}>STAD</Text>
            <View style={s.field}>
              <Ionicons name="business-outline" size={17} color="rgba(255,255,255,0.3)" style={s.fieldIcon} />
              <TextInput
                ref={cityRef}
                style={s.fieldInput}
                placeholder="t.ex. Ystad"
                placeholderTextColor="rgba(255,255,255,0.28)"
                autoCapitalize="words"
                selectionColor={GOLD}
                value={manualCity}
                onChangeText={v => { setError(""); setManualCity(v); }}
                returnKeyType="next"
                onSubmitEditing={() => countryRef.current?.focus()}
              />
            </View>
            <Text style={[s.fieldLabel, { marginTop: 24 }]}>LAND</Text>
            <View style={s.field}>
              <Ionicons name="globe-outline" size={17} color="rgba(255,255,255,0.3)" style={s.fieldIcon} />
              <TextInput
                ref={countryRef}
                style={s.fieldInput}
                placeholder="t.ex. Sverige"
                placeholderTextColor="rgba(255,255,255,0.28)"
                autoCapitalize="words"
                selectionColor={GOLD}
                value={manualCountry}
                onChangeText={v => { setError(""); setManualCountry(v); }}
                returnKeyType="done"
                onSubmitEditing={handleContinue}
              />
            </View>
          </View>
        );
    }
  };

  const showContinueBtn = step !== 1 && !(step === 5 && locState === "found");

  const btnLabel = () => {
    if (loading) return "Laddar…";
    if (step === 0) return "Skicka kod";
    if (step === 5) return "Kom igång";
    return "Fortsätt";
  };

  return (
    <View style={s.bg}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={s.kav}
        >
          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="none"
          >
            {/* ── Topbar: pil + progress-streck ── */}
            <View style={s.topbar}>
              <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={s.backBtn}>
                <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
              <View style={s.dots}>
                {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                  <View
                    key={i}
                    style={[s.dot, i < step && s.dotDone, i === step && s.dotActive]}
                  />
                ))}
              </View>
              <View style={s.backPlaceholder} />
            </View>

            {/* ── Rubrik ── */}
            <View style={s.header}>
              <Text style={s.title}>{STEP_META[step].title}</Text>
              {!!STEP_META[step].hint && (
                <Text style={s.hint}>{STEP_META[step].hint}</Text>
              )}
            </View>

            {/* ── Steginnehåll ── */}
            <View style={s.stepContent}>
              {renderStepContent()}
              {!!error && <Text style={s.errorText}>{error}</Text>}
            </View>
          </ScrollView>

          {/* ── Fortsätt-knapp ── */}
          {showContinueBtn && (
            <View style={s.btnWrapper}>
              <TouchableOpacity
                style={[s.btn, isContinueDisabled && s.disabled]}
                onPress={handleContinue}
                disabled={isContinueDisabled}
                activeOpacity={0.85}
              >
                <Text style={s.btnText}>{btnLabel()}</Text>
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ── Stilar ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  bg:   { flex: 1, backgroundColor: BG },
  safe: { flex: 1 },
  kav:  { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 32, paddingTop: 20, paddingBottom: 40 },

  /* Topbar */
  topbar:          { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 36 },
  backBtn:         { padding: 4, width: 30 },
  backPlaceholder: { width: 30 },
  dots: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  dot:       { height: 3, width: 20, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.15)" },
  dotDone:   { backgroundColor: GOLD, opacity: 0.5 },
  dotActive: { width: 32, backgroundColor: GOLD, opacity: 1 },

  /* Rubrik */
  header: { marginBottom: 32 },
  title: {
    fontFamily: "PlayfairDisplay_400Regular",
    fontSize: 26,
    color: WHITE,
    lineHeight: 34,
    marginBottom: 8,
  },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.45)",
    lineHeight: 20,
  },

  /* Steginnehåll */
  stepContent: { marginBottom: 24 },

  /* Fält – understreck-stil */
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: FIELD_BORDER,
    paddingBottom: 10,
    paddingTop: 4,
  },
  fieldIcon:  { marginRight: 12 },
  fieldInput: { flex: 1, fontSize: 17, fontFamily: "Inter_300Light", color: WHITE },
  eyeBtn:     { padding: 4 },
  fieldLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    letterSpacing: 2,
    color: "rgba(255,255,255,0.35)",
    marginBottom: 8,
  },

  /* OTP */
  otpHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.45)",
    marginBottom: 28,
    lineHeight: 22,
  },
  otpChangeEmail: {
    color: GOLD,
    textDecorationLine: "underline",
  },
  otpRow:      { flexDirection: "row", gap: 8, justifyContent: "center", marginBottom: 24 },
  otpBox: {
    width: 44,
    height: 54,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    textAlign: "center",
    fontSize: 22,
    fontFamily: "Inter_500Medium",
    color: WHITE,
    backgroundColor: "transparent",
  },
  otpBoxFilled:   { borderColor: GOLD },
  resendRow:      { alignItems: "center", marginTop: 4 },
  resendText:     { fontFamily: "Inter_400Regular", fontSize: 13, color: GOLD, textDecorationLine: "underline" },
  resendDisabled: { color: "rgba(255,255,255,0.3)", textDecorationLine: "none" },

  /* Lösenord */
  pwBar:    { flexDirection: "row", gap: 6, marginTop: 20, marginBottom: 16 },
  pwBarSeg: { flex: 1, height: 4, borderRadius: 2 },
  pwCriteria: { gap: 10 },
  pwRow:    { flexDirection: "row", alignItems: "center", gap: 8 },
  pwLabel:  { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.4)" },

  /* Namn */
  privacyRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 20 },
  privacyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.3)",
    flex: 1,
    lineHeight: 18,
  },

  /* Hemort */
  locCenter:   { alignItems: "center", gap: 16, paddingVertical: 32 },
  locHint:     { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.4)" },
  locFound:    { alignItems: "center", gap: 8, paddingVertical: 16 },
  locCity:     { fontFamily: "PlayfairDisplay_400Regular", fontSize: 36, color: WHITE },
  locCountry:  { fontFamily: "Inter_400Regular", fontSize: 16, color: "rgba(255,255,255,0.5)", marginBottom: 12 },
  locQuestion: { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.45)", marginBottom: 20 },
  locBtns:     { gap: 10, width: "100%" },
  locBtnYes: {
    backgroundColor: GOLD,
    borderRadius: 999,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
  },
  locBtnYesText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#000" },
  locBtnNo: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 999,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  locBtnNoText: { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.5)" },

  /* Fel */
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#f87171",
    textAlign: "center",
    marginTop: 12,
  },

  /* Knapp */
  btnWrapper: { paddingHorizontal: 32, paddingBottom: 12, paddingTop: 8 },
  btn: {
    backgroundColor: GOLD,
    borderRadius: 999,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
  },
  disabled: { opacity: 0.35 },
  btnText:  { fontFamily: "Inter_700Bold", fontSize: 15, color: "#000" },
});
