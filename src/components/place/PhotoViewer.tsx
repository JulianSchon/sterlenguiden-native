/**
 * Platsens bilder i helskärm. Svep åt sidan mellan bilderna, nyp för att zooma (två fingrar,
 * runt punkten man nyper vid), dubbeltryck för att zooma in där man trycker och ut igen, och dra
 * en inzoomad bild runt. Dra uppåt eller nedåt för att stänga — bakgrunden tonar bort medan man
 * drar, som i telefonens egen bildapp.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList, Modal, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from "react-native";
import Reanimated, {
  Easing, runOnJS, useAnimatedStyle, useSharedValue, withDecay, withSpring, withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { X } from "lucide-react-native";

const MAX_ZOOM = 4;
const TAP_ZOOM = 2.5;
const SETTLE = { stiffness: 380, damping: 38 };
const QUICK = { duration: 240, easing: Easing.out(Easing.cubic) };

export function PhotoViewer({ images, start, visible, onClose }: {
  images: string[];
  /** Bilden som trycktes */
  start: number;
  visible: boolean;
  /** Stängd; bilden man stod på (sidans bildspel hoppar dit) */
  onClose: (index: number) => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(start);
  const [zoomed, setZoomed] = useState(false);
  const indexRef = useRef(start);
  const shown = useSharedValue(0);
  const dragY = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    indexRef.current = start;
    setIndex(start);
    setZoomed(false);
    dragY.value = 0;
  }, [visible, start, dragY]);

  const finish = useCallback(() => onClose(indexRef.current), [onClose]);
  const close = useCallback(() => {
    shown.value = withTiming(0, { duration: 180 }, (done) => {
      if (done) runOnJS(finish)();
    });
  }, [shown, finish]);

  // Dra upp/ner för att stänga (bara när bilden inte är inzoomad). Sidled tar bildraden själv
  const native = useMemo(() => Gesture.Native(), []);
  const dismiss = useMemo(() => Gesture.Pan()
    .enabled(!zoomed)
    .activeOffsetY([-14, 14])
    .failOffsetX([-14, 14])
    .onUpdate((e) => { dragY.value = e.translationY; })
    .onEnd((e) => {
      if (Math.abs(e.translationY) > 110 || Math.abs(e.velocityY) > 900) {
        const dir = e.translationY >= 0 ? 1 : -1;
        dragY.value = withTiming(dir * height * 0.6, { duration: 200 });
        shown.value = withTiming(0, { duration: 200 }, (done) => {
          if (done) runOnJS(finish)();
        });
      } else {
        dragY.value = withSpring(0, SETTLE);
      }
    }), [zoomed, height, dragY, shown, finish]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: shown.value * (1 - Math.min(1, Math.abs(dragY.value) / (height * 0.5))),
  }));
  const stageStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: dragY.value }, { scale: 0.94 + 0.06 * shown.value }],
  }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: shown.value * (1 - Math.min(1, Math.abs(dragY.value) / 80)),
  }));

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    indexRef.current = i;
    setIndex(i);
  }, [width]);

  const renderItem = useCallback(({ item, index: i }: { item: string; index: number }) => (
    <ZoomableImage uri={item} width={width} height={height} active={i === index} onZoom={setZoomed} />
  ), [width, height, index]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onShow={() => { shown.value = withTiming(1, QUICK); }}
      onRequestClose={close}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Ljus statusrad mot det svarta, oavsett tema (sidans egen tar över igen när helskärmen stängs) */}
        <StatusBar style="light" />
        <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]} />
        <GestureDetector gesture={dismiss}>
          <Reanimated.View style={[StyleSheet.absoluteFill, stageStyle]}>
            <GestureDetector gesture={native}>
              <FlatList
                data={images}
                horizontal
                pagingEnabled
                scrollEnabled={!zoomed && images.length > 1}
                initialScrollIndex={start}
                getItemLayout={(_, i) => ({ length: width, offset: i * width, index: i })}
                keyExtractor={(uri, i) => `${i}-${uri}`}
                renderItem={renderItem}
                extraData={index}
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onMomentumEnd}
                initialNumToRender={1}
                maxToRenderPerBatch={2}
                windowSize={3}
              />
            </GestureDetector>
          </Reanimated.View>
        </GestureDetector>

        <Reanimated.View style={[s.chrome, { top: insets.top + 8 }, chromeStyle]} pointerEvents="box-none">
          <View style={{ width: 44 }} />
          {images.length > 1 ? (
            <View style={s.counter}>
              <Text style={s.counterText}>{index + 1} / {images.length}</Text>
            </View>
          ) : <View />}
          <TouchableOpacity style={s.close} onPress={close} hitSlop={10} accessibilityLabel="Stäng bilderna">
            <X size={22} color="#FFFFFF" strokeWidth={2.2} />
          </TouchableOpacity>
        </Reanimated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** En bild som går att zooma: nyp, dubbeltryck och dra (när den är inzoomad) */
