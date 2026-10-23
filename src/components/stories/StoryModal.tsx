/**
 * Berättelserna grupperade per plats, och visaren som öppnas ovanpå sidan (Hem och platssidan).
 * När visaren stängs räknas det man sett in direkt i appen — ringen blir grå — och från servern
 * när sparandet är klart.
 */
import { useCallback, useState } from "react";
import { Modal } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { BusinessStory } from "@/hooks/useBusinessStories";
import {
  StoryViewer, type StoryGroupData, type StoryLinkTarget, type StoryOrigin,
} from "@/components/stories/StoryViewer";

/** Så länge en berättelse syns, om företaget inte satt en egen sluttid */
const STORY_LIFE_MS = 24 * 60 * 60 * 1000;

/** En grupp per plats med berättelser som syns just nu, äldst först inom gruppen (som i Instagram) */
export function storyGroups(stories: BusinessStory[], favoritePlaceIds: Set<number>, now = Date.now()): StoryGroupData[] {
  const byPlace = new Map<number, BusinessStory[]>();
  for (const bs of stories) {
    const ends = bs.expires_at ? new Date(bs.expires_at).getTime() : new Date(bs.created_at).getTime() + STORY_LIFE_MS;
    if (!bs.place || ends <= now) continue;
    const list = byPlace.get(bs.place_id);
    if (list) list.push(bs); else byPlace.set(bs.place_id, [bs]);
  }
  return [...byPlace].map(([placeId, list]) => {
    const place = list[0]!.place!;
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return {
      placeId,
      placeName: place.name,
      placeCategory: place.categories ?? null,
      placeLocation: place.nearest_town ?? null,
      logoUrl: place.logo_url ?? null,
      storyType: favoritePlaceIds.has(placeId) ? "favorite" : "regular",
      stories: list,
    };
  });
}

export const groupSeen = (group: StoryGroupData, viewedIds: Set<string>) => group.stories.every((st) => viewedIds.has(st.id));

interface Opened { groups: StoryGroupData[]; group: number; story: number; origin: StoryOrigin | null }

export function useStoryModal({ onOpenPlace, onOpenLink }: {
  onOpenPlace: (placeId: number) => void;
  onOpenLink?: (link: StoryLinkTarget, placeId: number) => void;
}) {
  const queryClient = useQueryClient();
  const [opened, setOpened] = useState<Opened | null>(null);
  const [presented, setPresented] = useState(false);

  /** Öppna en grupp — man börjar på den första berättelsen man inte sett */
  const open = useCallback((groups: StoryGroupData[], group: number, viewedIds: Set<string>, origin: StoryOrigin | null) => {
    const unseen = groups[group].stories.findIndex((st) => !viewedIds.has(st.id));
    setPresented(false);
    setOpened({ groups, group, story: unseen < 0 ? 0 : unseen, origin });
  }, []);

  const onClosed = useCallback((viewed: string[], saved: Promise<unknown>) => {
    setOpened(null);
    setPresented(false);
    if (viewed.length === 0) return;
    const at = new Date().toISOString();
    queryClient.setQueryData<{ story_id: string; viewed_at?: string | null }[]>(["story-views"], (old = []) => [
      ...old.filter((v) => !viewed.includes(v.story_id)),
      ...viewed.map((id) => ({ story_id: id, viewed_at: at })),
    ]);
    saved.then(() => queryClient.invalidateQueries({ queryKey: ["story-views"] }));
  }, [queryClient]);
  const closeNow = useCallback(() => onClosed([], Promise.resolve()), [onClosed]);

  const element = (
    <Modal visible={opened !== null} transparent animationType="none" statusBarTranslucent onShow={() => setPresented(true)} onRequestClose={closeNow}>
      {opened && (
        <StoryViewer
          groups={opened.groups}
          startGroup={opened.group}
          startStory={opened.story}
          origin={opened.origin}
          presented={presented}
          onOpenPlace={onOpenPlace}
          onOpenLink={onOpenLink}
          onClosed={onClosed}
        />
      )}
    </Modal>
  );
  return { open, element };
}
