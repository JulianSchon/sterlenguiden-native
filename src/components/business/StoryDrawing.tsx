/**
 * Rita på storyn, som Instagrams penna: dra med fingret över bilden. Färgerna och tre tjocklekar
 * ligger nertill, Ångra och Klar upptill. Strecken ritas med react-native-svg, så de kommer med när
 * storyn fotograferas (makeImageFromView). Medan man ritar visas strecket ovanpå; när fingret
 * släpps läggs det till bland de färdiga.
 */
import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Undo2 } from "lucide-react-native";
import { TEXT_COLORS } from "@/components/business/StoryItems";
import { tb } from "@/i18n/business";

export interface Stroke { d: string; color: string; width: number }

const WIDTHS = [4, 9, 18];

/** Mjuk linje genom punkterna: kvadratiska kurvor genom mittpunkterna mellan dem */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y} L ${pts[0].x + 0.1} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${pts[i].x} ${pts[i].y} ${mx} ${my}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/** De färdiga strecken (inne i det som fotograferas) */
export function StrokesView({ strokes, width, height }: { strokes: Stroke[]; width: number; height: number }) {
  if (strokes.length === 0) return null;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {strokes.map((st, i) => (
        <Path key={i} d={st.d} stroke={st.color} strokeWidth={st.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ))}
    </Svg>
  );
}

/** Ritläget ovanpå bilden: fångar fingret och visar verktygen */
export function DrawingTools({ width, height, canUndo, onStroke, onUndo, onDone }: {
  width: number;
  height: number;
  canUndo: boolean;
  onStroke: (stroke: Stroke) => void;
  onUndo: () => void;
  onDone: () => void;
}) {
  const [color, setColor] = useState("#FFFFFF");
  const [size, setSize] = useState(WIDTHS[1]);
  const [live, setLive] = useState<{ x: number; y: number }[]>([]);
  const points = useRef<{ x: number; y: number }[]>([]);
  const style = useRef({ color, size });
  style.current = { color, size };

  const begin = (x: number, y: number) => { points.current = [{ x, y }]; setLive(points.current); };
  const move = (x: number, y: number) => {
    const last = points.current[points.current.length - 1];
    // Punkter tätare än 2 pt hoppas över, så strecket blir jämnt och lätt att rita
    if (last && Math.abs(last.x - x) + Math.abs(last.y - y) < 2) return;
    points.current = [...points.current, { x, y }];
    setLive(points.current);
  };
  const end = () => {
    if (points.current.length > 0) onStroke({ d: smoothPath(points.current), color: style.current.color, width: style.current.size });
    points.current = [];
    setLive([]);
  };

  const gesture = useMemo(() => Gesture.Pan()
    .minDistance(0)
    .maxPointers(1)
    .onBegin((e) => { runOnJS(begin)(e.x, e.y); })
    .onUpdate((e) => { runOnJS(move)(e.x, e.y); })
    .onFinalize(() => { runOnJS(end)(); }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  return (
    <View style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill}>
          {live.length > 0 && (
            <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Path d={smoothPath(live)} stroke={color} strokeWidth={size} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </Svg>
          )}
        </View>
      </GestureDetector>

      <View style={s.top} pointerEvents="box-none">
        <TouchableOpacity onPress={onUndo} disabled={!canUndo} style={[s.round, !canUndo && { opacity: 0.4 }]} hitSlop={8} accessibilityLabel={tb("Ångra")}>
          <Undo2 size={20} color="#FFFFFF" strokeWidth={2.2} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDone} hitSlop={10}><Text style={s.done}>{tb("Klar")}</Text></TouchableOpacity>
      </View>

      <View style={s.bottom} pointerEvents="box-none">
        <View style={s.sizes}>
          {WIDTHS.map((w) => (
            <Pressable
              key={w}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setSize(w); }}
              style={[s.sizeBtn, size === w && s.sizeBtnOn]}
              accessibilityLabel={tb("Tjocklek")}
            >
              <View style={{ width: w + 2, height: w + 2, borderRadius: (w + 2) / 2, backgroundColor: color }} />
            </Pressable>
          ))}
        </View>
        <View style={s.colors}>
          {TEXT_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setColor(c); }}
              style={[s.color, { backgroundColor: c }, color === c && s.colorOn]}
              accessibilityLabel={tb("Färg")}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  top: { position: "absolute", top: 10, left: 10, right: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.38)" },
  done: { fontFamily: "Inter_700Bold", fontSize: 17, color: "#FFFFFF", textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 6 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 14, alignItems: "center", gap: 12 },
  sizes: { flexDirection: "row", gap: 10 },
  sizeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.38)" },
  sizeBtnOn: { borderWidth: 2, borderColor: "#FFFFFF" },
  colors: { flexDirection: "row", gap: 10 },
  color: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "rgba(255,255,255,0.75)" },
  colorOn: { borderWidth: 3.5, borderColor: "#FFFFFF", transform: [{ scale: 1.15 }] },
});
