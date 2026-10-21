/**
 * Appens första sida skickar vidare direkt. Inte inloggad → startsidan. Inloggad → in i appen, eller
 * tillbaka till onboardingen om kontot inte är klart (lib/onboarding). Inget snurrar medan det
 * avgörs — sidan är bara bakgrundsfärgen en kort stund.
 */
import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { enterApp } from "@/lib/onboarding";
import { useTheme } from "@/theme/ThemeProvider";

export default function Index() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/(auth)/welcome");
    else enterApp();
  }, [user, loading]);

  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
