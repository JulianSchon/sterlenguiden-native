/**
 * "Fortsätt med Apple / Google" — på startsidan och inloggningen. Lyckas inloggningen går man in i
 * appen, eller vidare i onboardingen om kontot är nytt (lib/onboarding enterApp).
 */
import { useCallback, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppleIcon, GoogleIcon } from "@/components/BrandIcons";
import { AuthButton } from "./AuthParts";
import { APPLE_ON_PLATFORM, signInWith, type SocialProvider } from "@/lib/socialAuth";
import { enterApp } from "@/lib/onboarding";
import { useTheme } from "@/theme/ThemeProvider";

const NAMES: Record<SocialProvider, string> = { apple: "Apple", google: "Google" };

/** Inloggningen med Apple eller Google: vilken som pågår, och vad som gick fel */
export function useSocialSignIn() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signIn = useCallback(async (provider: SocialProvider) => {
    if (busy) return;
    setError(null);
    setBusy(provider);
    const result = await signInWith(provider);
    if (result.ok) {
      // Knappen visar att något händer tills nästa sida tagit över
      await enterApp(result.name);
      return;
    }
    setBusy(null);
    if (result.reason === "unavailable") setError(t("auth.providerUnavailable", { provider: NAMES[provider] }));
    else if (result.reason === "failed") setError(t("auth.providerFailed", { provider: NAMES[provider] }));
  }, [busy, t]);
  return { busy, error, signIn, clearError: () => setError(null) };
}

export function ProviderButtons({
  busy, onPress,
}: { busy: SocialProvider | null; onPress: (provider: SocialProvider) => void }) {
  const { t } = useTranslation();
  const { scheme } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      {APPLE_ON_PLATFORM ? (
        <AuthButton
          variant="apple"
          label={t("auth.welcome.apple")}
          icon={<AppleIcon size={19} color={scheme === "dark" ? "#000000" : "#FFFFFF"} />}
          onPress={() => onPress("apple")}
          loading={busy === "apple"}
          disabled={!!busy && busy !== "apple"}
        />
      ) : null}
      <AuthButton
        variant="outline"
        label={t("auth.welcome.google")}
        icon={<GoogleIcon size={19} />}
        onPress={() => onPress("google")}
        loading={busy === "google"}
        disabled={!!busy && busy !== "google"}
      />
    </View>
  );
}
