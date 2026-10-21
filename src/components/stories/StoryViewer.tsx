/**
 * Berättelserna i helskärm, som i Instagram.
 *
 * - Öppnas genom att växa ut ur cirkeln man tryckte på, och krymper tillbaka in i den när den stängs.
 * - Tryck till höger = nästa berättelse, till vänster = förra. Håll inne = paus (allt runt bilden
 *   tonar bort medan man håller).
 * - Svep åt sidan = nästa/förra företag, med kuben: sidorna vrids som sidor på en tärning.
 * - Dra nedåt = stäng. Berättelsen krymper medan man drar och Hem syns bakom (i temats färg).
 * - Strecken överst fylls på i takt, och tiden startar först när bilden laddats.
 *
 * Allt som rör sig räknas på UI-tråden (Reanimated + gesture handler). Appens egen kod ritar bara
 * om när man byter berättelse. Sett-markeringarna sparas direkt men listan på Hem uppdateras först
 * när visaren stängs — annars bytte cirklarna plats under ens fingrar.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import Reanimated, {
  Easing, cancelAnimation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { ArrowUpRight, Crown, X } from "lucide-react-native";
import type { BusinessStory } from "@/hooks/useBusinessStories";
import { markStoryViewed } from "@/hooks/useStoryViews";
import { useTheme } from "@/theme/ThemeProvider";

export type StoryType = "favorite" | "regular";

export interface StoryGroupData {
  placeId: number;
  placeName: string;
  placeCategory?: string | null;
  placeLocation?: string | null;
  logoUrl: string | null;
  storyType: StoryType;
  stories: BusinessStory[];
}

/** Cirkeln man tryckte på (fönsterkoordinater) — berättelsen växer ut ur den */
export interface StoryOrigin { x: number; y: number; size: number }

const STORY_MS = 5000;
const OPEN = { duration: 300, easing: Easing.out(Easing.cubic) };
const CLOSE = { duration: 240, easing: Easing.in(Easing.quad) };
const SPRING = { stiffness: 380, damping: 36 };

