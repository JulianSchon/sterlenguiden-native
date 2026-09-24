/**
 * Ett kort som ser ut som ett fysiskt material som ljuset träffar uppifrån
 * vänster. Fyra lager jobbar ihop:
 *  1. en diagonal gradient (145°) i stället för en platt färg,
 *  2. en hårfin kant (0,5 px),
 *  3. ett svagt ljusstreck inuti uppe till vänster (högdager),
 *  4. en mjuk skugga som bleknar snabbt.
 * Skuggan ligger på ett yttre lager, eftersom den försvinner om samma vy
 * också klipper sitt innehåll (overflow: hidden). Färgerna kommer från temat.
 */
import type { ReactNode } from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";

export function GradientCard({
  children, style, borderColor, radius = 22,
}: { children: ReactNode; style?: StyleProp<ViewStyle>; borderColor?: string; radius?: number }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      style={[
        {
          borderRadius: radius,
          backgroundColor: colors.cardBottom,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: scheme === "dark" ? 0.4 : 0.1,
          shadowRadius: 10,
          elevation: 4,
        },
        style,
      ]}
    >
      <View
        style={{
          borderRadius: radius, overflow: "hidden", borderWidth: 0.5, borderColor: borderColor ?? colors.border,
        }}
      >
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" pointerEvents="none">
          <Defs>
            <LinearGradient id="card-gradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.cardTop} />
              <Stop offset="1" stopColor={colors.cardBottom} />
            </LinearGradient>
            {/* Ljusstreck som bara täcker övre vänstra delen */}
            <LinearGradient id="card-highlight" x1="0" y1="0" x2="0.6" y2="0.6">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={scheme === "dark" ? 0.02 : 0.6} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#card-gradient)" />
          <Rect width="100%" height="100%" fill="url(#card-highlight)" />
        </Svg>
        {children}
      </View>
    </View>
  );
}
