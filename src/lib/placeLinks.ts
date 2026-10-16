/**
 * Platsens länkar: hemsida och bokning öppnas i appens egen webbläsare (man stannar i appen och
 * kommer tillbaka med Klar), Instagram och Facebook i sina appar, telefon och e-post i telefonens
 * egna. Ett långt tryck kopierar.
 *
 * Webbläsaren och urklippet kräver sina moduler i appbygget (expo-web-browser, expo-clipboard).
 * Finns de inte används telefonens vanliga webbläsare, och kopieringen säger att den inte gick.
 */
import { Linking, Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

/** Adressen med https:// om den saknar början */
export const withProtocol = (url: string) => (/^[a-z]+:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);

/** "kiviksmusteri.se" — bara själva namnet, utan https://, www. och sidorna efter */
export function siteName(url: string): string {
  return url.trim().replace(/^[a-z]+:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0];
}

export async function openWebsite(url: string): Promise<void> {
  const target = withProtocol(url);
  if (requireOptionalNativeModule("ExpoWebBrowser")) {
    try {
      const WebBrowser = require("expo-web-browser") as typeof import("expo-web-browser");
      await WebBrowser.openBrowserAsync(target, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        controlsColor: "#C5A059",
      });
      return;
    } catch {
      // Faller tillbaka på telefonens webbläsare nedan
    }
  }
  Linking.openURL(target).catch(() => {});
}

/** Instagram, Facebook och andra appar: öppnas i sin app om den finns, annars på webben */
export function openExternal(url: string): void {
  Linking.openURL(withProtocol(url)).catch(() => {});
}

export function callPhone(phone: string): void {
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`).catch(() => {});
}

export function sendEmail(email: string): void {
  Linking.openURL(`mailto:${email.trim()}`).catch(() => {});
}

/** Vägbeskrivning i telefonens kartapp (Apple Kartor på iPhone, Google Maps på Android) */
export function openDirections(lat: number | null, lng: number | null): void {
  if (lat == null || lng == null) return;
  const url = Platform.OS === "ios" ? `maps://?daddr=${lat},${lng}` : `google.navigation:q=${lat},${lng}`;
  Linking.openURL(url).catch(() =>
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() => {}));
}

/** Kopierar texten. false om det inte gick (modulen saknas i bygget) */
export async function copyText(text: string): Promise<boolean> {
  if (!requireOptionalNativeModule("ExpoClipboard")) return false;
  try {
    const Clipboard = require("expo-clipboard") as typeof import("expo-clipboard");
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
