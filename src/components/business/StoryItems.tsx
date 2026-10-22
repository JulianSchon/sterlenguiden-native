/**
 * Det man lägger ovanpå en berättelse: text, emoji, platsens namn och en länk till ett erbjudande
 * eller evenemang. Varje sak dras med ett finger, nyps större/mindre och vrids med två, och dras
 * till papperskorgen nertill för att tas bort. Allt rör sig på UI-tråden.
 */
import { memo, useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { CalendarDays, ChevronRight, MapPin, Ticket } from "lucide-react-native";

export type FontId = "classic" | "modern" | "elegant" | "hand" | "type";
export type TextBg = "none" | "solid" | "soft";

export const FONTS: { id: FontId; label: string; family: string; upper?: boolean }[] = [
  { id: "classic", label: "Klassisk", family: "Montserrat_700Bold" },
  { id: "modern", label: "Modern", family: "Inter_600SemiBold" },
  { id: "elegant", label: "Elegant", family: "PlayfairDisplay_700Bold" },
  { id: "hand", label: "Handskrift", family: "Caveat_700Bold" },
  { id: "type", label: "Skrivmaskin", family: "ShareTechMono_400Regular", upper: true },
];

export const TEXT_COLORS = ["#FFFFFF", "#111111", "#E4C67A", "#E5484D", "#F97316", "#2E9E6B", "#3B82F6", "#EC4899"];

export type StoryItem =
  | { id: string; kind: "text"; text: string; font: FontId; color: string; bg: TextBg }
  | { id: string; kind: "emoji"; text: string }
  | { id: string; kind: "place"; text: string }
  | { id: string; kind: "link"; link: { kind: "offer" | "event"; id: string }; title: string; sub: string };

/** Var saken är: mitten (x, y) i bildens punkter, storlek, vridning och mätt bredd/höjd */
export interface ItemMotion {
  x: SharedValue<number>;
  y: SharedValue<number>;
  scale: SharedValue<number>;
  rot: SharedValue<number>;
  w: SharedValue<number>;
  h: SharedValue<number>;
}

/** Ljus eller mörk text på en färgad bakgrund */
export function contrastOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? "#111111" : "#FFFFFF";
}

export function ItemView({ item, maxWidth }: { item: StoryItem; maxWidth: number }) {
  if (item.kind === "text") {
    const font = FONTS.find((f) => f.id === item.font) ?? FONTS[0];
    const solid = item.bg === "solid";
    const soft = item.bg === "soft";
    return (
      <View style={[s.textBox, solid && { backgroundColor: item.color }, soft && s.soft, { maxWidth }]}>
        <Text
          style={[
            s.text,
            { fontFamily: font.family, color: solid ? contrastOn(item.color) : item.color },
            font.id === "hand" && { fontSize: 40, lineHeight: 44 },
            font.upper && { textTransform: "uppercase", letterSpacing: 1 },
            item.bg === "none" && s.shadow,
          ]}
        >
          {item.text}
        </Text>
      </View>
    );
  }
  if (item.kind === "emoji") return <Text style={s.emoji}>{item.text}</Text>;
  if (item.kind === "place") {
    return (
      <View style={s.place}>
        <MapPin size={20} color="#C2410C" strokeWidth={2.4} />
        <Text style={s.placeText} numberOfLines={1}>{item.text.toUpperCase()}</Text>
      </View>
    );
  }
  const Icon = item.link.kind === "offer" ? Ticket : CalendarDays;
  return (
    <View style={s.link}>
      <View style={s.linkIcon}><Icon size={20} color="#1A1408" strokeWidth={2.2} /></View>
      <View style={{ flexShrink: 1 }}>
        <Text style={s.linkKicker}>{item.link.kind === "offer" ? "Erbjudande" : "Evenemang"}</Text>
        <Text style={s.linkTitle} numberOfLines={1}>{item.title}</Text>
        {!!item.sub && <Text style={s.linkSub} numberOfLines={1}>{item.sub}</Text>}
      </View>
      <ChevronRight size={20} color="#1A1408" strokeWidth={2.4} />
    </View>
  );
}

/**
 * En sak på bilden som går att flytta. `trash` är papperskorgens mitt i skärmkoordinater: släpps
 * saken där tas den bort.
 */
