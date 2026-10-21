/**
 * Berättelserna på Hem: en rad med företagens cirklar. Osedda har den gul-orange ringen
 * (STORY_GRADIENT), sedda en diskret grå; favoriter och osedda först.
 *
 * Ett tryck: ringen blir streckad och snurrar medan berättelsens bild laddas (som i Instagram),
 * sedan växer berättelsen ut ur cirkeln (StoryViewer). Man börjar på den första man inte sett.
 * Snurren går på UI-tråden — den gamla bågen som ritades om tolv gånger hackade.
 *
 * En berättelse syns i 24 timmar och försvinner sen (om företaget inte satt en egen tid). Sedda
 * hamnar sist med grå ring — det räknas in direkt när visaren stängs (medan den är öppen står
 * ordningen still, annars bytte cirklarna plats under fingrarna).
 *
 * Raden sköter sina egna lägen, så den ritar inte om resten av Hem.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Reanimated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from "react-native-reanimated";
import Svg, { Circle as SvgCircle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import { useBusinessStories } from "@/hooks/useBusinessStories";
import { useStoryViews } from "@/hooks/useStoryViews";
import { useFavorites } from "@/hooks/useFavorites";
import { StoryViewer, type StoryGroupData, type StoryOrigin } from "@/components/stories/StoryViewer";
import { STORY_GRADIENT } from "@/theme/storyGradient";
import { useTheme } from "@/theme/ThemeProvider";
import { Skeleton } from "@/components/Skeleton";
import { pushOnce } from "@/lib/navigateOnce";

// ─── Cirkeln ─────────────────────────────────────────────────────────────────

const SC_INNER = 64;
const SC_GAP = 2;
const SC_STROKE = 3.2;
const SC_RADIUS = SC_INNER / 2 + SC_GAP + SC_STROKE / 2;
const SC_OUTER = Math.ceil(2 * (SC_RADIUS + SC_STROKE) + 2);
const SC_CENTER = SC_OUTER / 2;
const SC_CIRC = 2 * Math.PI * SC_RADIUS;
/** Så länge en berättelse syns */
const STORY_LIFE_MS = 24 * 60 * 60 * 1000;
/** Snurren: minst så här länge (så den syns), högst så här länge (sen öppnas den ändå) */
const LOAD_MIN_MS = 260;
const LOAD_MAX_MS = 1500;

/** Sedd: diskret grå, ljusare i ljust läge */
const seenGradient = (dark: boolean) => ({
  stops: dark
    ? [{ offset: "0%", color: "#484848" }, { offset: "100%", color: "#303030" }]
    : [{ offset: "0%", color: "#CFC8BA" }, { offset: "100%", color: "#B5AD9D" }],
  x1: "0", y1: "1", x2: "1", y2: "0",
});

