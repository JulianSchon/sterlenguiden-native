import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ImageBackground,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

const { width, height } = Dimensions.get("window");

export default function SplashScreen() {
  return (
    <ImageBackground
      source={require("../../assets/onboarding-1.jpg")}
      style={s.bg}
      resizeMode="cover"
    >
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.3)", "rgba(0,0,0,0.7)"]}
        locations={[0.4, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

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
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  bg: {
    flex: 1,
    width,
    height,
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
