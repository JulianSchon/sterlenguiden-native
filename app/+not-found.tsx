/** En länk som leder till en sida som inte finns (t.ex. en gammal eller felskriven delningslänk) */
import { router } from "expo-router";
import { Compass } from "lucide-react-native";
import { ProblemScreen } from "@/components/ProblemScreen";
import i18n from "i18next";

export default function NotFound() {
  return (
    <ProblemScreen
      icon={(color) => <Compass size={36} color={color} strokeWidth={1.6} />}
      title={i18n.t("problems.notFoundTitle")}
      text={i18n.t("problems.notFoundText")}
      primary={{ label: i18n.t("problems.toStart"), onPress: () => router.replace("/") }}
      secondary={router.canGoBack() ? { label: i18n.t("common.back"), onPress: () => router.back() } : undefined}
    />
  );
}
