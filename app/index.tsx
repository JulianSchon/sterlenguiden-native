import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import * as SecureStore from "expo-secure-store";

export default function Index() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    async function navigate() {
      // Inloggad → direkt till appen
      if (user) {
        router.replace("/(tabs)");
        return;
      }

      // Inte inloggad → kolla om intro redan setts
      const seen = await SecureStore.getItemAsync("introSeen").catch(() => null);
      if (seen) {
        router.replace("/(auth)/login");
      } else {
        router.replace("/(auth)/onboarding");
      }
    }

    navigate();
  }, [user, loading]);

  // Laddningsspinner i appens mörka färg medan auth kollas
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0D0D0D" }}>
      <ActivityIndicator size="large" color="#C5A059" />
    </View>
  );
}
