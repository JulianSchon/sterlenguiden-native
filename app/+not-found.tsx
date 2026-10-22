/** En länk som leder till en sida som inte finns (t.ex. en gammal eller felskriven delningslänk) */
import { router } from "expo-router";
import { Compass } from "lucide-react-native";
import { ProblemScreen } from "@/components/ProblemScreen";

export default function NotFound() {
  return (
    <ProblemScreen
      icon={(color) => <Compass size={36} color={color} strokeWidth={1.6} />}
      title="Sidan finns inte"
      text="Länken leder ingenstans. Den kan vara gammal, eller så har det blivit fel i adressen."
      primary={{ label: "Till startsidan", onPress: () => router.replace("/") }}
      secondary={router.canGoBack() ? { label: "Tillbaka", onPress: () => router.back() } : undefined}
    />
  );
}
