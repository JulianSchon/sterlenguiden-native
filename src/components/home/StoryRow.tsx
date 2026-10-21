/**
 * Berättelserna på Hem: en rad med företagens cirklar. Osedda har den gul-orange ringen
 * (STORY_GRADIENT), sedda en diskret grå; favoriter och osedda först. Ett tryck kör den korta
 * bågen runt cirkeln och öppnar berättelserna i helskärm (StoryViewer).
 *
 * Raden sköter sina egna lägen (vilken berättelse som är öppen), så den ritar inte om resten av Hem.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Circle as SvgCircle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { useBusinessStories } from "@/hooks/useBusinessStories";
import { useStoryViews } from "@/hooks/useStoryViews";
import { useFavorites } from "@/hooks/useFavorites";
import { StoryViewer, type StoryGroupData } from "@/components/StoryViewer";
import { STORY_GRADIENT } from "@/theme/storyGradient";
import { useTheme } from "@/theme/ThemeProvider";
import { Skeleton } from "@/components/Skeleton";

// ─── Cirkeln ─────────────────────────────────────────────────────────────────

const SC_INNER = 64;
const SC_GAP = 2;
const SC_STROKE = 3.2;   // gradient-ringens strokebredd
const SEG_STROKE = 3.5;  // animerings-bågens strokebredd – smal och elegant
const SC_RADIUS = SC_INNER / 2 + SC_GAP + SC_STROKE / 2;
// SC_OUTER rymmer ringen + bågarna (SEG_STROKE/2 utanför radien)
const SC_OUTER = Math.ceil(2 * (SC_RADIUS + SEG_STROKE / 2) + 2);
const SC_CENTER = SC_OUTER / 2;

// ─── Animering: crescendo-bågar (liten ring → längre båge → hela varvet) ────
const N_SEGS = 12;
const ANIM_MS = 340;
const SEG_GAP = -1; // negativ = varje segment täcker 1 px av föregående → inga skarvar
const SC_CIRC = 2 * Math.PI * SC_RADIUS;
// Bågarna varierar i längd: kortast (4 px, ser ut som en punkt) → längst. Tillsammans ett varv
const SEG_A = 4;
const SEG_TOTAL = SC_CIRC - N_SEGS * SEG_GAP;
const SEG_B = (SEG_TOTAL - N_SEGS * SEG_A) / (N_SEGS * (N_SEGS - 1) / 2);

type SegInfo = { dash: number; start: number; color: string };
const SEGMENTS: SegInfo[] = (() => {
  const out: SegInfo[] = [];
  let cum = 0;
  for (let i = 0; i < N_SEGS; i++) {
    const dash = SEG_A + SEG_B * i;
    const t = i / (N_SEGS - 1);
    // Gult → orange längs banan
    out.push({ dash, start: cum, color: `rgb(255,${Math.round(243 - 121 * t)},${Math.round(71 * t)})` });
    cum += dash + SEG_GAP;
  }
  return out;
})();

/** Sedd: diskret grå, ljusare i ljust läge */
const seenGradient = (dark: boolean) => ({
  stops: dark
    ? [{ offset: "0%", color: "#484848" }, { offset: "100%", color: "#303030" }]
    : [{ offset: "0%", color: "#CFC8BA" }, { offset: "100%", color: "#B5AD9D" }],
  x1: "0", y1: "1", x2: "1", y2: "0",
});

