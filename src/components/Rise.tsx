/**
 * Tonar in och glider upp 14 px när sidan öppnas. Ge varje block sitt löpnummer
 * (index), så veckas sidan ut uppifrån och ner med 70 ms mellan blocken.
 */
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { Easing, FadeInDown } from "react-native-reanimated";

export function Rise({ index, children, style }: { index: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View
      style={style}
      entering={FadeInDown
        .withInitialValues({ opacity: 0, transform: [{ translateY: 14 }] })
        .duration(500)
        .delay(80 + index * 70)
        .easing(Easing.bezierFn(0.22, 0.61, 0.36, 1))}
    >
      {children}
    </Animated.View>
  );
}
