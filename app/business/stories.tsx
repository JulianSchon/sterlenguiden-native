/**
 * Stories: de som är ute nu (24 timmar) och de senaste 30 dagarna, med hur många som sett var och
 * en. Ett tryck visar storyn i helskärm (som gästerna ser den, filmen spelas), med enkätens röster
 * och frågans svar (utan vem som svarat); där kan man ta bort den. Nya
 * skapas med Ny story (business/story), som ligger fast längst ner.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Image as ExpoImage } from "expo-image";
import { Camera, ChartColumn, Eye, MessageCircleQuestionMark, Trash2, Video, X } from "lucide-react-native";
import Reanimated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { StoryVideo, videoAvailable } from "@/components/stories/StoryVideo";
import { InteractionOverlay, storyFrame } from "@/components/stories/StoryInteractions";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { GoldButton } from "@/components/auth/AuthParts";
import { Note, PortalToast, SectionHeader, type PortalToastHandle } from "@/components/business/PortalParts";
import { usePlaceStories, usePortalPlace, useStoryActions } from "@/hooks/useBusiness";
import { businessError, removePlaceImages, type BusinessStory } from "@/lib/business";
import { pushOnce } from "@/lib/navigateOnce";
import { useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { tb } from "@/i18n/business";

const isLive = (st: BusinessStory) => !!st.expires_at && new Date(st.expires_at).getTime() > Date.now();

/** "3 h kvar", "20 min kvar" — eller när den lades upp, för en som gått ut */
function when(st: BusinessStory): string {
  if (isLive(st)) {
    const ms = new Date(st.expires_at ?? 0).getTime() - Date.now();
    const h = Math.floor(ms / 3_600_000);
    return h >= 1 ? tb("{{0}} h kvar", { 0: h }) : tb("{{0}} min kvar", { 0: Math.max(1, Math.round(ms / 60_000)) });
  }
  const d = new Date(st.created_at);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export default function BusinessStories() {
  const router = useRouter();
  const s = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const { placeId } = usePortalPlace();
  const { data: stories } = usePlaceStories(placeId);
  const actions = useStoryActions(placeId);
  const toast = useRef<PortalToastHandle>(null);
  const [open, setOpen] = useState<BusinessStory | null>(null);
  const live = (stories ?? []).filter(isLive);
  const old = (stories ?? []).filter((st) => !isLive(st));
  const w = (width - 32 - 20) / 3;

  // Telefonens egen fråga (inte appens meny): den visas ovanpå storyn i helskärm
  const remove = (st: BusinessStory) => {
    Alert.alert(tb("Ta bort storyn?"), tb("Den försvinner direkt för alla."), [
      { text: tb("Avbryt"), style: "cancel" },
      {
        text: tb("Ta bort"), style: "destructive",
        onPress: () => actions.remove(st.id)
          .then(() => { setOpen(null); removePlaceImages([st.image_url, st.video_url, st.overlay_url]); setTimeout(() => toast.current?.show(tb("Borttagen")), 250); })
          .catch((e) => toast.current?.show(businessError(e))),
      },
    ]);
  };

  const tile = (st: BusinessStory) => (
    <Pressable key={st.id} onPress={() => setOpen(st)} style={[s.tile, { width: w, height: w * 16 / 9 }]} accessibilityLabel={tb("Visa storyn")}>
      <ExpoImage source={{ uri: st.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
      <View style={s.tileShade} />
      {isLive(st) && <Text style={s.tileLive}>{when(st)}</Text>}
      {/* Film, enkät eller fråga: en liten symbol uppe till höger */}
      <View style={s.tileKinds}>
        {!!st.video_url && <Video size={14} color="#FFFFFF" strokeWidth={2.2} />}
        {st.interaction?.kind === "poll" && <ChartColumn size={14} color="#FFFFFF" strokeWidth={2.2} />}
        {st.interaction?.kind === "question" && <MessageCircleQuestionMark size={14} color="#FFFFFF" strokeWidth={2.2} />}
      </View>
      <View style={s.tileViews}>
        <Eye size={13} color="#FFFFFF" strokeWidth={2.2} />
        <Text style={s.tileViewsText}>{st.views}</Text>
      </View>
    </Pressable>
  );

  return (
    <>
      <SettingsScreen title={tb("Stories")} footer={<GoldButton label={tb("Ny story")} onPress={() => pushOnce(router, `/business/story?place=${placeId}`)} />}>
        <Rise index={0}>
          <Note icon={Camera} text={tb("En story syns överst på Hem i 24 timmar – för alla, och först för dem som sparat er.")} />
        </Rise>
        {!stories ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            {[0, 1, 2].map((i) => <Skeleton key={i} width={w} height={w * 16 / 9} radius={14} />)}
          </View>
        ) : (
          <>
            <Rise index={1}>
              <View>
                <SectionHeader title={live.length ? tb("Ute nu · {{0}}", { 0: live.length }) : tb("Ute nu")} />
                {live.length ? <View style={s.grid}>{live.map(tile)}</View> : <Text style={s.none}>{tb("Ingen story ute just nu.")}</Text>}
              </View>
            </Rise>
            {old.length > 0 && (
              <Rise index={2}>
                <View>
                  <SectionHeader title={tb("Senaste 30 dagarna")} />
                  <View style={s.grid}>{old.map(tile)}</View>
                </View>
              </Rise>
            )}
          </>
        )}
      </SettingsScreen>
      <StoryPreview story={open} onClose={() => setOpen(null)} onRemove={remove} />
      <PortalToast ref={toast} />
    </>
  );
}

/**
 * Storyn i helskärm, som gästerna ser den: enkäten eller frågan på sin plats (med resultatet), hur
 * många som sett den, och Ta bort. Växer in när den öppnas; dra nedåt för att stänga (den krymper
 * med fingret, som gästernas visare), och krysset låter den glida ner och tona bort.
 */
function StoryPreview({ story, onClose, onRemove }: {
  story: BusinessStory | null; onClose: () => void; onRemove: (st: BusinessStory) => void;
}) {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(createStyles);
  const { width: W, height: H } = useWindowDimensions();
  const frame = storyFrame(W, H);
  const open = useSharedValue(0);
  const dragY = useSharedValue(0);
  const closing = useRef(false);

  useEffect(() => {
    if (!story) return;
    closing.current = false;
    dragY.value = 0;
    open.value = 0;
    open.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
  }, [story, open, dragY]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    open.value = withTiming(0, { duration: 230, easing: Easing.in(Easing.quad) }, (done) => {
      if (done) runOnJS(onClose)();
    });
  }, [open, onClose]);

  const pan = useMemo(() => Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetX([-30, 30])
    .onUpdate((e) => { dragY.value = Math.max(0, e.translationY); })
    .onEnd((e) => {
      if (dragY.value > 120 || e.velocityY > 900) runOnJS(close)();
      else dragY.value = withSpring(0, { stiffness: 380, damping: 36 });
    }), [dragY, close]);

  // Öppning: växer från 92 % och tonar in. Stängning: glider ner och tonar bort. Drag: krymper med fingret
  const cardStyle = useAnimatedStyle(() => {
    const drag = Math.min(1, dragY.value / H);
    return {
      opacity: open.value,
      borderRadius: drag * 60 + (1 - open.value) * 30,
      transform: [
        { translateY: dragY.value * 0.9 + (1 - open.value) * 60 },
        { scale: (0.92 + 0.08 * open.value) * (1 - drag * 0.35) },
      ],
    };
  });
  const backdropStyle = useAnimatedStyle(() => ({ opacity: open.value * (1 - Math.min(1, dragY.value / H) * 0.8) }));
  const chrome = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, dragY.value / 80) }));

  return (
    <Modal visible={!!story} animationType="none" transparent statusBarTranslucent onRequestClose={close}>
      <StatusBar style="light" />
      {story && (
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>
          <Reanimated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#000000" }, backdropStyle]} />
          <GestureDetector gesture={pan}>
            <Reanimated.View style={[StyleSheet.absoluteFill, s.preview, cardStyle]}>
              <ExpoImage source={{ uri: story.image_url }} style={StyleSheet.absoluteFill} contentFit="contain" />
              {!!story.video_url && videoAvailable() && (
                <View style={[s.media, { left: frame.left, top: frame.top, width: frame.w, height: frame.h }]} pointerEvents="none">
                  <StoryVideo uri={story.video_url} playing loop />
                  {!!story.overlay_url && <ExpoImage source={{ uri: story.overlay_url }} style={StyleSheet.absoluteFill} contentFit="cover" />}
                </View>
              )}
              {/* Enkäten eller frågan på samma plats som hos gästerna, med resultatet */}
              {story.interaction && (
                <InteractionOverlay interaction={story.interaction} frame={frame} counts={story.votes} showResults />
              )}

              <Reanimated.View style={[StyleSheet.absoluteFill, chrome]} pointerEvents="box-none">
                <View style={[s.previewTop, { paddingTop: insets.top + 10 }]}>
                  <View style={s.previewInfo}>
                    <Eye size={16} color="#FFFFFF" strokeWidth={2.2} />
                    <Text style={s.previewText}>{story.views} {tb("har sett den ·")} {when(story)}</Text>
                  </View>
                  <TouchableOpacity onPress={close} hitSlop={12} style={s.round} accessibilityLabel={tb("Stäng")}>
                    <X size={22} color="#FFFFFF" strokeWidth={2.2} />
                  </TouchableOpacity>
                </View>
                <View style={[s.previewBottom, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
                  {/* Frågans svar (utan vem som skrivit) */}
                  {story.interaction?.kind === "question" && story.answers && (
                    <View style={[s.result, { maxHeight: 240 }]}>
                      <Text style={s.resultTitle}>{tb("Svar")} · {story.answers.length}</Text>
                      {story.answers.length === 0 ? (
                        <Text style={s.answerEmpty}>{tb("Inga svar än.")}</Text>
                      ) : (
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                          {story.answers.map((ans, i) => <Text key={i} style={s.answer}>{ans}</Text>)}
                        </ScrollView>
                      )}
                    </View>
                  )}
                  <TouchableOpacity style={s.removeBtn} onPress={() => onRemove(story)} activeOpacity={0.8}>
                    <Trash2 size={18} color="#FFFFFF" strokeWidth={2.2} />
                    <Text style={s.removeText}>{tb("Ta bort storyn")}</Text>
                  </TouchableOpacity>
                </View>
              </Reanimated.View>
            </Reanimated.View>
          </GestureDetector>
        </GestureHandlerRootView>
      )}
    </Modal>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { borderRadius: 14, overflow: "hidden", backgroundColor: c.fill },
  tileShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.12)" },
  tileLive: {
    position: "absolute", top: 8, left: 8, fontFamily: "Inter_700Bold", fontSize: 11, color: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, overflow: "hidden",
  },
  tileViews: { position: "absolute", bottom: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  tileViewsText: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#FFFFFF", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4 },
  none: { fontFamily: "Inter_400Regular", fontSize: 14, color: c.muted, paddingHorizontal: 4 },
  preview: { backgroundColor: "#000000", overflow: "hidden" },
  media: { position: "absolute", overflow: "hidden" },
  previewTop: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 },
  previewInfo: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  previewText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: "#FFFFFF" },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" },
  previewBottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 12, paddingHorizontal: 16 },
  tileKinds: { position: "absolute", top: 8, right: 8, flexDirection: "row", gap: 4 },
  result: { alignSelf: "stretch", borderRadius: 18, backgroundColor: "rgba(17,17,17,0.82)", padding: 14, gap: 8 },
  resultTitle: { fontFamily: "Montserrat_700Bold", fontSize: 15, color: "#FFFFFF" },
  answer: {
    fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 19, color: "#111111", backgroundColor: "#FFFFFF",
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, overflow: "hidden",
  },
  answerEmpty: { fontFamily: "Inter_400Regular", fontSize: 13.5, color: "rgba(255,255,255,0.7)" },
  removeBtn: { flexDirection: "row", alignItems: "center", gap: 8, height: 50, paddingHorizontal: 24, borderRadius: 25, backgroundColor: "rgba(220,38,38,0.9)" },
  removeText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#FFFFFF" },
});
