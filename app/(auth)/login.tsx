import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  StatusBar,
  Image,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { router } from "expo-router";
import { supabase } from "@/integrations/supabase/client";

// ── Google G-logga med rätt färger ────────────────────────────────────────
function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  );
}

// ── Design tokens ──────────────────────────────────────────────────────────
const GOLD         = "#C5A059";
const BG           = "#0D0D0D";
const WHITE        = "#FFFFFF";
const FIELD_BORDER = "rgba(255,255,255,0.12)";

export default function LoginScreen() {
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");

  const emailRef    = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const clearError = () => setError("");

  // ── Logga in ──────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError("Fyll i e-post och lösenord.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { error: e } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (e) throw e;
      router.replace("/(tabs)");
    } catch (e: any) {
      const msg: string = e.message ?? "";
      setError(
        msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("credentials")
          ? "Felaktigt lösenord eller e-post."
          : msg
      );
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  // ── Glömt lösenord ────────────────────────────────────────────────────────
  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Fyll i din e-post ovan, sedan trycker du på Glömt lösenord?");
      return;
    }
    try {
      const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (e) throw e;
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ── Social (kommer snart) ─────────────────────────────────────────────────
  const handleSocial = (provider: "Apple" | "Google") => {
    setError(`${provider}-inloggning kommer snart.`);
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
          >

            {/* ── Logo ── */}
            <View style={s.logoWrap}>
              <Image
                source={require("../../assets/Osterlenappen-logo.png")}
                style={s.logo}
                resizeMode="contain"
              />
            </View>

            {/* ── Fält ── */}
            <View style={s.fields}>

              {/* E-post */}
              <TouchableOpacity style={s.field} activeOpacity={1} onPress={() => emailRef.current?.focus()}>
                <TouchableOpacity onPress={() => emailRef.current?.focus()} hitSlop={8}>
                  <Ionicons name="mail-outline" size={17} color="rgba(255,255,255,0.3)" style={s.fieldIcon} />
                </TouchableOpacity>
                <TextInput
                  ref={emailRef}
                  style={s.fieldInput}
                  placeholder="E-post"
                  placeholderTextColor="rgba(255,255,255,0.28)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  selectionColor={GOLD}
                  value={email}
                  onChangeText={v => { clearError(); setEmail(v); }}
                />
              </TouchableOpacity>

              {/* Lösenord */}
              <TouchableOpacity style={s.field} activeOpacity={1} onPress={() => passwordRef.current?.focus()}>
                <TouchableOpacity onPress={() => passwordRef.current?.focus()} hitSlop={8}>
                  <Ionicons name="lock-closed-outline" size={17} color="rgba(255,255,255,0.3)" style={s.fieldIcon} />
                </TouchableOpacity>
                <TextInput
                  ref={passwordRef}
                  style={s.fieldInput}
                  placeholder="Lösenord"
                  placeholderTextColor="rgba(255,255,255,0.28)"
                  secureTextEntry={!showPassword}
                  selectionColor={GOLD}
                  value={password}
                  onChangeText={v => { clearError(); setPassword(v); }}
                />
                <TouchableOpacity onPress={() => setShowPassword(p => !p)} style={s.eyeBtn}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={19}
                    color="rgba(255,255,255,0.35)"
                  />
                </TouchableOpacity>
              </TouchableOpacity>

              {/* Fel */}
              {!!error && <Text style={s.errorText}>{error}</Text>}

              {/* Glömt lösenord – centrerat under lösenordsfältet */}
              <TouchableOpacity onPress={handleForgotPassword} activeOpacity={0.7} style={s.forgotRow}>
                <Text style={s.forgotText}>Glömt lösenord?</Text>
              </TouchableOpacity>
            </View>

            {/* ── Logga in ── */}
            <TouchableOpacity
              style={[s.loginBtn, loading && s.disabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={s.loginBtnText}>
                {loading ? "Loggar in…" : "Logga in"}
              </Text>
            </TouchableOpacity>

            {/* ── Eller-avdelare ── */}
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>eller</Text>
              <View style={s.dividerLine} />
            </View>

            {/* ── Social-knappar ── */}
            <View style={s.socialBlock}>

              {/* Google – riktiga färger */}
              <TouchableOpacity
                style={s.socialBtnSubtle}
                onPress={() => handleSocial("Google")}
                activeOpacity={0.8}
              >
                <GoogleIcon size={18} />
                <Text style={s.socialBtnSubtleText}>Fortsätt med Google</Text>
              </TouchableOpacity>

              {/* Apple – visas bara på iOS */}
              {Platform.OS === "ios" && (
                <TouchableOpacity
                  style={s.socialBtnApple}
                  onPress={() => handleSocial("Apple")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="logo-apple" size={18} color="rgba(255,255,255,0.85)" />
                  <Text style={s.socialBtnAppleText}>Fortsätt med Apple</Text>
                </TouchableOpacity>
              )}

            </View>

            {/* ── Skapa konto ── */}
            <TouchableOpacity
              onPress={() => router.push("/(auth)/signup" as any)}
              activeOpacity={0.7}
              style={s.signupRow}
            >
              <Text style={s.signupText}>
                Har du inget konto?{" "}
                <Text style={s.signupBold}>Skapa konto</Text>
              </Text>
            </TouchableOpacity>

            {/* ── Företagsportal ── */}
            <TouchableOpacity
              onPress={() => router.push("/(auth)/business-login" as any)}
              activeOpacity={0.7}
              style={s.bizRow}
            >
              <Text style={s.bizText}>FÖRETAGSPORTAL</Text>
            </TouchableOpacity>

          </ScrollView>
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
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 36,   // mer luft mot kanterna
    paddingTop: 72,
    paddingBottom: 48,
  },

  /* Logo */
  logoWrap: {
    alignItems: "center",
    marginBottom: 36,
  },
  logo: {
    width: 100,
    height: 100,
  },

  /* Fält */
  fields: {
    marginBottom: 16,
    gap: 10,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",  // genomskinlig – bara kanten syns
    borderWidth: 1,
    borderColor: FIELD_BORDER,
    borderRadius: 999,
    paddingHorizontal: 16,
    height: 50,
  },
  fieldIcon: {
    marginRight: 10,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: WHITE,
  },
  eyeBtn: {
    padding: 4,
  },

  /* Fel */
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#f87171",
    textAlign: "center",
    marginTop: -2,
  },

  /* Glömt lösenord – centrerat */
  forgotRow: {
    alignItems: "center",
    marginTop: 2,
  },
  forgotText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: "rgba(255,255,255,0.4)",
    textDecorationLine: "underline",
  },

  /* Logga in */
  loginBtn: {
    backgroundColor: GOLD,
    borderRadius: 999,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,   // mer space ner till "eller"
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
  },
  disabled: { opacity: 0.45 },
  loginBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: "#000",
    letterSpacing: 0.3,
  },

  /* Eller-avdelare */
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 36,   // samma space som Logga in → eller
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  dividerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.3)",
  },

  /* Social */
  socialBlock: {
    gap: 10,
    marginBottom: 20,
  },

  /* Google – samma stil som Apple */
  socialBtnSubtle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 999,
    height: 50,
  },
  socialBtnSubtleText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
  },

  /* Apple – sticker ut */
  socialBtnApple: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 999,
    height: 50,
  },
  socialBtnAppleText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
  },

  /* Skapa konto */
  signupRow: {
    alignItems: "center",
    marginBottom: 20,
  },
  signupText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.45)",
  },
  signupBold: {
    fontFamily: "Inter_400Regular",
    color: WHITE,
  },

  /* Företagsportal */
  bizRow: {
    alignItems: "center",
  },
  bizText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    letterSpacing: 3,
    color: "rgba(255,255,255,0.22)",
  },
});
