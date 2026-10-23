/**
 * Platssidans stora bild överst: platsens bilder att svepa mellan, med prickar längst ner som
 * visar var man är (pricken för bilden man står på är vit och utdragen, och följer fingret medan
 * man sveper). Nederkanten tonar mjukt över i sidans bakgrund i stället för att sluta med en rak
 * kant.
 *
 * Följer sidans scroll — bilden glider lite långsammare än sidan (djup), och drar man ner sidan
 * i toppen sträcks den i stället för att lämna ett tomt glapp. Trycker man öppnas bilderna i
 * helskärm (PhotoViewer).
 *
 * Bilden får sticka ut nedåt när den glider; innehållet under den har en hel bakgrund och ligger
 * ovanpå. Toningen sitter fast i bildytans nederkant, så övergången är mjuk hela tiden.
 */
import { forwardRef, memo, useCallback, useImperativeHandle, useRef } from "react";
import {
  Pressable, StyleSheet, View, useWindowDimensions, type FlatList, type NativeScrollEvent, type NativeSyntheticEvent,
} from "react-native";
import Reanimated, {
  interpolateColor, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue,
} from "react-native-reanimated";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "@/theme/categories";
import i18n from "i18next";

/** Hur hög toningen ner mot bakgrunden är */
const FADE_H = 130;
const DOT = 6;
const DOT_ON = 18;

/** Sidan hoppar till en bild (när helskärmen stängs på en annan bild än den man öppnade) */
export interface PlaceHeroHandle { show: (index: number) => void }

export const PlaceHero = memo(forwardRef<PlaceHeroHandle, {
  images: string[];
  height: number;
  /** Sidans scroll */
  scrollY: SharedValue<number>;
  onOpen: (index: number) => void;
  /** Kategorins ikon, om platsen saknar bilder */
  Icon: LucideIcon;
  topInset: number;
}>(function PlaceHero({ images, height, scrollY, onOpen, Icon, topInset }, ref) {
  const { width } = useWindowDimensions();
  const { colors, scheme } = useTheme();
  const listRef = useRef<FlatList<string>>(null);
  // Bilden som visas hålls här (inte i sidans state), så att ett svep inte ritar om hela sidan
  const shown = useRef(0);
  const scrollX = useSharedValue(0);

  useImperativeHandle(ref, () => ({
    show: (index: number) => {
      if (index === shown.current) return;
      shown.current = index;
      listRef.current?.scrollToOffset({ offset: index * width, animated: false });
    },
  }), [width]);

  const onScrollX = useAnimatedScrollHandler({ onScroll: (e) => { scrollX.value = e.contentOffset.x; } });
  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    shown.current = Math.round(e.nativeEvent.contentOffset.x / width);
  }, [width]);

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
          <Reanimated.FlatList
            ref={listRef as never}
            data={images}
            horizontal
            pagingEnabled
            scrollEnabled={images.length > 1}
            getItemLayout={(_, i) => ({ length: width, offset: i * width, index: i })}
            keyExtractor={(uri, i) => `${i}-${uri}`}
            renderItem={renderItem}
            showsHorizontalScrollIndicator={false}
            onScroll={onScrollX}
            scrollEventThrottle={16}
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

      {/* Nederkanten tonar över i bakgrunden — mjukt i början, helt i botten */}
      <LinearGradient
        colors={[withAlpha(colors.bg, 0), withAlpha(colors.bg, 0.25), withAlpha(colors.bg, 0.72), colors.bg]}
        locations={[0, 0.35, 0.72, 1]}
        style={s.bottomFade}
        pointerEvents="none"
      />

      {images.length > 1 && (
        <View style={s.dots} pointerEvents="none">
          {images.map((_, i) => (
            <Dot key={i} i={i} scrollX={scrollX} width={width} dark={scheme === "dark"} />
          ))}
        </View>
      )}
    </View>
  );
}));

/** En prick: utdragen och vit för bilden man står på, grå för de andra — följer svepet mjukt */
function Dot({ i, scrollX, width, dark }: { i: number; scrollX: SharedValue<number>; width: number; dark: boolean }) {
  const off = dark ? "rgba(255,255,255,0.38)" : "rgba(29,27,22,0.22)";
  const on = dark ? "#FFFFFF" : "#1D1B16";
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, 1 - Math.abs(scrollX.value / width - i));
    return { width: DOT + (DOT_ON - DOT) * t, backgroundColor: interpolateColor(t, [0, 1], [off, on]) };
  });
  return <Reanimated.View style={[s.dot, style]} />;
}

const HeroImage = memo(function HeroImage({ uri, width, height, first, onPress }: {
  uri: string; width: number; height: number; first: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ width, height, backgroundColor: colors.fill }} accessibilityLabel={i18n.t("place.fullscreen")}>
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
  bottomFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: FADE_H },
  dots: {
    position: "absolute", left: 0, right: 0, bottom: 16,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6,
  },
  dot: { height: DOT, borderRadius: DOT / 2 },
});
