import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
  ImageBackground,
  StatusBar,
} from "react-native";
import { BlurView } from "expo-blur";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Mail, Lock, Eye, EyeOff, User } from "lucide-react-native";
import { supabase } from "@/integrations/supabase/client";

const BG_IMAGE = require("../../assets/onboarding-1.jpg");
const GOLD = "#C9A84C";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleAuth = async () => {
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        Alert.alert("Kolla din e-post", "Vi har skickat en bekräftelselänk.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/(tabs)");
      }
    } catch (err: any) {
      Alert.alert("Fel", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground source={BG_IMAGE} style={s.bg} resizeMode="cover">
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Dark overlay */}
      <View style={s.overlay} />

      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={s.inner}
        >
          {/* Title */}
          <View style={s.titleBlock}>
            <Text style={s.appTitle}>Österlen</Text>
            <View style={s.goldLine} />
          </View>

          {/* Card */}
          <BlurView intensity={40} tint="dark" style={s.card}>
            {/* User icon */}
            <View style={s.iconCircle}>
              <User size={28} color="rgba(255,255,255,0.7)" strokeWidth={1.5} />
            </View>

            <Text style={s.cardTitle}>
              {isSignUp ? "Skapa konto" : "Välkommen tillbaka"}
            </Text>
            <Text style={s.cardSubtitle}>
              {isSignUp
                ? "Fyll i dina uppgifter för att registrera dig"
                : "Ange dina uppgifter för att fortsätta"}
            </Text>

            {/* Email */}
            <Text style={s.label}>E-postadress</Text>
            <View style={s.inputRow}>
              <Mail size={16} color="rgba(255,255,255,0.4)" strokeWidth={1.5} style={s.inputIcon} />
              <TextInput
                style={s.input}
                placeholder="din@email.se"
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            {/* Password */}
            <Text style={s.label}>Lösenord</Text>
            <View style={s.inputRow}>
              <Lock size={16} color="rgba(255,255,255,0.4)" strokeWidth={1.5} style={s.inputIcon} />
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor="rgba(255,255,255,0.3)"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
                {showPassword
                  ? <EyeOff size={16} color="rgba(255,255,255,0.4)" strokeWidth={1.5} />
                  : <Eye size={16} color="rgba(255,255,255,0.4)" strokeWidth={1.5} />
                }
              </TouchableOpacity>
            </View>

            {/* Login button */}
            <TouchableOpacity
              style={[s.loginBtn, loading && { opacity: 0.6 }]}
              onPress={handleAuth}
              disabled={loading}
            >
              <Text style={s.loginBtnText}>
                {loading ? "Laddar..." : isSignUp ? "Skapa konto" : "Logga in"}
              </Text>
            </TouchableOpacity>

            {!isSignUp && (
              <TouchableOpacity style={s.forgotBtn}>
                <Text style={s.forgotText}>Glömt lösenord?</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={s.switchBtn}>
              <Text style={s.switchText}>
                {isSignUp
                  ? "Har du redan ett konto? "
                  : "Har du inget konto? "}
                <Text style={s.switchTextBold}>
                  {isSignUp ? "Logga in" : "Skapa ett här"}
                </Text>
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace("/(auth)/onboarding")}
              style={s.backBtn}
            >
              <Text style={s.backText}>← Tillbaka</Text>
            </TouchableOpacity>
          </BlurView>

          {/* Footer */}
          <Text style={s.footer}>© 2026 Österlen Guide</Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  bg: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  safe: {
    flex: 1,
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  titleBlock: {
    alignItems: "center",
    marginBottom: 24,
  },
  appTitle: {
    fontSize: 36,
    color: "#FFFFFF",
    fontStyle: "italic",
    fontWeight: "300",
    letterSpacing: 2,
  },
  goldLine: {
    width: 40,
    height: 1.5,
    backgroundColor: GOLD,
    marginTop: 6,
  },
  card: {
    borderRadius: 20,
    overflow: "hidden",
    padding: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 6,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    height: 50,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    height: "100%",
  },
  eyeBtn: {
    padding: 4,
  },
  loginBtn: {
    backgroundColor: GOLD,
    borderRadius: 12,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 12,
  },
  loginBtnText: {
    color: "#1A1400",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  forgotBtn: {
    alignItems: "center",
    marginBottom: 12,
  },
  forgotText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
  },
  switchBtn: {
    alignItems: "center",
    marginBottom: 16,
  },
  switchText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
  },
  switchTextBold: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  backBtn: {
    alignItems: "center",
    paddingTop: 4,
  },
  backText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
  },
  footer: {
    textAlign: "center",
    color: "rgba(255,255,255,0.25)",
    fontSize: 12,
    marginTop: 20,
  },
});
