/**
 * En tryckbar yta som trycks ihop lite med en fjäder i stället för att fada
 * eller färgas. Samma fjäder som knapparna på Profil, så det känns likadant
 * överallt i appen.
 *
 * Dämpningen är satt till (nästan) kritisk för respektive styvhet, inte under — en underdämpad
 * fjäder (dämpningskvot < 1) SVÄNGER FÖRBI målvärdet och studsar tillbaka innan den lägger sig,
 * vilket lästes som att ytan "studsade" i stället för att bara krympa och återgå rakt av.
 */
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

export function PressableScale({
  children, style, scale = 0.95, disabled, ...rest
}: PressableProps & { children: React.ReactNode; style?: StyleProp<ViewStyle>; scale?: number }) {
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  return (
    <Pressable
      disabled={disabled}
      onPressIn={(e) => { press.value = withSpring(scale, { damping: 36, stiffness: 320 }); rest.onPressIn?.(e); }}
      onPressOut={(e) => { press.value = withSpring(1, { damping: 32, stiffness: 260 }); rest.onPressOut?.(e); }}
      {...rest}
    >
      <Reanimated.View style={[style, pressStyle, disabled && { opacity: 0.5 }]}>
        {children}
      </Reanimated.View>
    </Pressable>
  );
}
