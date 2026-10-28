import { Linking } from "react-native";
import { useTranslation } from "react-i18next";
import type { PhotoSource } from "@/hooks/useAccount";
import { appAlert } from "@/components/ActionMenu";

/**
 * Menyn "Välj bild / Ta foto" (appens egen, som alla andra frågor) som kör `change` med rätt
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
        appAlert(t("account.photo.cameraDeniedTitle"), t("account.photo.cameraDeniedBody"), [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("account.photo.openSettings"), onPress: () => Linking.openSettings() },
        ]);
      } else if (message === "card_photo_cooldown") {
        appAlert(t("common.error"), t("pass.card.cooldown"));
      } else {
        // I utvecklingsläget visas även själva felet, så att vi ser vad som gick fel
        appAlert(t("common.error"), __DEV__ && message ? `${t("account.photo.failed")}\n\n${message}` : t("account.photo.failed"));
      }
    }
  }

  return function open() {
    appAlert(title, undefined, [
      { text: t("account.photo.choose"), onPress: () => run("library") },
      { text: t("account.photo.take"), onPress: () => run("camera") },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  };
}
