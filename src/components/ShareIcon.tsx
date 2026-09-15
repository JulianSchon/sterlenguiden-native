/**
 * ShareIcon — plattformsanpassad dela-ikon.
 * iOS: Apples systemikon för dela (ruta med pil upp).
 * Android: Material Design-ikonen (tre sammanlänkade cirklar).
 */
import { Platform } from "react-native";
import { Upload, Share2 } from "lucide-react-native";

export function ShareIcon({
  size = 20,
  color = "#fff",
  strokeWidth = 2,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return Platform.OS === "ios"
    ? <Upload size={size} color={color} strokeWidth={strokeWidth} />
    : <Share2 size={size} color={color} strokeWidth={strokeWidth} />;
}