const StoryCircle = memo(function StoryCircle({ group, isSeen, onPress }: {
  group: StoryGroupData; isSeen: boolean; onPress: () => void;
}) {
  const { colors, scheme } = useTheme();
  const imageUrl = group.logoUrl ?? group.stories[0]?.image_url ?? null;
  const label = group.placeName.split(/[-–—,]/)[0].trim();
  const grad = isSeen ? seenGradient(scheme === "dark") : STORY_GRADIENT;
  const gradId = `sg-${group.placeId}`;

  // -1 = vilande, 0..N_SEGS = antal synliga bågsegment
  const [dots, setDots] = useState(-1);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const handleTap = useCallback(() => {
    if (dots >= 0) return;
    setDots(0);
    let n = 0;
    timer.current = setInterval(() => {
      n++;
      if (n >= N_SEGS) {
        clearInterval(timer.current!);
        timer.current = null;
        setDots(N_SEGS);
        onPress();
        setTimeout(() => setDots(-1), 400); // återställ när berättelsen är öppen och ringen inte syns
      } else {
        setDots(n);
      }
    }, ANIM_MS / N_SEGS);
  }, [dots, onPress]);

  return (
    <TouchableOpacity style={s.circleWrap} activeOpacity={0.9} onPress={handleTap}>
      <View style={{ width: SC_OUTER, height: SC_OUTER, alignItems: "center", justifyContent: "center" }}>
        <Svg width={SC_OUTER} height={SC_OUTER} style={StyleSheet.absoluteFill}>
          {dots >= 0 ? (
            SEGMENTS.map((seg, i) => (i >= dots ? null : (
              <SvgCircle
                key={i}
                cx={SC_CENTER} cy={SC_CENTER} r={SC_RADIUS}
                stroke={seg.color}
                strokeWidth={SEG_STROKE}
                fill="none"
                strokeDasharray={`${seg.dash} ${SC_CIRC - seg.dash}`}
                strokeDashoffset={SC_CIRC - seg.start}
                // Första och sista segmentet har rundade ändar, mellansegmenten raka med 1 px överlapp
                strokeLinecap={i === 0 || i === N_SEGS - 1 ? "round" : "butt"}
                transform={`rotate(-90, ${SC_CENTER}, ${SC_CENTER})`}
              />
            )))
          ) : (
            <>
              <Defs>
                <SvgGradient id={gradId} x1={grad.x1} y1={grad.y1} x2={grad.x2} y2={grad.y2}>
                  {grad.stops.map((stop) => <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} stopOpacity="1" />)}
                </SvgGradient>
              </Defs>
              <SvgCircle cx={SC_CENTER} cy={SC_CENTER} r={SC_RADIUS} stroke={`url(#${gradId})`} strokeWidth={SC_STROKE} fill="none" />
            </>
          )}
        </Svg>
        <View style={[s.image, { backgroundColor: colors.fill }]}>
          {imageUrl && <Image source={{ uri: imageUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />}
        </View>
      </View>
      <Text style={[s.name, { color: isSeen ? colors.faint : colors.muted }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
});

// ─── Raden ───────────────────────────────────────────────────────────────────

export const StoryRow = memo(function StoryRow() {
  const { data: businessStories = [], isLoading } = useBusinessStories();
  const { data: storyViews = [] } = useStoryViews();
  const { data: favorites = [] } = useFavorites();
  const [open, setOpen] = useState<number | null>(null);
  const viewedIds = useMemo(() => new Set(storyViews.map((v) => v.story_id)), [storyViews]);

  // En grupp per plats (platsens data kommer med berättelsen), favoriter och osedda först
  const groups = useMemo((): StoryGroupData[] => {
    const now = new Date().toISOString();
    const byPlace = new Map<number, typeof businessStories>();
    for (const bs of businessStories) {
      if (!bs.place || (bs.expires_at && bs.expires_at < now)) continue;
      const list = byPlace.get(bs.place_id);
      if (list) list.push(bs); else byPlace.set(bs.place_id, [bs]);
    }
    const out: StoryGroupData[] = [];
    for (const [placeId, stories] of byPlace) {
      const place = stories[0]!.place!;
      stories.sort((a, b) => b.created_at.localeCompare(a.created_at));
      out.push({
        placeId,
        placeName: place.name,
        placeCategory: place.categories ?? null,
        placeLocation: place.nearest_town ?? null,
        logoUrl: place.logo_url ?? null,
        storyType: favorites.some((f) => f.place_id === placeId) ? "favorite" : "regular",
        stories,
      });
    }
    return out.sort((a, b) => {
      const aSeen = a.stories.every((st) => viewedIds.has(st.id));
      const bSeen = b.stories.every((st) => viewedIds.has(st.id));
      if (aSeen !== bSeen) return aSeen ? 1 : -1;
      if (a.storyType !== b.storyType) return a.storyType === "favorite" ? -1 : 1;
      return 0;
    });
  }, [businessStories, favorites, viewedIds]);

  // Medan berättelserna hämtas: grå cirklar på deras plats (så inget hoppar när de kommer)
  if (isLoading) {
    return (
      <View style={[s.row, s.list, { flexDirection: "row" }]} pointerEvents="none">
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={s.circleWrap}>
            <Skeleton width={SC_OUTER - 6} height={SC_OUTER - 6} radius={(SC_OUTER - 6) / 2} style={{ margin: 3 }} />
            <Skeleton width={48} height={9} radius={4.5} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>
    );
  }
  if (groups.length === 0) return null;
  return (
    <View style={s.row}>
      <FlatList
        data={groups}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(g) => `${g.placeId}-${g.storyType}`}
        contentContainerStyle={s.list}
        renderItem={({ item, index }) => (
          <StoryCircle
            group={item}
            isSeen={item.stories.every((st) => viewedIds.has(st.id))}
            onPress={() => setOpen(index)}
          />
        )}
      />
      <Modal visible={open !== null} animationType="none" statusBarTranslucent onRequestClose={() => setOpen(null)}>
        {open !== null && <StoryViewer groups={groups} initialGroupIndex={open} onClose={() => setOpen(null)} />}
      </Modal>
    </View>
  );
});

const s = StyleSheet.create({
  row: { marginTop: 18 },
  list: { paddingHorizontal: 12, gap: 6 },
  circleWrap: { alignItems: "center", width: 84 },
  image: { width: SC_INNER, height: SC_INNER, borderRadius: SC_INNER / 2, overflow: "hidden" },
  name: { fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 6, textAlign: "center", width: "100%" },
});
