/**
 * Telefonens tillåtelse för notiser. Frågan ställs först när man slår på Notiser i Inställningar,
 * inte när appen startar. Har man sagt nej en gång frågar telefonen aldrig igen; då kan bara
 * telefonens egna inställningar ändra det.
 *
 * Modulen expo-notifications laddas bara när den finns i appbygget, så ett bygge utan den inte
 * kraschar (se pending_eas_build_features).
 */
import { requireOptionalNativeModule } from "expo-modules-core";

type Answer = "granted" | "denied" | "unavailable";

export async function askNotificationPermission(): Promise<Answer> {
  if (!requireOptionalNativeModule("ExpoNotificationPermissionsModule")) return "unavailable";
  const Notifications: typeof import("expo-notifications") = require("expo-notifications");
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return "granted";
  if (!current.canAskAgain) return "denied";
  const answer = await Notifications.requestPermissionsAsync();
  return answer.granted ? "granted" : "denied";
}
