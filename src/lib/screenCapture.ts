/**
 * Stänger av skärmdumpar och skärminspelning medan personalskärmen visas.
 *
 * En app-version byggd innan expo-screen-capture lades till saknar den inbyggda modulen. Att ens
 * försöka läsa in paketet då ger en krasch som inte går att fånga med try/catch, så vi kontrollerar
 * först om modulen finns. Utan den händer ingenting (skärmen fungerar, men kan fotas).
 * Kontrollen kan tas bort när alla kör ett bygge som innehåller modulen.
 */
import { requireOptionalNativeModule } from "expo";

const KEY = "active-offer";

/**
 * Blockerar skärmdumpar och skärminspelning, och suddar appens förhandsvisning i apprullen
 * (när man sveper upp från hemskärmen), tills den returnerade funktionen anropas.
 */
export function preventScreenCapture(): () => void {
  if (!requireOptionalNativeModule("ExpoScreenCapture")) return () => {};
  let released = false;
  import("expo-screen-capture")
    .then((mod) => {
      if (released) return;
      mod.preventScreenCaptureAsync(KEY);
      mod.enableAppSwitcherProtectionAsync(1);
    })
    .catch(() => {});
  return () => {
    released = true;
    import("expo-screen-capture")
      .then((mod) => { mod.allowScreenCaptureAsync(KEY); mod.disableAppSwitcherProtectionAsync(); })
      .catch(() => {});
  };
}
