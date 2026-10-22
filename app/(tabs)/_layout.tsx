import { View } from "react-native";
import { Tabs } from "expo-router";
import FloatingNav from "@/components/navigation/FloatingNav";
import { useRecordAppDay } from "@/hooks/useAppDays";
import { usePrefetchPass } from "@/hooks/usePassHistory";
import { prefetchCardImages } from "@/lib/cardImages";
import { CardImagePreloader } from "@/components/CardImagePreloader";
import { useEffect } from "react";
import { useTheme } from "@/theme/ThemeProvider";

export default function TabLayout() {
  // Sparar dagen för streaken när appen öppnas (tab-gruppen visas bara inloggad)
  useRecordAppDay();
  usePrefetchPass();
  useEffect(prefetchCardImages, []);
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      {/*
       * tabBar={() => null} tar bort React Navigations default tab bar helt –
       * inget utrymme reserveras. FloatingNav renderas som absolut overlay nedan.
       */}
      <Tabs
        tabBar={() => null}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      >
        <Tabs.Screen name="index"    options={{ title: "Hem" }} />
        <Tabs.Screen name="explore"  options={{ title: "Sök" }} />
        <Tabs.Screen name="map"      options={{ title: "Karta" }} />
        <Tabs.Screen name="calendar" options={{ title: "Kalender" }} />
        <Tabs.Screen name="profile"  options={{ title: "Profil" }} />
      </Tabs>

      {/* Flytande nav – overlayt ovanpå alla tab-skärmar */}
      <FloatingNav />
      <CardImagePreloader />
    </View>
  );
}
