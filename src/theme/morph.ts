/**
 * Mjuk övergång mellan mörkt och ljust tema, styrd av ett värde 0 (mörkt) till 1
 * (ljust). Används bara på Utseende, där temaknappen drar värdet medan man
 * sveper, så att sidans färger följer fingret i stället för att bytas i efterhand.
 * Färgerna räknas alltid ur progress och inte ur aktuellt tema, så det blir inget
 * hopp när temat sedan byts på riktigt.
 */
import { interpolateColor, useAnimatedStyle } from "react-native-reanimated";
import { darkColors, lightColors, type ThemeColors } from "./colors";

type ColorProp = "color" | "backgroundColor" | "borderColor" | "borderBottomColor";

/** Animerad stil där `prop` går från mörka till ljusa temats färg för `token`. */
export function useMorphStyle(progress: Readonly<{ value: number }>, prop: ColorProp, token: keyof ThemeColors) {
  const from = darkColors[token];
  const to = lightColors[token];
  return useAnimatedStyle(() => ({ [prop]: interpolateColor(progress.value, [0, 1], [from, to]) }));
}
