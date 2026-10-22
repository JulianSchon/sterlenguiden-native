/**
 * Logga in med Apple eller Google. Båda använder telefonens egen inloggningsruta (inget webbfönster)
 * och lämnar en signerad biljett (id-token) till Supabase, som skapar kontot eller loggar in det.
 *
 * Det kräver tre saker:
 * - modulerna expo-apple-authentication och @react-native-google-signin/google-signin i själva
 *   appbygget (nästa EAS-bygge),
 * - att Apple och Google är påslagna i Supabase (Authentication → Sign In / Providers),
 * - för Google: appens klient-id:n från Google Cloud i app.json (expo.extra.googleSignIn).
 * Saknas något svarar knapparna "unavailable" i stället för att krascha — modulerna läses bara in
 * när de finns i bygget.
 */
import { Platform, TurboModuleRegistry } from "react-native";
import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo-modules-core";
import { supabase } from "@/integrations/supabase/client";

export type SocialProvider = "apple" | "google";

type SocialResult =
  | { ok: true; name?: { first: string; last: string } }
  | { ok: false; reason: "cancelled" | "unavailable" | "failed" };

const googleConfig = (Constants.expoConfig?.extra?.googleSignIn ?? {}) as { iosClientId?: string; webClientId?: string };

/** Apple-knappen visas bara på iPhone (Apples egen inloggning finns inte på Android) */
export const APPLE_ON_PLATFORM = Platform.OS === "ios";

function appleModule(): typeof import("expo-apple-authentication") | null {
  if (Platform.OS !== "ios" || !requireOptionalNativeModule("ExpoAppleAuthentication")) return null;
  return require("expo-apple-authentication");
}

function googleModule(): typeof import("@react-native-google-signin/google-signin") | null {
  // Paketet kräver sin modul direkt när det läses in, så det får inte läsas in utan den. På iPhone
  // behövs också iPhone-id:t (utan det saknas adressen Google svarar till, och appen kraschar)
  if (!TurboModuleRegistry.get("RNGoogleSignin") || !googleConfig.webClientId) return null;
  if (Platform.OS === "ios" && !googleConfig.iosClientId) return null;
  return require("@react-native-google-signin/google-signin");
}

async function signInWithApple(): Promise<SocialResult> {
  const Apple = appleModule();
  if (!Apple || !(await Apple.isAvailableAsync().catch(() => false))) return { ok: false, reason: "unavailable" };
  try {
    const credential = await Apple.signInAsync({
      requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
    });
    if (!credential.identityToken) return { ok: false, reason: "failed" };
    const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: credential.identityToken });
    if (error) return { ok: false, reason: "failed" };
    const first = credential.fullName?.givenName?.trim() ?? "";
    const last = credential.fullName?.familyName?.trim() ?? "";
    if (!first && !last) return { ok: true };
    // Apple skickar namnet bara första gången man loggar in — det sparas på kontot så det finns kvar
    supabase.auth.updateUser({ data: { full_name: [first, last].filter(Boolean).join(" "), given_name: first, family_name: last } })
      .catch(() => {});
    return { ok: true, name: { first, last } };
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    return { ok: false, reason: code === "ERR_REQUEST_CANCELED" ? "cancelled" : "failed" };
  }
}

let googleConfigured = false;

async function signInWithGoogle(): Promise<SocialResult> {
  const G = googleModule();
  if (!G) return { ok: false, reason: "unavailable" };
  try {
    if (!googleConfigured) {
      G.GoogleSignin.configure({ webClientId: googleConfig.webClientId, iosClientId: googleConfig.iosClientId || undefined });
      googleConfigured = true;
    }
    if (Platform.OS === "android") await G.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await G.GoogleSignin.signIn();
    if (!G.isSuccessResponse(response)) return { ok: false, reason: "cancelled" };
    const token = response.data.idToken;
    if (!token) return { ok: false, reason: "failed" };
    const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token });
    if (error) return { ok: false, reason: "failed" };
    const first = response.data.user.givenName?.trim() ?? "";
    const last = response.data.user.familyName?.trim() ?? "";
    return { ok: true, name: first || last ? { first, last } : undefined };
  } catch (e) {
    const cancelled = G.isErrorWithCode(e)
      && (e.code === G.statusCodes.SIGN_IN_CANCELLED || e.code === G.statusCodes.IN_PROGRESS);
    return { ok: false, reason: cancelled ? "cancelled" : "failed" };
  }
}

export function signInWith(provider: SocialProvider): Promise<SocialResult> {
  return provider === "apple" ? signInWithApple() : signInWithGoogle();
}

/** Vid utloggning: glöm Google-kontot, så nästa inloggning får välja konto igen */
export function forgetGoogleAccount(): void {
  const G = googleModule();
  if (G && googleConfigured) G.GoogleSignin.signOut().catch(() => {});
}
