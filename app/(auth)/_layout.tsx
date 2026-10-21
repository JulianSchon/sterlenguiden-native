import { Stack } from "expo-router";
import { useTheme } from "@/theme/ThemeProvider";

export default function AuthLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" />
      {/* Onboardingen har en egen tillbaka-pil per steg; ett svep från kanten hade hoppat ur flödet */}
      <Stack.Screen name="signup" options={{ gestureEnabled: false }} />
      <Stack.Screen name="business-login" />
    </Stack>
  );
}
