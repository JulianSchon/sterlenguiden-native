/**
 * Tonar in innehållet när `value` ändras efter första bilden (t.ex. en siffra som först visas
 * när data laddats). Vid första ritningen sker ingen animation, så sidor som öppnas med redan
 * hämtad data står helt still.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";

export function FadeOnChange({ value, style, children }: { value: unknown; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [value, opacity]);

  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}
