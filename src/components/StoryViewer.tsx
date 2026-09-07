import { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Animated,
  PanResponder,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import type { BusinessStory } from "@/hooks/useBusinessStories";
import { useMarkStoryViewed } from "@/hooks/useStoryViews";

const { width: W, height: H } = Dimensions.get("screen"); // screen = hela skärmen inkl. statusbar
const STORY_DURATION = 5000;
const TICK_MS = 50;

export type StoryType = "favorite" | "regular";

export interface StoryGroupData {
  placeId: number;
  placeName: string;
  placeCategory?: string | null;
  placeLocation?: string | null;
  placeLat?: number | null;
  placeLng?: number | null;
  logoUrl: string | null;
  storyType: StoryType;
  stories: BusinessStory[];
}

interface Props {
  groups: StoryGroupData[];
  initialGroupIndex: number;
  onClose: () => void;
}

export function StoryViewer({ groups, initialGroupIndex, onClose }: Props) {
  const insets     = useSafeAreaInsets();
  const router     = useRouter();
  const markViewed = useMarkStoryViewed();

  const [groupIdx, setGroupIdx] = useState(initialGroupIndex);
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const isPausedRef  = useRef(false);
  const translateY   = useRef(new Animated.Value(0)).current;
  const slideX       = useRef(new Animated.Value(0)).current;

  const group = groups[groupIdx];
  const story = group?.stories[storyIdx];

  // Box-slide mellan grupper (dir=1 → nästa, dir=-1 → förra)
  const slideToGroup = useCallback(
    (newGroupIdx: number, storyIdxInGroup: number, dir: 1 | -1) => {
      isPausedRef.current = true;
      Animated.timing(slideX, {
        toValue: dir * -W,
        duration: 160,
        useNativeDriver: true,
      }).start(() => {
        setGroupIdx(newGroupIdx);
        setStoryIdx(storyIdxInGroup);
        setProgress(0);
        slideX.setValue(dir * W);
        Animated.timing(slideX, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }).start(() => {
          isPausedRef.current = false;
        });
      });
    },
    [slideX]
  );

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const goNext = useCallback(() => {
    const g = groups[groupIdx];
    if (!g) return;
    if (storyIdx < g.stories.length - 1) {
      setStoryIdx((i) => i + 1);
      setProgress(0);
    } else if (groupIdx < groups.length - 1) {
      slideToGroup(groupIdx + 1, 0, 1);
    } else {
      handleClose();
    }
  }, [storyIdx, groupIdx, groups, handleClose, slideToGroup]);

  const goPrev = useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx((i) => i - 1);
      setProgress(0);
    } else if (groupIdx > 0) {
      const prev = groupIdx - 1;
      slideToGroup(prev, groups[prev].stories.length - 1, -1);
    }
  }, [storyIdx, groupIdx, groups, slideToGroup]);

  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;

  // Markera story som sedd
  useEffect(() => {
    if (story?.id) markViewed.mutate(story.id);
  }, [groupIdx, storyIdx]);

  // Auto-advance-timer
  useEffect(() => {
    setProgress(0);
    let current = 0;
    const interval = setInterval(() => {
      if (isPausedRef.current) return;
      current += (TICK_MS / STORY_DURATION) * 100;
      if (current >= 100) {
        clearInterval(interval);
        goNextRef.current();
        return;
      }
      setProgress(current);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [storyIdx, groupIdx]);

  // Swipe ner för att stänga
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => { isPausedRef.current = true; },
      onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100) {
          onClose(); // stäng direkt — ingen animation som ger svart skärm
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
          isPausedRef.current = false;
        }
      },
    })
  ).current;

  if (!group || !story) return null;

  const placeName = group.placeName.split(/[-–—,]/)[0].trim();

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }] }]}
      {...panResponder.panHandlers}
    >
      {/* Visa statusbar med vit text, likt Instagram */}
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Allt innehåll som slideX-animeras vid gruppbyte */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: slideX }] }]}>

        <Image source={{ uri: story.image_url }} style={styles.image} resizeMode="cover" />

        {/* Progressbars */}
        <View style={[styles.progressContainer, { top: insets.top + 8 }]}>
          {group.stories.map((_, i) => (
            <View key={i} style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${i < storyIdx ? 100 : i === storyIdx ? Math.min(progress, 100) : 0}%` },
                ]}
              />
            </View>
          ))}
        </View>

        {/* Header: logga + namn → tryck öppnar ställets sida */}
        <TouchableOpacity
          style={[styles.header, { top: insets.top + 24 }]}
          onPress={() => { onClose(); router.push(`/place/${group.placeId}` as any); }}
          activeOpacity={0.85}
        >
          <View style={styles.logoWrapper}>
            {group.logoUrl
              ? <Image source={{ uri: group.logoUrl }} style={styles.logo} resizeMode="cover" />
              : <View style={[styles.logo, styles.logoPlaceholder]} />
            }
          </View>
          <Text style={styles.placeName}>{placeName}</Text>
        </TouchableOpacity>


      </Animated.View>{/* /slideX */}

      {/* Tapzoner utanför slideX – alltid responsiva */}
      <TouchableOpacity
        style={styles.tapLeft}
        onPress={goPrev}
        onLongPress={() => { isPausedRef.current = true; }}
        onPressOut={() => { isPausedRef.current = false; }}
        activeOpacity={1}
      />
      <TouchableOpacity
        style={styles.tapRight}
        onPress={goNext}
        onLongPress={() => { isPausedRef.current = true; }}
        onPressOut={() => { isPausedRef.current = false; }}
        activeOpacity={1}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  image: { width: W, height: H },

  progressContainer: {
    position: "absolute", left: 8, right: 8,
    flexDirection: "row", gap: 4, zIndex: 20,
  },
  progressBar: {
    flex: 1, height: 2.5,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: 2, overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 2 },

  header: {
    position: "absolute", left: 12, zIndex: 20,
    flexDirection: "row", alignItems: "center", gap: 10,
  },
  logoWrapper: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.7)",
    overflow: "hidden",
  },
  logo: { width: "100%", height: "100%" },
  logoPlaceholder: { backgroundColor: "rgba(255,255,255,0.25)" },
  placeName: {
    color: "#fff", fontSize: 14, fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  tapLeft:  { position: "absolute", left: 0,  top: 80, bottom: 100, width: W * 0.33, zIndex: 10 },
  tapRight: { position: "absolute", right: 0, top: 80, bottom: 100, width: W * 0.67, zIndex: 10 },
});
