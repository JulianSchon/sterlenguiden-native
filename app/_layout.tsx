import { Stack, router } from "expo-router";
import { ThemeProvider as NavigationThemeProvider, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts } from "expo-font";
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_500Medium,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
} from "@expo-google-fonts/playfair-display";
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { ShareTechMono_400Regular } from "@expo-google-fonts/share-tech-mono";
import { Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold } from "@expo-google-fonts/montserrat";
import { supabase } from "@/integrations/supabase/client";
import { loadSavedLanguage } from "@/i18n";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_500Medium,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    ShareTechMono_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });

  // INITIAL_SESSION är Supabase-klientens signal att sessionen
  // är fullt laddad från SecureStore och auth-headern är satt.
  // Vi renderar ingenting förrän det eventet har skjutits – annars
  // kör queries utan token och RLS (authenticated) blockerar dem.
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") {
        setAuthReady(true);
        if (!session) {
          router.replace("/(auth)/login");
        }
      } else if (event === "SIGNED_OUT") {
        router.replace("/(auth)/login");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Ett tidigare valt språk läses in innan appen visas, så ingen ser fel språk blinka förbi
  const [languageReady, setLanguageReady] = useState(false);
  useEffect(() => {
    loadSavedLanguage().finally(() => setLanguageReady(true));
  }, []);

  // Vänta på typsnitt, auth och språk innan appen visas
  if (!fontsLoaded || !authReady || !languageReady) return null;

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AppStack />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function AppStack() {
  const { colors, scheme } = useTheme();

  // Navigeringens egen bakgrund är vit som standard och syns i hörnen medan en
  // sida glider in över en annan. Ge den temats bakgrund.
  const navigationTheme = useMemo(() => {
    const base = scheme === "light" ? DefaultTheme : DarkTheme;
    return { ...base, colors: { ...base.colors, background: colors.bg, card: colors.bg, border: colors.border } };
  }, [scheme, colors]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="category/[categoryId]" options={{ headerShown: false }} />
        <Stack.Screen name="place/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="event/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="discover" options={{ headerShown: false }} />
        <Stack.Screen name="news/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="StoryViewer" options={{ headerShown: false }} />
        {/* Profile sub-pages */}
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="settings/account" options={{ headerShown: false }} />
        <Stack.Screen name="settings/appearance" options={{ headerShown: false }} />
        <Stack.Screen name="settings/notifications" options={{ headerShown: false }} />
        <Stack.Screen name="settings/about" options={{ headerShown: false }} />
        <Stack.Screen name="settings/legal/[slug]" options={{ headerShown: false }} />
        <Stack.Screen name="settings/pass" options={{ headerShown: false }} />
        <Stack.Screen name="settings/pass-buy" options={{ headerShown: false }} />
        <Stack.Screen name="settings/pass-gift" options={{ headerShown: false }} />
        <Stack.Screen name="settings/pass-manage" options={{ headerShown: false }} />
        <Stack.Screen name="settings/redeem" options={{ headerShown: false }} />
        <Stack.Screen name="favorites" options={{ headerShown: false }} />
        <Stack.Screen name="offers" options={{ headerShown: false }} />
        <Stack.Screen name="visits" options={{ headerShown: false }} />
        <Stack.Screen name="stats" options={{ headerShown: false }} />
        <Stack.Screen name="challenges" options={{ headerShown: false }} />
        <Stack.Screen name="mitt-osterlen" options={{ headerShown: false }} />
        <Stack.Screen name="lists/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="memories/index" options={{ headerShown: false }} />
        <Stack.Screen name="memories/edit" options={{ headerShown: false }} />
        <Stack.Screen name="memories/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      </GestureHandlerRootView>
    </NavigationThemeProvider>
  );
}
