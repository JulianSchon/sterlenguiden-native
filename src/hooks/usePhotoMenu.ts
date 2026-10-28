import { ActionSheetIOS, Alert, Linking, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import type { PhotoSource } from "@/hooks/useAccount";

/**
 * Menyn "Välj bild / Ta foto" (systemets egen på iOS) som kör `change` med rätt
 * källa och visar ett begripligt fel om kameran är avstängd, kortfotot nyss
 * bytts eller uppladdningen misslyckas.
 */
export function usePhotoMenu(change: (source: PhotoSource) => Promise<unknown>, title: string) {
  const { t } = useTranslation();

  async function run(source: PhotoSource) {
    try {
      await change(source);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (message === "camera_denied") {
        Alert.alert(t("account.photo.cameraDeniedTitle"), t("account.photo.cameraDeniedBody"), [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("account.photo.openSettings"), onPress: () => Linking.openSettings() },
        ]);
      } else if (message === "card_photo_cooldown") {
        Alert.alert(t("common.error"), t("pass.card.cooldown"));
      } else {
        // I utvecklingsläget visas även själva felet, så att vi ser vad som gick fel
        Alert.alert(t("common.error"), __DEV__ && message ? `${t("account.photo.failed")}\n\n${message}` : t("account.photo.failed"));
      }
    }
  }

  return function open() {
    const options = [t("account.photo.choose"), t("account.photo.take"), t("common.cancel")];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 2 }, (index) => {
        if (index === 0) run("library");
        if (index === 1) run("camera");
      });
    } else {
      Alert.alert(title, undefined, [
        { text: options[0], onPress: () => run("library") },
        { text: options[1], onPress: () => run("camera") },
        { text: options[2], style: "cancel" },
      ]);
    }
  };
}
