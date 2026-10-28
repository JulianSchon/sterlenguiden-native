/**
 * Det man lägger ovanpå en berättelse: text, emoji, klistermärken ("Nyhet!", klockan …), en bild
 * till, platsens namn och en länk till ett erbjudande eller evenemang. Varje sak dras med ett finger,
 * nyps större/mindre och vrids med två, och dras till papperskorgen nertill för att tas bort. Ett
 * osynligt grepp runt varje sak gör att även små saker går att nypa och vrida. Platsen, länken och
 * klistermärkena byter stil vid tryck (smal vit → kvadrat vit → smal svart → kvadrat svart). När en
 * sak dras nära mitten syns en hjälplinje och saken fastnar där, som på Instagram. Den sak man rör
 * läggs överst. Allt rör sig på UI-tråden.
 */
import { memo, useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { CalendarDays, ChevronRight, MapPin, Ticket } from "lucide-react-native";
import { tb } from "@/i18n/business";
import { PollCard, QuestionCard } from "@/components/stories/StoryInteractions";

export type FontId = "classic" | "modern" | "elegant" | "hand" | "type";
export type TextBg = "none" | "solid" | "soft";
export type TextAlign = "left" | "center" | "right";
/** Textens storlek (punkter) när den skrivs; reglaget i textläget går mellan dessa */
export const TEXT_SIZE = { min: 18, base: 30, max: 64 };

export const FONTS: { id: FontId; label: string; family: string; upper?: boolean }[] = [
  { id: "classic", label: "Klassisk", family: "Montserrat_700Bold" },
  { id: "modern", label: "Modern", family: "Inter_600SemiBold" },
  { id: "elegant", label: "Elegant", family: "PlayfairDisplay_700Bold" },
  { id: "hand", label: "Handskrift", family: "Caveat_700Bold" },
  { id: "type", label: "Skrivmaskin", family: "ShareTechMono_400Regular", upper: true },
];

export const TEXT_COLORS = ["#FFFFFF", "#111111", "#E4C67A", "#E5484D", "#F97316", "#2E9E6B", "#3B82F6", "#EC4899"];

/** Stilen på plats, länk och klistermärke: 0 smal vit, 1 kvadrat vit, 2 smal svart, 3 kvadrat svart */
type Look = 0 | 1 | 2 | 3;
export const nextLook = (look: Look): Look => ((look + 1) % 4) as Look;

/** Färdiga klistermärken (klockan läggs till med den aktuella tiden) */
export const BADGES = ["Nyhet!", "Öppet i dag", "Dagens lunch", "Nybakat", "Välkommen in", "Sista chansen", "Slutsålt"];

export type StoryItem =
  | { id: string; kind: "text"; text: string; font: FontId; color: string; bg: TextBg; size: number; align: TextAlign }
  | { id: string; kind: "emoji"; text: string }
  | { id: string; kind: "badge"; text: string; look: Look }
  | { id: string; kind: "photo"; uri: string; ratio: number }
  /** Enkät och fråga: visas levande i storyn (ritas inte in i bilden), högst en av dem per story */
  | { id: string; kind: "poll"; question: string; options: [string, string] }
  | { id: string; kind: "question"; prompt: string }
  | { id: string; kind: "place"; text: string; look: Look }
  | { id: string; kind: "link"; link: { kind: "offer" | "event"; id: string }; title: string; sub: string; look: Look };

/** Det osynliga greppet runt varje sak (räknas bort när länkens yta sparas) */
export const TOUCH_PAD = 28;

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

/** Textens radavstånd och storlek: handskriften är lite större för att se lika stor ut */
export function textMetrics(font: FontId, size: number) {
  const fontSize = font === "hand" ? size * 1.33 : size;
  return { fontSize, lineHeight: Math.round(fontSize * 1.2) };
}

function ItemView({ item, maxWidth }: { item: StoryItem; maxWidth: number }) {
  if (item.kind === "text") {
    const font = FONTS.find((f) => f.id === item.font) ?? FONTS[0];
    const solid = item.bg === "solid";
    const soft = item.bg === "soft";
    return (
      <View style={[s.textBox, solid && { backgroundColor: item.color }, soft && s.soft, { maxWidth }]}>
        <Text
          style={[
            { fontFamily: font.family, color: solid ? contrastOn(item.color) : item.color, textAlign: item.align },
            textMetrics(item.font, item.size),
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
  if (item.kind === "poll") return <PollCard question={item.question} options={item.options} />;
  if (item.kind === "question") return <QuestionCard prompt={item.prompt} />;
  if (item.kind === "photo") {
    const w = maxWidth * 0.52;
    return <ExpoImage source={{ uri: item.uri }} style={[s.photo, { width: w, height: w / item.ratio }]} contentFit="cover" />;
  }
  const dark = item.look >= 2;
  const square = item.look % 2 === 1;
  const ink = dark ? "#FFFFFF" : "#111111";
  const box = dark ? s.boxDark : s.boxLight;
  if (item.kind === "badge") {
    return (
      <View style={[box, square ? s.badgeSquare : s.badgeWide]}>
        <Text style={[s.badgeText, square ? s.badgeTextSquare : null, { color: dark ? "#E4C67A" : "#111111" }]} numberOfLines={square ? 3 : 1}>
          {item.text.toUpperCase()}
        </Text>
      </View>
    );
  }
  if (item.kind === "place") {
    return (
      <View style={[box, square ? s.placeSquare : s.placeWide]}>
        <MapPin size={square ? 30 : 20} color={dark ? "#E4C67A" : "#C2410C"} strokeWidth={2.4} />
        <Text style={[s.placeText, square && s.placeTextSquare, { color: dark ? "#FFFFFF" : "#C2410C" }]} numberOfLines={square ? 2 : 1}>
          {item.text.toUpperCase()}
        </Text>
      </View>
    );
  }
  const Icon = item.link.kind === "offer" ? Ticket : CalendarDays;
  const kicker = item.link.kind === "offer" ? tb("Erbjudande") : tb("Evenemang");
  if (square) {
    return (
      <View style={[box, s.linkSquare]}>
        <View style={s.linkIconBig}><Icon size={26} color="#1A1408" strokeWidth={2.2} /></View>
        <Text style={[s.linkKicker, dark && { color: "#E4C67A" }]}>{kicker}</Text>
        <Text style={[s.linkTitle, s.linkTitleSquare, { color: ink }]} numberOfLines={2}>{item.title}</Text>
        {!!item.sub && <Text style={[s.linkSub, s.center, dark && { color: "rgba(255,255,255,0.7)" }]} numberOfLines={1}>{item.sub}</Text>}
      </View>
    );
  }
  return (
    <View style={[box, s.link]}>
      <View style={s.linkIcon}><Icon size={20} color="#1A1408" strokeWidth={2.2} /></View>
      <View style={{ flexShrink: 1 }}>
        <Text style={[s.linkKicker, dark && { color: "#E4C67A" }]}>{kicker}</Text>
        <Text style={[s.linkTitle, { color: ink }]} numberOfLines={1}>{item.title}</Text>
        {!!item.sub && <Text style={[s.linkSub, dark && { color: "rgba(255,255,255,0.7)" }]} numberOfLines={1}>{item.sub}</Text>}
      </View>
      <ChevronRight size={20} color={ink} strokeWidth={2.4} />
    </View>
  );
}

/**
 * En sak på bilden som går att flytta. `trash` är papperskorgens mitt i skärmkoordinater: släpps
 * saken där tas den bort.
 */
export const MovableItem = memo(function MovableItem({
  item, motion, maxWidth, trash, center, onTap, onFront, onGuides, onActive, onOverTrash, onDelete,
}: {
  item: StoryItem;
  motion: ItemMotion;
  maxWidth: number;
  trash: { x: number; y: number };
  /** Bildens mitt: där saken fastnar och hjälplinjerna går */
  center: { x: number; y: number };
  onTap: (id: string) => void;
  /** Saken rördes: lägg den överst */
  onFront: (id: string) => void;
  /** Vilka hjälplinjer som syns (lodrät genom mitten, vågrät genom mitten) */
  onGuides: (vertical: boolean, horizontal: boolean) => void;
  onActive: (active: boolean) => void;
  onOverTrash: (over: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const start = useSharedValue({ x: 0, y: 0, scale: 1, rot: 0 });
  const over = useSharedValue(false);
  const lift = useSharedValue(1);
  const snapX = useSharedValue(false);
  const snapY = useSharedValue(false);
  const SNAP = 10;
  const near = (ax: number, ay: number) => {
    "worklet";
    return Math.abs(ax - trash.x) < 60 && Math.abs(ay - trash.y) < 60;
  };

  const buzz = useCallback(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), []);

  const pan = Gesture.Pan()
    .minDistance(4)
    .averageTouches(true)
    .onBegin(() => { runOnJS(onFront)(item.id); })
    .onStart(() => {
      start.value = { x: motion.x.value, y: motion.y.value, scale: motion.scale.value, rot: motion.rot.value };
      lift.value = withSpring(1.04, { damping: 18, stiffness: 260 });
      runOnJS(onActive)(true);
    })
    .onUpdate((e) => {
      const x = start.value.x + e.translationX;
      const y = start.value.y + e.translationY;
      // Nära mitten: saken fastnar där och hjälplinjen visas, med en liten knack
      const sx = Math.abs(x - center.x) < SNAP;
      const sy = Math.abs(y - center.y) < SNAP;
      motion.x.value = sx ? center.x : x;
      motion.y.value = sy ? center.y : y;
      if (sx !== snapX.value || sy !== snapY.value) {
        if ((sx && !snapX.value) || (sy && !snapY.value)) runOnJS(buzz)();
        snapX.value = sx;
        snapY.value = sy;
        runOnJS(onGuides)(sx, sy);
      }
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
      if (snapX.value || snapY.value) runOnJS(onGuides)(false, false);
      snapX.value = false;
      snapY.value = false;
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
        style={[s.item, s.grip, style]}
        onLayout={(e) => { motion.w.value = e.nativeEvent.layout.width; motion.h.value = e.nativeEvent.layout.height; }}
      >
        <ItemView item={item} maxWidth={maxWidth} />
      </Reanimated.View>
    </GestureDetector>
  );
});

const s = StyleSheet.create({
  item: { position: "absolute", left: 0, top: 0 },
  grip: { padding: TOUCH_PAD },
  boxLight: { backgroundColor: "#FFFFFF" },
  boxDark: { backgroundColor: "rgba(17,17,17,0.88)" },
  badgeWide: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 14, alignItems: "center" },
  badgeSquare: { width: 130, height: 130, borderRadius: 22, padding: 12, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: "Montserrat_700Bold", fontSize: 20, letterSpacing: 0.6 },
  badgeTextSquare: { fontSize: 22, lineHeight: 27, textAlign: "center" },
  photo: { borderRadius: 12, borderWidth: 4, borderColor: "#FFFFFF" },
  textBox: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  soft: { backgroundColor: "rgba(0,0,0,0.5)" },
  shadow: { textShadowColor: "rgba(0,0,0,0.45)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  emoji: { fontSize: 64, lineHeight: 76 },
  placeWide: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  placeSquare: { width: 140, minHeight: 140, borderRadius: 22, padding: 14, gap: 8, alignItems: "center", justifyContent: "center" },
  placeText: { fontFamily: "Montserrat_700Bold", fontSize: 18, letterSpacing: 0.3 },
  placeTextSquare: { fontSize: 17, lineHeight: 21, textAlign: "center" },
  link: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 8, paddingRight: 12, paddingVertical: 8, borderRadius: 16, maxWidth: 300 },
  linkSquare: { width: 170, minHeight: 170, borderRadius: 24, padding: 14, gap: 4, alignItems: "center", justifyContent: "center" },
  linkIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#E4C67A" },
  linkIconBig: { width: 54, height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#E4C67A", marginBottom: 6 },
  linkKicker: { fontFamily: "Inter_700Bold", fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase", color: "#8A6A1F" },
  linkTitle: { fontFamily: "Montserrat_700Bold", fontSize: 16 },
  linkTitleSquare: { fontSize: 17, lineHeight: 21, textAlign: "center" },
  linkSub: { fontFamily: "Inter_600SemiBold", fontSize: 12.5, color: "#444444" },
  center: { textAlign: "center" },
});