const ZoomableImage = memo(function ZoomableImage({ uri, width, height, active, onZoom }: {
  uri: string; width: number; height: number; active: boolean; onZoom: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const from = useSharedValue({ s: 1, x: 0, y: 0, fx: 0, fy: 0 });
  const [zoomed, setZoomed] = useState(false);

  const report = useCallback((z: boolean) => {
    setZoomed(z);
    onZoom(z);
  }, [onZoom]);

  // En bild man svept förbi zoomas ut igen
  useEffect(() => {
    if (active) return;
    scale.value = withTiming(1, QUICK);
    tx.value = withTiming(0, QUICK);
    ty.value = withTiming(0, QUICK);
    setZoomed(false);
  }, [active, scale, tx, ty]);

  const gesture = useMemo(() => {
    // Hur långt bilden får flyttas vid en viss zoom (kanten stannar vid skärmens kant)
    const limit = (s: number, size: number) => {
      "worklet";
      return (size * (s - 1)) / 2;
    };
    const clamp = (v: number, max: number) => {
      "worklet";
      return Math.min(max, Math.max(-max, v));
    };
    const pinch = Gesture.Pinch()
      .onStart((e) => {
        from.value = { s: scale.value, x: tx.value, y: ty.value, fx: e.focalX - width / 2, fy: e.focalY - height / 2 };
      })
      .onUpdate((e) => {
        const f = from.value;
        const s = Math.min(MAX_ZOOM + 1, Math.max(0.85, f.s * e.scale));
        // Punkten mellan fingrarna står still medan bilden växer runt den
        const k = s / f.s;
        tx.value = f.fx - (f.fx - f.x) * k;
        ty.value = f.fy - (f.fy - f.y) * k;
        scale.value = s;
      })
      .onEnd(() => {
        const s = Math.min(MAX_ZOOM, Math.max(1, scale.value));
        scale.value = withSpring(s, SETTLE);
        tx.value = withSpring(clamp(tx.value, limit(s, width)), SETTLE);
        ty.value = withSpring(clamp(ty.value, limit(s, height)), SETTLE);
        runOnJS(report)(s > 1.02);
      });
    const pan = Gesture.Pan()
      .enabled(zoomed)
      .averageTouches(true)
      .onStart(() => {
        from.value = { ...from.value, x: tx.value, y: ty.value };
      })
      .onUpdate((e) => {
        tx.value = from.value.x + e.translationX;
        ty.value = from.value.y + e.translationY;
      })
      .onEnd((e) => {
        const mx = limit(scale.value, width);
        const my = limit(scale.value, height);
        tx.value = withDecay({ velocity: e.velocityX, clamp: [-mx, mx] });
        ty.value = withDecay({ velocity: e.velocityY, clamp: [-my, my] });
      });
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(260)
      .onEnd((e) => {
        if (scale.value > 1.02) {
          scale.value = withTiming(1, QUICK);
          tx.value = withTiming(0, QUICK);
          ty.value = withTiming(0, QUICK);
          runOnJS(report)(false);
          return;
        }
        // Zooma in där man tryckte
        const fx = e.x - width / 2;
        const fy = e.y - height / 2;
        scale.value = withTiming(TAP_ZOOM, QUICK);
        tx.value = withTiming(clamp(-fx * (TAP_ZOOM - 1), limit(TAP_ZOOM, width)), QUICK);
        ty.value = withTiming(clamp(-fy * (TAP_ZOOM - 1), limit(TAP_ZOOM, height)), QUICK);
        runOnJS(report)(true);
      });
    return Gesture.Simultaneous(pinch, pan, doubleTap);
  }, [zoomed, width, height, scale, tx, ty, from, report]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height, overflow: "hidden" }}>
        <Reanimated.View style={[StyleSheet.absoluteFill, style]}>
          <ExpoImage source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" transition={120} />
        </Reanimated.View>
      </View>
    </GestureDetector>
  );
});

const s = StyleSheet.create({
  backdrop: { backgroundColor: "#000000" },
  chrome: {
    position: "absolute", left: 16, right: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  counter: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#1C1C1E" },
  counterText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#FFFFFF", fontVariant: ["tabular-nums"] },
  close: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#1C1C1E",
  },
});
