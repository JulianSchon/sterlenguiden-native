import { Tabs } from "expo-router";
import { Home, Search, Map, Calendar, User, Building2 } from "lucide-react-native";
import { useIsBusiness } from "@/hooks/useUserRole";
import { colors } from "@/lib/colors";

export default function TabLayout() {
  const { isBusiness } = useIsBusiness();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: "rgba(255,255,255,0.3)",
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          height: 80,
          paddingBottom: 16,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "500",
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Hem",
          tabBarIcon: ({ color }) => <Home size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Sök",
          tabBarIcon: ({ color }) => <Search size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: "Karta",
          tabBarIcon: ({ color }) => <Map size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Kalender",
          tabBarIcon: ({ color }) => <Calendar size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: isBusiness ? "Företag" : "Profil",
          tabBarIcon: ({ color }) =>
            isBusiness ? (
              <Building2 size={24} color={color} />
            ) : (
              <User size={24} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}
