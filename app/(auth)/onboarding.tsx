import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SplashScreen() {
  return (
    <View style={s.bg}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <SafeAreaView style={s.safe}>
        <View style={s.content}>
          <Text style={s.title}>Österlen</Text>
          <Text style={s.subtitle}>Upptäck Skånes pärla</Text>
        </View>

        <TouchableOpacity
          style={s.btn}
          onPress={() => router.replace("/(auth)/login")}
        >
          <Text style={s.btnText}>Kom igång  ›</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  safe: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 32,
    paddingBottom: 48,
  },
  content: {
    alignItems: "center",
    marginBottom: 48,
  },
  title: {
    fontSize: 52,
    fontWeight: "300",
    fontStyle: "italic",
    color: "#FFFFFF",
    letterSpacing: 3,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255,255,255,0.8)",
    marginTop: 10,
    letterSpacing: 0.5,
    fontWeight: "300",
    textAlign: "center",
  },
  btn: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 50,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "300",
    letterSpacing: 1,
  },
});
