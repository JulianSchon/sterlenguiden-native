import { Stack, router, type ErrorBoundaryProps } from "expo-router";
import { CloudOff } from "lucide-react-native";
import { ProblemScreen } from "@/components/ProblemScreen";
import { ActiveOfferHost } from "@/components/offers/ActiveOfferHost";
import { TrophyHost } from "@/components/trophies/TrophyHost";
import { EventSheetHost } from "@/components/events/EventSheet";
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
import { Caveat_600SemiBold, Caveat_700Bold } from "@expo-google-fonts/caveat";
import { supabase } from "@/integrations/supabase/client";
import { loadSavedLanguage } from "@/i18n";
import { forgetGoogleAccount } from "@/lib/socialAuth";
import { tabsEnterFromBelow } from "@/lib/tabsEntrance";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";

/** Om något kraschar visas det här i stället för Expos tekniska felsida */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ProblemScreen
      icon={(color) => <CloudOff size={36} color={color} strokeWidth={1.6} />}
      title="Något gick fel"
      text="Vi ber om ursäkt – appen stötte på ett problem. Försök igen. Hjälper det inte, stäng appen helt och öppna den på nytt."
      primary={{ label: "Försök igen", onPress: () => { retry(); } }}
      detail={error.message}
    />
  );
}

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
    // Bara för texten skriven "för hand" på minnenas Polaroid-kort — appens enda handstilston,
    // medvetet reserverad dit så den inte sprids ut och tappar sin betydelse.
    Caveat_600SemiBold,
    Caveat_700Bold,
  });

  // INITIAL_SESSION är Supabase-klientens signal att sessionen
  // är fullt laddad från SecureStore och auth-headern är satt.
  // Vi renderar ingenting förrän det eventet har skjutits – annars
  // kör queries utan token och RLS (authenticated) blockerar dem.
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    // Kontot som datan i appen hör till (null = utloggad)
    let currentUser: string | null = null;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") {
        currentUser = session?.user?.id ?? null;
        // Vart man skickas vid start avgör app/index.tsx, när navigeringen finns. Att navigera härifrån
        // (innan något ritats) byter ut hela rotlayouten — den prenumererar då på nytt, får ett nytt
        // INITIAL_SESSION och navigerar igen: en oändlig loop och vit skärm när man startar utloggad.
        setAuthReady(true);
      } else if (event === "SIGNED_IN" && session?.user?.id && session.user.id !== currentUser) {
        // Inloggad (efter att ha varit utloggad): det som ligger alltid igång (troféer, kort, profil …)
        // hann hämta på nytt medan man var utloggad och fick tomma svar. Allt hämtas om med det nya
        // kontot — annars såg kontot oanvänt ut och allt firades som nytt, tills man laddade om appen.
        currentUser = session.user.id;
        queryClient.resetQueries();
      } else if (event === "SIGNED_OUT") {
        currentUser = null;
        // Utan detta visades förra kontots cachade data (favoriter, listor, profil...) tills
        // en manuell refetch hann hämta det nya kontots — queries är inte user-id-namngivna.
        queryClient.clear();
        forgetGoogleAccount();
        // Allt som var öppet stängs först, så man inte kan svepa tillbaka in i appen utloggad
        if (router.canDismiss()) router.dismissAll();
        router.replace("/(auth)/welcome");
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
        {/* Efter onboardingen glider Hem upp underifrån (lib/tabsEntrance) */}
        <Stack.Screen name="(tabs)" options={() => ({ headerShown: false, animation: tabsEnterFromBelow() ? "slide_from_bottom" : "default" })} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="place/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="discover" options={{ headerShown: false }} />
        <Stack.Screen name="news/[id]" options={{ headerShown: false }} />
        {/* Profile sub-pages */}
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="settings/account" options={{ headerShown: false }} />
        <Stack.Screen name="settings/appearance" options={{ headerShown: false }} />
        <Stack.Screen name="settings/notifications" options={{ headerShown: false }} />
        <Stack.Screen name="settings/about" options={{ headerShown: false }} />
        <Stack.Screen name="settings/interests" options={{ headerShown: false }} />
        <Stack.Screen name="settings/suggest" options={{ headerShown: false }} />
        <Stack.Screen name="settings/pass" options={{ headerShown: false }} />
        {/* Köpsidan (paywall) glider upp underifrån, över hela skärmen */}
        <Stack.Screen name="settings/pass-buy" options={{ headerShown: false, presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="settings/pass-gift" options={{ headerShown: false }} />
        <Stack.Screen name="settings/pass-manage" options={{ headerShown: false }} />
        <Stack.Screen name="settings/redeem" options={{ headerShown: false }} />
        <Stack.Screen name="favorites" options={{ headerShown: false }} />
        <Stack.Screen name="offers" options={{ headerShown: false }} />
        <Stack.Screen name="visits" options={{ headerShown: false }} />
        <Stack.Screen name="stats" options={{ headerShown: false }} />
        <Stack.Screen name="challenges" options={{ headerShown: false }} />
        <Stack.Screen name="mitt-osterlen" options={{ headerShown: false }} />
        <Stack.Screen name="friends" options={{ headerShown: false }} />
        <Stack.Screen name="friend/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="leaderboards" options={{ headerShown: false }} />
        <Stack.Screen name="lists/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="memories/index" options={{ headerShown: false }} />
        <Stack.Screen name="memories/edit" options={{ headerShown: false }} />
        <Stack.Screen name="memories/[id]" options={{ headerShown: false }} />
        {/* Mitt företag. Det man skapar (erbjudande, evenemang, berättelse) och att ta över en plats
            glider upp underifrån, över hela skärmen */}
        <Stack.Screen name="business/index" options={{ headerShown: false }} />
        <Stack.Screen name="business/welcome" options={{ headerShown: false, animation: "slide_from_bottom" }} />
        <Stack.Screen name="business/hours" options={{ headerShown: false }} />
        <Stack.Screen name="business/about" options={{ headerShown: false }} />
        <Stack.Screen name="business/photos" options={{ headerShown: false }} />
        <Stack.Screen name="business/contact" options={{ headerShown: false }} />
        <Stack.Screen name="business/categories" options={{ headerShown: false }} />
        <Stack.Screen name="business/amenities" options={{ headerShown: false }} />
        <Stack.Screen name="business/offers" options={{ headerShown: false }} />
        <Stack.Screen name="business/offer" options={{ headerShown: false, animation: "slide_from_bottom", gestureEnabled: false }} />
        <Stack.Screen name="business/events" options={{ headerShown: false }} />
        <Stack.Screen name="business/event" options={{ headerShown: false, animation: "slide_from_bottom", gestureEnabled: false }} />
        <Stack.Screen name="business/stories" options={{ headerShown: false }} />
        <Stack.Screen name="business/story" options={{ headerShown: false, presentation: "fullScreenModal", animation: "fade", gestureEnabled: false }} />
        <Stack.Screen name="business/stats" options={{ headerShown: false }} />
        <Stack.Screen name="business/team" options={{ headerShown: false }} />
        <Stack.Screen name="business/settings" options={{ headerShown: false }} />
        <Stack.Screen name="business/terms" options={{ headerShown: false }} />
        <Stack.Screen name="business/start" options={{ headerShown: false }} />
        <Stack.Screen name="business/claim" options={{ headerShown: false, animation: "slide_from_bottom", gestureEnabled: false }} />
        <Stack.Screen name="business/apply" options={{ headerShown: false, animation: "slide_from_bottom", gestureEnabled: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      {/* Personalskärmen för ett aktivt erbjudande: ovanpå allt, syns var man än är */}
      <ActiveOfferHost />
      {/* Utmaningsögonblicket: när en utmaning klaras, var man än är (väntar på personalskärmen) */}
      <TrophyHost />
      {/* Eventets panel — evenemang öppnas alltid här, var man än är (se lib/eventSheet) */}
      <EventSheetHost />
      </GestureHandlerRootView>
    </NavigationThemeProvider>
  );
}