const StoryCircle = memo(function StoryCircle({ group, isSeen, onOpen }: {
  group: StoryGroupData;
  isSeen: boolean;
  /** Bilden är laddad: öppna, från cirkelns plats på skärmen */
  onOpen: (group: StoryGroupData, origin: StoryOrigin | null) => void;
}) {
  const { colors, scheme } = useTheme();
  const imageUrl = group.logoUrl ?? group.stories[0]?.image_url ?? null;
  const label = group.placeName.split(/[-–—,]/)[0].trim();
  const grad = isSeen ? seenGradient(scheme === "dark") : STORY_GRADIENT;
  const gradId = `sg-${group.placeId}`;
  const imageRef = useRef<View>(null);

  // Laddar: ringen blir streckad och snurrar
  const [loading, setLoading] = useState(false);
  const spin = useSharedValue(0);
  useEffect(() => {
    if (!loading) return;
    spin.value = 0;
    spin.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [loading, spin]);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));

  const tap = useCallback(() => {
    if (loading) return;
    Haptics.selectionAsync().catch(() => {});
    setLoading(true);
    const first = group.stories[0]?.image_url;
    const started = Date.now();
    const loaded = first ? ExpoImage.prefetch(first).catch(() => false) : Promise.resolve(true);
    const timeout = new Promise((r) => setTimeout(r, LOAD_MAX_MS));
    Promise.race([loaded, timeout]).then(() => {
      const wait = Math.max(0, LOAD_MIN_MS - (Date.now() - started));
      setTimeout(() => {
        const done = (origin: StoryOrigin | null) => {
          onOpen(group, origin);
          setTimeout(() => setLoading(false), 450);
        };
        if (!imageRef.current) return done(null);
        imageRef.current.measureInWindow((x, y, w) => done({ x, y, size: w }));
      }, wait);
    });
  }, [loading, group, onOpen]);

  return (
    <TouchableOpacity style={s.circleWrap} activeOpacity={0.9} onPress={tap}>
      <View style={{ width: SC_OUTER, height: SC_OUTER, alignItems: "center", justifyContent: "center" }}>
        <Reanimated.View style={[StyleSheet.absoluteFill, loading && spinStyle]}>
          <Svg width={SC_OUTER} height={SC_OUTER}>
            <Defs>
              <SvgGradient id={gradId} x1={grad.x1} y1={grad.y1} x2={grad.x2} y2={grad.y2}>
                {grad.stops.map((stop) => <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} stopOpacity="1" />)}
              </SvgGradient>
            </Defs>
            <SvgCircle
              cx={SC_CENTER} cy={SC_CENTER} r={SC_RADIUS}
              stroke={`url(#${gradId})`}
              strokeWidth={SC_STROKE}
              fill="none"
              strokeLinecap={loading ? "round" : "butt"}
              // Streckad medan den laddar: 14 streck runt hela varvet
              strokeDasharray={loading ? `${(SC_CIRC / 14) * 0.55} ${(SC_CIRC / 14) * 0.45}` : undefined}
            />
          </Svg>
        </Reanimated.View>
        <View ref={imageRef} collapsable={false} style={[s.image, { backgroundColor: colors.fill }]}>
          {imageUrl && <ExpoImage source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />}
        </View>
      </View>
      <Text style={[s.name, { color: isSeen ? colors.faint : colors.muted }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
});

// ─── Raden ───────────────────────────────────────────────────────────────────

interface Opened { groups: StoryGroupData[]; group: number; story: number; origin: StoryOrigin | null }

export const StoryRow = memo(function StoryRow() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: businessStories = [], isLoading } = useBusinessStories();
  const { data: storyViews = [] } = useStoryViews();
  const { data: favorites = [] } = useFavorites();
  const viewedIds = useMemo(() => new Set(storyViews.map((v) => v.story_id)), [storyViews]);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [presented, setPresented] = useState(false);

  // En grupp per plats (platsens data kommer med berättelsen), favoriter och osedda först
  const groups = useMemo((): StoryGroupData[] => {
    const now = Date.now();
    const byPlace = new Map<number, typeof businessStories>();
    for (const bs of businessStories) {
      // Syns till företagets egen sluttid, annars i 24 timmar
      const ends = bs.expires_at ? new Date(bs.expires_at).getTime() : new Date(bs.created_at).getTime() + STORY_LIFE_MS;
      if (!bs.place || ends <= now) continue;
      const list = byPlace.get(bs.place_id);
      if (list) list.push(bs); else byPlace.set(bs.place_id, [bs]);
    }
    const out: StoryGroupData[] = [];
    for (const [placeId, stories] of byPlace) {
      const place = stories[0]!.place!;
      // Äldst först inom gruppen, som i Instagram — man ser dem i den ordning de lades ut
      stories.sort((a, b) => a.created_at.localeCompare(b.created_at));
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

  // Öppna: grupperna fryses som de ser ut nu, och man börjar på den första man inte sett
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const viewedRef = useRef(viewedIds);
  viewedRef.current = viewedIds;
  const onOpen = useCallback((group: StoryGroupData, origin: StoryOrigin | null) => {
    const snapshot = groupsRef.current;
    const g = Math.max(0, snapshot.findIndex((x) => x.placeId === group.placeId));
    const unseen = snapshot[g].stories.findIndex((st) => !viewedRef.current.has(st.id));
    setPresented(false);
    setOpened({ groups: snapshot, group: g, story: unseen < 0 ? 0 : unseen, origin });
  }, []);
  const onClosed = useCallback((viewed: string[], saved: Promise<unknown>) => {
    setOpened(null);
    setPresented(false);
    if (viewed.length === 0) return;
    // Nu får cirklarna byta plats: direkt i appen, och från servern när sparandet är klart
    const at = new Date().toISOString();
    queryClient.setQueryData<{ story_id: string; viewed_at?: string | null }[]>(["story-views"], (old = []) => [
      ...old.filter((v) => !viewed.includes(v.story_id)),
      ...viewed.map((id) => ({ story_id: id, viewed_at: at })),
    ]);
    saved.then(() => queryClient.invalidateQueries({ queryKey: ["story-views"] }));
  }, [queryClient]);
  const closeNow = useCallback(() => onClosed([], Promise.resolve()), [onClosed]);
  const onOpenPlace = useCallback((placeId: number) => {
    pushOnce(router, `/place/${placeId}`);
  }, [router]);

  // Medan berättelserna hämtas: grå cirklar på deras plats (så inget hoppar när de kommer)
  if (isLoading) {
    return (
      <View style={[s.row, s.list, { flexDirection: "row" }]} pointerEvents="none">
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={s.circleWrap}>
            <Skeleton width={SC_INNER + 10} height={SC_INNER + 10} radius={(SC_INNER + 10) / 2} style={{ margin: (SC_OUTER - SC_INNER - 10) / 2 }} />
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
        keyExtractor={(g) => String(g.placeId)}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <StoryCircle group={item} isSeen={item.stories.every((st) => viewedIds.has(st.id))} onOpen={onOpen} />
        )}
      />
      <Modal
        visible={opened !== null}
        transparent
        animationType="none"
        statusBarTranslucent
        onShow={() => setPresented(true)}
        onRequestClose={closeNow}
      >
        {opened && (
          <StoryViewer
            groups={opened.groups}
            startGroup={opened.group}
            startStory={opened.story}
            origin={opened.origin}
            presented={presented}
            onOpenPlace={onOpenPlace}
            onClosed={onClosed}
          />
        )}
      </Modal>
    </View>
  );
});

const s = StyleSheet.create({
  row: { marginTop: 30 },
  list: { paddingHorizontal: 12, gap: 6 },
  circleWrap: { alignItems: "center", width: 84 },
  image: { width: SC_INNER, height: SC_INNER, borderRadius: SC_INNER / 2, overflow: "hidden" },
  name: { fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 6, textAlign: "center", width: "100%" },
});
