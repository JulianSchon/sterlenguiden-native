/**
 * Berättelserna på Hem: en rad med företagens cirklar. Osedda har den gul-orange ringen
 * (STORY_GRADIENT), sedda en heldragen grå; favoriter och osedda först.
 *
 * Ett tryck: ringen blir streckad och snurrar medan berättelsens bild laddas (StoryRing), sedan
 * växer berättelsen ut ur cirkeln (StoryViewer). Man börjar på den första man inte sett.
 *
 * En berättelse syns i 24 timmar och försvinner sen (om företaget inte satt en egen tid). Sedda
 * hamnar sist med grå ring — det räknas in direkt när visaren stängs (medan den är öppen står
 * ordningen still, annars bytte cirklarna plats under fingrarna).
 *
 * Raden sköter sina egna lägen, så den ritar inte om resten av Hem.
 */
import { memo, useCallback, useMemo, useRef } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { useBusinessStories } from "@/hooks/useBusinessStories";
import { useStoryViews } from "@/hooks/useStoryViews";
import { useFavorites } from "@/hooks/useFavorites";
import type { StoryGroupData, StoryLinkTarget, StoryOrigin } from "@/components/stories/StoryViewer";
import { StoryRing, storyRingSize, useStoryTap } from "@/components/stories/StoryRing";
import { groupSeen, storyGroups, useStoryModal } from "@/components/stories/StoryModal";
import { useTheme } from "@/theme/ThemeProvider";
import { Skeleton } from "@/components/Skeleton";
import { pushOnce } from "@/lib/navigateOnce";
import { openEvent } from "@/lib/eventSheet";

// ─── Cirkeln ─────────────────────────────────────────────────────────────────

const SC_INNER = 64;
const SC_GAP = 2;
const SC_STROKE = 3.2;
const SC_OUTER = storyRingSize(SC_INNER, SC_GAP, SC_STROKE);

const StoryCircle = memo(function StoryCircle({ group, isSeen, onOpen }: {
  group: StoryGroupData;
  isSeen: boolean;
  /** Bilden är laddad: öppna, från cirkelns plats på skärmen */
  onOpen: (group: StoryGroupData, origin: StoryOrigin | null) => void;
}) {
  const { colors } = useTheme();
  const imageUrl = group.logoUrl ?? group.stories[0]?.image_url ?? null;
  const label = group.placeName.split(/[-–—,]/)[0].trim();
  const imageRef = useRef<View>(null);
  const { loading, tap } = useStoryTap(group, imageRef, onOpen);

  return (
    <TouchableOpacity style={s.circleWrap} activeOpacity={0.9} onPress={tap}>
      <StoryRing id={`home-${group.placeId}`} inner={SC_INNER} gap={SC_GAP} stroke={SC_STROKE} seen={isSeen} loading={loading}>
        <View ref={imageRef} collapsable={false} style={[s.image, { backgroundColor: colors.fill }]}>
          {imageUrl && <ExpoImage source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />}
        </View>
      </StoryRing>
      <Text style={[s.name, { color: isSeen ? colors.faint : colors.muted }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
});

// ─── Raden ───────────────────────────────────────────────────────────────────

export const StoryRow = memo(function StoryRow() {
  const router = useRouter();
  const { data: businessStories = [], isLoading } = useBusinessStories();
  const { data: storyViews = [] } = useStoryViews();
  const { data: favorites = [] } = useFavorites();
  const viewedIds = useMemo(() => new Set(storyViews.map((v) => v.story_id)), [storyViews]);

  // En grupp per plats, favoriter och osedda först
  const groups = useMemo(() => {
    const favoriteIds = new Set(favorites.flatMap((f) => (f.place_id != null ? [f.place_id] : [])));
    return storyGroups(businessStories, favoriteIds).sort((a, b) => {
      const aSeen = groupSeen(a, viewedIds);
      const bSeen = groupSeen(b, viewedIds);
      if (aSeen !== bSeen) return aSeen ? 1 : -1;
      if (a.storyType !== b.storyType) return a.storyType === "favorite" ? -1 : 1;
      return 0;
    });
  }, [businessStories, favorites, viewedIds]);

  const onOpenPlace = useCallback((placeId: number) => {
    pushOnce(router, `/place/${placeId}?from=story`);
  }, [router]);
  // Berättelsens länk: erbjudandet öppnas på platssidan, evenemanget i sin panel
  const onOpenLink = useCallback((link: StoryLinkTarget, placeId: number) => {
    if (link.kind === "offer") pushOnce(router, `/place/${placeId}?from=story&offer=${link.id}`);
    else openEvent(Number(link.id));
  }, [router]);
  const viewer = useStoryModal({ onOpenPlace, onOpenLink });

  // Öppna: grupperna fryses som de ser ut nu
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const viewedRef = useRef(viewedIds);
  viewedRef.current = viewedIds;
  const openViewer = viewer.open;
  const onOpen = useCallback((group: StoryGroupData, origin: StoryOrigin | null) => {
    const snapshot = groupsRef.current;
    openViewer(snapshot, Math.max(0, snapshot.findIndex((x) => x.placeId === group.placeId)), viewedRef.current, origin);
  }, [openViewer]);

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
        renderItem={({ item }) => <StoryCircle group={item} isSeen={groupSeen(item, viewedIds)} onOpen={onOpen} />}
      />
      {viewer.element}
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