/** "nu", "12 min", "3 h", "i går" */
function ago(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "nu";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h` : "i går";
}

export function StoryViewer({ groups, startGroup, startStory, origin, presented, onOpenPlace, onClosed }: {
  /** Grupperna som de såg ut när visaren öppnades (ändras inte medan den är öppen) */
  groups: StoryGroupData[];
  startGroup: number;
  /** Var i gruppen man börjar (den första man inte sett) */
  startStory: number;
  origin: StoryOrigin | null;
  /** Modalen syns: öppningen kan börja */
  presented: boolean;
  onOpenPlace: (placeId: number) => void;
  onClosed: () => void;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const { colors } = useTheme();
  const [group, setGroup] = useState(startGroup);
  // Var man är i varje grupp (grannarna i kuben visar sin)
  const [storyAt, setStoryAt] = useState<Record<number, number>>(() => ({ [startGroup]: startStory }));
  const story = storyAt[group] ?? 0;
  // Bilderna som laddats (grannarna i kuben laddar sina i förväg)
  const [loadedIds, setLoadedIds] = useState<ReadonlySet<string>>(() => new Set());
  const onLoaded = useCallback((id: string) => {
    setLoadedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);
  const current = groups[group]?.stories[story];

  // ── Det som rör sig ──
  const open = useSharedValue(0);
  const dragY = useSharedValue(0);
  const pos = useSharedValue(startGroup);
  const progress = useSharedValue(0);
  const held = useSharedValue(0);
  const closing = useRef(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (presented) open.value = withTiming(1, OPEN);
  }, [presented, open]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    cancelAnimation(progress);
    open.value = withTiming(0, CLOSE, (done) => {
      if (done) runOnJS(onClosed)();
    });
  }, [open, progress, onClosed]);

  // ── Att gå framåt och bakåt ──
  const setStory = useCallback((g: number, s: number) => {
    setStoryAt((m) => ({ ...m, [g]: s }));
  }, []);
  const toGroup = useCallback((g: number) => {
    if (g < 0) { pos.value = withSpring(0, SPRING); return; }
    if (g >= groups.length) { close(); return; }
    Haptics.selectionAsync().catch(() => {});
    pos.value = withTiming(g, { duration: 320, easing: Easing.out(Easing.cubic) }, (done) => {
      if (done) runOnJS(setGroup)(g);
    });
  }, [groups.length, pos, close]);
  const next = useCallback(() => {
    const g = groups[group];
    if (!g) return;
    if (story < g.stories.length - 1) setStory(group, story + 1);
    else toGroup(group + 1);
  }, [groups, group, story, setStory, toGroup]);
  const prev = useCallback(() => {
    if (story > 0) setStory(group, story - 1);
    else if (group > 0) toGroup(group - 1);
    else progress.value = 0;
  }, [group, story, setStory, toGroup, progress]);

  // ── Tiden: startar när bilden laddats, stannar vid paus ──
  const remaining = useRef(STORY_MS);
  useEffect(() => {
    remaining.current = STORY_MS;
    progress.value = 0;
  }, [group, story, progress]);
  const isLoaded = !!current && loadedIds.has(current.id);
  const running = isLoaded && !paused && presented;
  useEffect(() => {
    if (!running) return;
    const ms = Math.max(1, (1 - progress.value) * STORY_MS);
    progress.value = withTiming(1, { duration: ms, easing: Easing.linear }, (done) => {
      if (done) runOnJS(next)();
    });
    return () => cancelAnimation(progress);
  }, [running, next, progress]);

  // Sett när bilden väl syns
  const marked = useRef(new Set<string>());
  useEffect(() => {
    if (!current || !isLoaded || marked.current.has(current.id)) return;
    marked.current.add(current.id);
    markStoryViewed(current.id);
  }, [current, isLoaded]);

  // Nästa bild (och nästa grupps första) laddas i förväg
  useEffect(() => {
    const g = groups[group];
    const upcoming = [g?.stories[story + 1]?.image_url, groups[group + 1]?.stories[0]?.image_url].filter(Boolean) as string[];
    if (upcoming.length) ExpoImage.prefetch(upcoming).catch(() => {});
  }, [groups, group, story]);

  // ── Gesterna ──
  const pause = useCallback((on: boolean) => setPaused(on), []);
  const axis = useSharedValue(0); // 1 = sidled (kuben), 2 = nedåt (stäng)
  const startPos = useSharedValue(0);
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(12)
      .onStart((e) => {
        axis.value = Math.abs(e.translationX) > Math.abs(e.translationY) ? 1 : e.translationY > 0 ? 2 : 0;
        startPos.value = pos.value;
        runOnJS(pause)(true);
      })
      .onUpdate((e) => {
        if (axis.value === 1) {
          const target = startPos.value - e.translationX / W;
          // Motstånd före första och efter sista
          const max = groups.length - 1;
          pos.value = target < 0 ? target * 0.3 : target > max ? max + (target - max) * 0.3 : target;
        } else if (axis.value === 2) {
          dragY.value = Math.max(0, e.translationY);
        }
      })
      .onEnd((e) => {
        if (axis.value === 1) {
          const projected = pos.value - e.velocityX / W * 0.25;
          const target = Math.round(Math.min(startPos.value + 1, Math.max(startPos.value - 1, projected)));
          if (target > groups.length - 1) { runOnJS(close)(); return; }
          const g = Math.max(0, target);
          pos.value = withTiming(g, { duration: 260, easing: Easing.out(Easing.cubic) }, (done) => {
            if (done) runOnJS(setGroup)(g);
          });
        } else if (axis.value === 2) {
          if (dragY.value > 120 || e.velocityY > 900) { runOnJS(close)(); return; }
          dragY.value = withSpring(0, SPRING);
        }
      })
      .onFinalize(() => { runOnJS(pause)(false); });
    const hold = Gesture.LongPress()
      .minDuration(180)
      .maxDistance(20)
      .onStart(() => { held.value = withTiming(1, { duration: 160 }); runOnJS(pause)(true); })
      .onFinalize(() => { held.value = withTiming(0, { duration: 160 }); runOnJS(pause)(false); });
    const tap = Gesture.Tap()
      .maxDistance(10)
      .onEnd((e, ok) => { if (ok) runOnJS(e.x < W * 0.3 ? prev : next)(); });
    return Gesture.Race(pan, Gesture.Exclusive(hold, tap));
  }, [W, groups.length, pos, dragY, held, axis, startPos, pause, close, prev, next]);

  // ── Hela visaren: växer ut ur cirkeln, krymper när man drar nedåt ──
  const frameStyle = useAnimatedStyle(() => {
    const o = open.value;
    const d = origin?.size ?? W * 0.2;
    const ox = origin ? origin.x + d / 2 - W / 2 : 0;
    const oy = origin ? origin.y + d / 2 - H / 2 : H * 0.1;
    const drag = Math.min(1, dragY.value / H);
    const scale = (d / W + (1 - d / W) * o) * (1 - drag * 0.35);
    return {
      opacity: Math.min(1, o * 2.5),
      borderRadius: interpolate(o, [0, 1], [W / 2, 0]) + drag * 60,
      transform: [
        { translateX: ox * (1 - o) },
        { translateY: oy * (1 - o) + dragY.value * 0.9 },
        { scale },
      ],
    };
  });
  // Bakom: temats färg, som tonar bort när man drar nedåt (Hem syns igenom)
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: open.value * (1 - Math.min(1, dragY.value / (H * 0.45))),
  }));

  const visible = [group - 1, group, group + 1].filter((g) => g >= 0 && g < groups.length);
  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <StatusBar style="light" />
      <Reanimated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }, backdropStyle]} />
      <GestureDetector gesture={gesture}>
        <Reanimated.View style={[StyleSheet.absoluteFill, s.frame, frameStyle]}>
          {visible.map((g) => (
            <StoryPage
              key={groups[g].placeId}
              group={groups[g]}
              index={g}
              storyIndex={storyAt[g] ?? 0}
              active={g === group}
              pos={pos}
              progress={progress}
              held={held}
              width={W}
              onLoaded={onLoaded}
              onClose={close}
              onOpenPlace={onOpenPlace}
            />
          ))}
        </Reanimated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

/** Ett företags sida i kuben: bilden, strecken, namnet och det nertill */
const StoryPage = memo(function StoryPage({
  group, index, storyIndex, active, pos, progress, held, width, onLoaded, onClose, onOpenPlace,
}: {
  group: StoryGroupData;
  index: number;
  storyIndex: number;
  active: boolean;
  pos: SharedValue<number>;
  progress: SharedValue<number>;
  held: SharedValue<number>;
  width: number;
  onLoaded: (storyId: string) => void;
  onClose: () => void;
  onOpenPlace: (placeId: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const story = group.stories[storyIndex] ?? group.stories[0];
  const name = group.placeName.split(/[-–—,]/)[0].trim();

  // Kuben: sidan till höger vrids in kring sin vänstra kant, sidan som lämnar kring sin högra
  const cube = useAnimatedStyle(() => {
    const o = index - pos.value;
    const clamped = Math.max(-1, Math.min(1, o));
    return {
      opacity: Math.abs(o) >= 1 ? 0 : 1,
      transformOrigin: o >= 0 ? "left center" : "right center",
      transform: [
        { perspective: width * 2.2 },
        { translateX: clamped * width },
        { rotateY: `${clamped * 90}deg` },
      ],
    };
  });
  // Det runt bilden tonar bort medan man håller inne
  const chrome = useAnimatedStyle(() => ({ opacity: 1 - held.value }));

  return (
    <Reanimated.View style={[StyleSheet.absoluteFill, s.page, cube]}>
      <ExpoImage
        source={{ uri: story.image_url }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={120}
        onLoad={() => onLoaded(story.id)}
      />
      <LinearGradient colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]} style={[s.topShade, { height: insets.top + 110 }]} pointerEvents="none" />
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.65)"]}
        style={[s.bottomShade, { height: 260 + insets.bottom }]}
        pointerEvents="none"
      />

      <Reanimated.View style={[StyleSheet.absoluteFill, chrome]} pointerEvents="box-none">
        {/* Strecken: ett per berättelse, det aktuella fylls på i takt med tiden */}
        <View style={[s.bars, { top: insets.top + 8 }]} pointerEvents="none">
          {group.stories.map((st, i) => (
            <Bar key={st.id} fill={i < storyIndex ? 1 : i > storyIndex ? 0 : null} progress={progress} active={active} />
          ))}
        </View>

        <View style={[s.head, { top: insets.top + 22 }]}>
          <TouchableOpacity style={s.who} activeOpacity={0.8} onPress={() => onOpenPlace(group.placeId)}>
            <View style={s.logo}>
              {group.logoUrl && <ExpoImage source={{ uri: group.logoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />}
            </View>
            <Text style={s.name} numberOfLines={1}>{name}</Text>
            <Text style={s.time}>{ago(story.created_at)}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} hitSlop={14} accessibilityLabel="Stäng">
            <X size={26} color="#FFFFFF" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        <View style={[s.foot, { bottom: insets.bottom + 22 }]} pointerEvents="box-none">
          {!!story.deal_text && (
            <View style={s.deal}>
              <Crown size={14} color="#E8C674" strokeWidth={2.2} />
              <Text style={s.dealText} numberOfLines={1}>{story.deal_text}</Text>
            </View>
          )}
          {!!story.caption && <Text style={s.caption} numberOfLines={4}>{story.caption}</Text>}
          <TouchableOpacity style={s.visit} activeOpacity={0.85} onPress={() => onOpenPlace(group.placeId)}>
            <BlurView intensity={30} tint="dark" style={[StyleSheet.absoluteFill, s.visitGlass]} />
            <Text style={s.visitText} numberOfLines={1}>Till {name}</Text>
            <ArrowUpRight size={18} color="#FFFFFF" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </Reanimated.View>
    </Reanimated.View>
  );
});

/** Ett streck överst. fill: 1 = sedd, 0 = kommer, null = den som visas (följer tiden) */
function Bar({ fill, progress, active }: { fill: number | null; progress: SharedValue<number>; active: boolean }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: fill ?? (active ? progress.value : 0) }],
  }));
  return (
    <View style={s.bar}>
      <Reanimated.View style={[s.barFill, style]} />
    </View>
  );
}

const s = StyleSheet.create({
  frame: { overflow: "hidden", backgroundColor: "#000000" },
  page: { backgroundColor: "#111113", backfaceVisibility: "hidden", overflow: "hidden" },
  topShade: { position: "absolute", top: 0, left: 0, right: 0 },
  bottomShade: { position: "absolute", bottom: 0, left: 0, right: 0 },

  bars: { position: "absolute", left: 10, right: 10, flexDirection: "row", gap: 4 },
  bar: { flex: 1, height: 2.5, borderRadius: 2, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.35)" },
  barFill: { ...StyleSheet.absoluteFillObject, backgroundColor: "#FFFFFF", transformOrigin: "left center" },

  head: { position: "absolute", left: 12, right: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  who: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 34, height: 34, borderRadius: 17, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.2)" },
  name: {
    flexShrink: 1, fontFamily: "Inter_700Bold", fontSize: 14.5, color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  time: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: "rgba(255,255,255,0.75)" },

  foot: { position: "absolute", left: 16, right: 16, gap: 12 },
  deal: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.55)",
  },
  dealText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: "#E8C674" },
  caption: {
    fontFamily: "Inter_500Medium", fontSize: 16, lineHeight: 23, color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.45)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 },
  },
  visit: {
    alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8,
    height: 46, paddingHorizontal: 20, borderRadius: 23, overflow: "hidden", marginTop: 4,
  },
  visitGlass: { backgroundColor: "rgba(0,0,0,0.35)" },
  visitText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#FFFFFF", maxWidth: 240 },
});
