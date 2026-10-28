/**
 * Video i stories: i redigeraren (företaget gör en videostory) och i visaren (gästen tittar).
 * expo-video laddas först här: att importera den i en app utan modulen kraschar hela appen (samma
 * skydd som introfilmen). Utan modulen visas inget och storyn faller tillbaka på stillbilden.
 *
 * Via ref kan man ta en stillbild ur filmen (omslaget som syns i listor och ringar).
 */
import { forwardRef, useEffect, useImperativeHandle } from "react";
import { StyleSheet } from "react-native";
import { requireOptionalNativeModule } from "expo";

export const videoAvailable = () => !!requireOptionalNativeModule("ExpoVideo");

export interface StoryVideoHandle {
  /** En stillbild ur filmen (en bild expo-image kan visa), eller null om det inte gick */
  poster: () => Promise<unknown | null>;
}

export const StoryVideo = forwardRef<StoryVideoHandle, {
  uri: string;
  playing: boolean;
  muted?: boolean;
  loop?: boolean;
  /** Filmen kan spelas; längden i millisekunder */
  onReady?: (durationMs: number) => void;
}>(function StoryVideo({ uri, playing, muted = false, loop = false, onReady }, ref) {
  const { useVideoPlayer, VideoView } = require("expo-video") as typeof import("expo-video");
  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop;
    p.muted = muted;
  });

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);
  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [player, playing]);
  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") onReady?.(Math.round((player.duration || 15) * 1000));
    });
    if (player.status === "readyToPlay") onReady?.(Math.round((player.duration || 15) * 1000));
    return () => sub.remove();
  }, [player, onReady]);

  useImperativeHandle(ref, () => ({
    poster: async () => {
      try {
        const [thumb] = await player.generateThumbnailsAsync(Math.min(0.5, player.duration || 0));
        return thumb ?? null;
      } catch {
        return null;
      }
    },
  }), [player]);

  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} />;
});
