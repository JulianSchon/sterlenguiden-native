import { View } from "react-native";
import { Tabs } from "expo-router";
import FloatingNav from "@/components/navigation/FloatingNav";

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      {/*
       * tabBar={() => null} tar bort React Navigations default tab bar helt –
       * inget utrymme reserveras. FloatingNav renderas som absolut overlay nedan.
       */}
      <Tabs
        tabBar={() => null}
        sceneContainerStyle={{ borderRadius: 0, backgroundColor: "#121212" }}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index"    options={{ title: "Hem" }} />
        <Tabs.Screen name="explore"  options={{ title: "Sök" }} />
        <Tabs.Screen name="map"      options={{ title: "Karta" }} />
        <Tabs.Screen name="calendar" options={{ title: "Kalender" }} />
        <Tabs.Screen name="profile"  options={{ title: "Profil" }} />
      </Tabs>

      {/* Flytande nav – overlayt ovanpå alla tab-skärmar */}
      <FloatingNav />
    </View>
  );
}