export const MovableItem = memo(function MovableItem({
  item, motion, maxWidth, trash, onTap, onActive, onOverTrash, onDelete,
}: {
  item: StoryItem;
  motion: ItemMotion;
  maxWidth: number;
  trash: { x: number; y: number };
  onTap: (id: string) => void;
  onActive: (active: boolean) => void;
  onOverTrash: (over: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const start = useSharedValue({ x: 0, y: 0, scale: 1, rot: 0 });
  const over = useSharedValue(false);
  const lift = useSharedValue(1);
  const near = (ax: number, ay: number) => {
    "worklet";
    return Math.abs(ax - trash.x) < 60 && Math.abs(ay - trash.y) < 60;
  };

  const buzz = useCallback(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), []);

  const pan = Gesture.Pan()
    .minDistance(4)
    .averageTouches(true)
    .onStart(() => {
      start.value = { x: motion.x.value, y: motion.y.value, scale: motion.scale.value, rot: motion.rot.value };
      lift.value = withSpring(1.04, { damping: 18, stiffness: 260 });
      runOnJS(onActive)(true);
    })
    .onUpdate((e) => {
      motion.x.value = start.value.x + e.translationX;
      motion.y.value = start.value.y + e.translationY;
      const isOver = near(e.absoluteX, e.absoluteY);
      if (isOver !== over.value) {
        over.value = isOver;
        runOnJS(onOverTrash)(isOver);
        if (isOver) runOnJS(buzz)();
      }
    })
    .onEnd(() => {
      if (over.value) runOnJS(onDelete)(item.id);
    })
    .onFinalize(() => {
      over.value = false;
      lift.value = withSpring(1, { damping: 18, stiffness: 260 });
      runOnJS(onOverTrash)(false);
      runOnJS(onActive)(false);
    });
  const pinch = Gesture.Pinch()
    .onStart(() => { start.value = { ...start.value, scale: motion.scale.value }; })
    .onUpdate((e) => { motion.scale.value = Math.min(6, Math.max(0.3, start.value.scale * e.scale)); });
  const rotate = Gesture.Rotation()
    .onStart(() => { start.value = { ...start.value, rot: motion.rot.value }; })
    .onUpdate((e) => { motion.rot.value = start.value.rot + e.rotation; });
  const tap = Gesture.Tap().maxDistance(6).onEnd((_e, ok) => { if (ok) runOnJS(onTap)(item.id); });
  const gesture = Gesture.Race(Gesture.Simultaneous(pan, pinch, rotate), tap);

  const style = useAnimatedStyle(() => ({
    opacity: over.value ? 0.45 : 1,
    transform: [
      { translateX: motion.x.value - motion.w.value / 2 },
      { translateY: motion.y.value - motion.h.value / 2 },
      { rotate: `${motion.rot.value}rad` },
      { scale: motion.scale.value * lift.value * (over.value ? 0.6 : 1) },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Reanimated.View
        style={[s.item, style]}
        onLayout={(e) => { motion.w.value = e.nativeEvent.layout.width; motion.h.value = e.nativeEvent.layout.height; }}
      >
        <ItemView item={item} maxWidth={maxWidth} />
      </Reanimated.View>
    </GestureDetector>
  );
});

const s = StyleSheet.create({
  item: { position: "absolute", left: 0, top: 0 },
  textBox: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  soft: { backgroundColor: "rgba(0,0,0,0.5)" },
  text: { fontSize: 30, lineHeight: 36, textAlign: "center" },
  shadow: { textShadowColor: "rgba(0,0,0,0.45)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  emoji: { fontSize: 64, lineHeight: 76 },
  place: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  placeText: { fontFamily: "Montserrat_700Bold", fontSize: 18, letterSpacing: 0.3, color: "#C2410C" },
  link: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 8, paddingRight: 12, paddingVertical: 8,
    borderRadius: 16, backgroundColor: "#FFFFFF", maxWidth: 300,
  },
  linkIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#E4C67A" },
  linkKicker: { fontFamily: "Inter_700Bold", fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase", color: "#8A6A1F" },
  linkTitle: { fontFamily: "Montserrat_700Bold", fontSize: 16, color: "#111111" },
  linkSub: { fontFamily: "Inter_600SemiBold", fontSize: 12.5, color: "#444444" },
});
