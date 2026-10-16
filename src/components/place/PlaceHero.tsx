/**
 * Platssidans stora bild överst: platsens bilder att svepa mellan, med en räknare ("2 / 5").
 * Följer sidans scroll — bilden glider lite långsammare än sidan (djup), och drar man ner sidan
 * i toppen sträcks den i stället för att lämna ett tomt glapp. Trycker man öppnas bilderna i
 * helskärm (PhotoViewer).
 *
 * Bilden får sticka ut nedåt när den glider; innehållet under den har en hel bakgrund och ligger
 * ovanpå.
 */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from "react-native";
import Reanimated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";

export function PlaceHero({ images, height, scrollY, index, onIndexChange, onOpen, Icon, topInset }: {
  images: string[];
  height: number;
  /** Sidans scroll */
  scrollY: SharedValue<number>;
  /** Bilden som visas (sidan hoppar hit när helskärmen stängs) */
  index: number;
  onIndexChange: (index: number) => void;
  onOpen: (index: number) => void;
  /** Kategorins ikon, om platsen saknar bilder */
  Icon: LucideIcon;
  topInset: number;
}) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const listRef = useRef<FlatList<string>>(null);
  const shown = useRef(index);
  const [counter, setCounter] = useState(index);

  // Bytt bild utifrån (helskärmen stängdes på en annan bild): hoppa dit utan glidning
  useEffect(() => {
    if (index === shown.current) return;
    shown.current = index;
    setCounter(index);
    listRef.current?.scrollToOffset({ offset: index * width, animated: false });
  }, [index, width]);

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i === shown.current) return;
    shown.current = i;
    setCounter(i);
    onIndexChange(i);
  }, [width, onIndexChange]);

  const depth = useAnimatedStyle(() => {
    const y = scrollY.value;
    // Neddragen: toppen står kvar och bilden växer. Uppscrollad: glider med 40 % fart
    if (y < 0) return { transform: [{ translateY: y / 2 }, { scale: 1 - y / height }] };
    return { transform: [{ translateY: y * 0.4 }, { scale: 1 }] };
  });

  const renderItem = useCallback(({ item, index: i }: { item: string; index: number }) => (
    <HeroImage uri={item} width={width} height={height} first={i === 0} onPress={() => onOpen(i)} />
  ), [width, height, onOpen]);

  return (
    <View style={{ height }}>
      <Reanimated.View style={[StyleSheet.absoluteFill, depth]}>
        {images.length > 0 ? (
          <FlatList
            ref={listRef}
            data={images}
            horizontal
            pagingEnabled
            scrollEnabled={images.length > 1}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: i * width, index: i })}
            keyExtractor={(uri, i) => `${i}-${uri}`}
            renderItem={renderItem}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumEnd}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            windowSize={3}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, s.empty, { backgroundColor: colors.fill }]}>
            <Icon size={56} color={colors.faint} strokeWidth={1.4} />
          </View>
        )}
        {/* Skuggning bakom statusraden, så klockan syns mot ljusa bilder */}
        {images.length > 0 && (
          <LinearGradient
            colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]}
            style={[s.topShade, { height: topInset + 70 }]}
            pointerEvents="none"
          />
        )}
      </Reanimated.View>

      {images.length > 1 && (
        <View style={s.counter} pointerEvents="none">
          <Text style={s.counterText}>{counter + 1} / {images.length}</Text>
        </View>
      )}
    </View>
  );
}

const HeroImage = memo(function HeroImage({ uri, width, height, first, onPress }: {
  uri: string; width: number; height: number; first: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ width, height, backgroundColor: colors.fill }} accessibilityLabel="Visa bilden i helskärm">
      <ExpoImage
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority={first ? "high" : "normal"}
        transition={first ? 0 : 160}
      />
    </Pressable>
  );
});

const s = StyleSheet.create({
  empty: { alignItems: "center", justifyContent: "center" },
  topShade: { position: "absolute", top: 0, left: 0, right: 0 },
  counter: {
    position: "absolute", right: 16, bottom: 14,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "#141416",
  },
  counterText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#FFFFFF", fontVariant: ["tabular-nums"] },
});
