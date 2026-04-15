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
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/integrations/supabase/client";
import { colors } from "@/lib/colors";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

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
    <ImageBackground
      source={require("../../assets/onboarding-1.jpg")}
      style={s.bg}
      resizeMode="cover"
    >
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <View style={[StyleSheet.absoluteFill, s.overlay]} />
      <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={s.inner}
      >
        <Text style={s.title}>Österlenguiden</Text>
        <Text style={s.subtitle}>
          {isSignUp ? "Skapa konto" : "Logga in"}
        </Text>

        <TextInput
          style={s.input}
          placeholder="E-post"
          placeholderTextColor={colors.foregroundSubtle}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={s.input}
          placeholder="Lösenord"
          placeholderTextColor={colors.foregroundSubtle}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={[s.button, loading && s.buttonDisabled]}
          onPress={handleAuth}
          disabled={loading}
        >
          <Text style={s.buttonText}>
            {loading ? "Laddar..." : isSignUp ? "Skapa konto" : "Logga in"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)}>
          <Text style={s.switchText}>
            {isSignUp ? "Har du redan ett konto? Logga in" : "Inget konto? Skapa ett"}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1 },
  overlay: { backgroundColor: "rgba(0,0,0,0.45)" },
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  title: { fontSize: 32, fontWeight: "700", color: colors.foreground, marginBottom: 4 },
  subtitle: { fontSize: 16, color: colors.foregroundMuted, marginBottom: 32 },
  input: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 16,
    color: colors.foreground,
  },
  button: {
    backgroundColor: colors.gold,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.background, fontSize: 16, fontWeight: "700" },
  switchText: { color: colors.gold, textAlign: "center", fontSize: 14 },
});
