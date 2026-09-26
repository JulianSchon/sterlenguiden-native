/**
 * Bild från nätet som tonas in när den laddats i stället för att ploppa fram. En bild som redan
 * visats under den här sessionen visas direkt, så sidor man kommer tillbaka till står still.
 */
import { useRef } from "react";
import { Animated, StyleSheet, type ImageStyle, type StyleProp } from "react-native";

const shown = new Set<string>();

export function FadeImage({ uri, style }: { uri: string; style?: StyleProp<ImageStyle> }) {
  const opacity = useRef(new Animated.Value(shown.has(uri) ? 1 : 0)).current;
  return (
    <Animated.Image
      source={{ uri }}
      style={[styles.fill, style, { opacity }]}
      onLoad={() => {
        shown.add(uri);
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      }}
    />
  );
}

const styles = StyleSheet.create({ fill: { width: "100%", height: "100%" } });
