/**
 * Ny berättelse — som i Instagram.
 *
 *  1. Ta en bild, välj en ur telefonen eller använd en av platsens egna.
 *  2. Svep åt sidan för filter. Tryck på bilden för att skriva (typsnitt, färg, bakgrund). Lägg till
 *     emoji, platsens namn och en länk till ett erbjudande eller evenemang (gästen trycker på den i
 *     berättelsen och kommer dit). Dra, nyp och vrid allt; dra till papperskorgen för att ta bort.
 *     Två fingrar på bilden flyttar och zoomar den.
 *  3. Publicera: berättelsen fotograferas precis som den syns (med text och klistermärken inbakade),
 *     laddas upp och syns överst på Hem i 24 timmar.
 *
 * Allt rör sig på UI-tråden. Filtren ritas av Skia i telefonen (lib/storyFilters).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from "react-native";
import Reanimated, {
  FadeIn, FadeOut, makeMutable, runOnJS, useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withSequence, withTiming, withDelay,
} from "react-native-reanimated";
import { Directions, Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { ImageFormat, makeImageFromView } from "@shopify/react-native-skia";
import { CalendarDays, Camera, Check, ImageIcon, MapPin, Smile, Ticket, Trash2, Type, X } from "lucide-react-native";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { Sheet } from "@/components/Sheet";
import {
  FONTS, MovableItem, TEXT_COLORS, contrastOn, type FontId, type ItemMotion, type StoryItem, type TextBg,
} from "@/components/business/StoryItems";
import { useBusinessOffers, useBusinessPlace, usePlaceEvents, usePortalPlace, useStoryActions } from "@/hooks/useBusiness";
import { placeImages } from "@/hooks/usePlaces";
import { businessError, uploadPlaceBytes, type StoryLink } from "@/lib/business";
import { preparePhoto } from "@/lib/photos";
import { STORY_FILTERS, renderFiltered } from "@/lib/storyFilters";
import { eventWhen } from "@/lib/events";

const EMOJIS = ["❤️", "🔥", "😍", "✨", "⭐", "☀️", "🌊", "🌿", "🍎", "🍷", "🍺", "☕", "🍰", "🦞", "🐟", "🧀", "🍕", "🎉", "🎶", "🛍️", "🌸", "🌻", "🍂", "❄️", "🥂", "👋", "🙌", "💛"];
const GOLD = "#E4C67A";
const BAR_H = 86;

type Phase = "pick" | "edit" | "publishing" | "done";
interface Editing { id: string | null; text: string; font: FontId; color: string; bg: TextBg; at: { x: number; y: number } }

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function StoryEditorScreen() {
  // Redigeraren är alltid mörk, som kameran
  return (
    <ThemeProvider forced="dark">
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StoryEditor />
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

function StoryEditor() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: SW, height: SH } = useWindowDimensions();
  const params = useLocalSearchParams<{ offer?: string; event?: string }>();
  const { placeId } = usePortalPlace();
  const { data: place } = useBusinessPlace(placeId);
  const { data: offers } = useBusinessOffers(placeId);
  const { data: events } = usePlaceEvents(placeId);
  const actions = useStoryActions(placeId);

  // Bildytan i 9:16, så stor som får plats
  const availH = SH - insets.top - insets.bottom - BAR_H - 8;
  const ch = Math.min(SW * 16 / 9, availH);
  const cw = ch * 9 / 16;
  const canvasTop = insets.top + 4;
  const trash = { x: SW / 2, y: canvasTop + ch - 56 };

  const [phase, setPhase] = useState<Phase>("pick");
  const [source, setSource] = useState<string | null>(null);
  const [filterIndex, setFilterIndex] = useState(0);
  const [filtered, setFiltered] = useState<Record<string, string>>({});
  const [items, setItems] = useState<StoryItem[]>([]);
  const motions = useRef(new Map<string, ItemMotion>());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [stickers, setStickers] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capture = useRef<View>(null);
  const autoLinked = useRef(false);

  // Bildens egen flytt och zoom (två fingrar)
  const imgX = useSharedValue(0);
  const imgY = useSharedValue(0);
  const imgScale = useSharedValue(1);
  const imgStart = useSharedValue({ x: 0, y: 0, scale: 1 });
  const flash = useSharedValue(0);

  const filter = STORY_FILTERS[filterIndex];
  const shown = filtered[filter.id] ?? filtered.none ?? source;

  // Filtret ritas när man byter till det (en gång per filter)
  useEffect(() => {
    if (!source || filtered[filter.id]) return;
    let alive = true;
    renderFiltered(source, filter.matrix)
      .then((r) => { if (alive && r) setFiltered((m) => ({ ...m, [filter.id]: r.uri })); })
      .catch(() => { if (alive) setError("Filtren fungerar inte på den här telefonen."); });
    return () => { alive = false; };
  }, [source, filter, filtered]);

  // ── Saker på bilden ──
  const addItem = useCallback((item: StoryItem, at?: { x: number; y: number }) => {
    motions.current.set(item.id, {
      x: makeMutable(at?.x ?? cw / 2),
      y: makeMutable(at?.y ?? ch / 2),
      scale: makeMutable(1),
      rot: makeMutable(0),
      w: makeMutable(0),
      h: makeMutable(0),
    });
    setItems((list) => {
      // Bara en länk per berättelse
      const rest = item.kind === "link" ? list.filter((i) => i.kind !== "link") : list;
      return [...rest, item].slice(-14);
    });
    Haptics.selectionAsync().catch(() => {});
  }, [cw, ch]);

  const removeItem = useCallback((id: string) => {
    setItems((list) => list.filter((i) => i.id !== id));
    motions.current.delete(id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, []);

  const offerLink = useCallback((id: string) => {
    const o = offers?.find((x) => x.offer.id === id)?.offer;
    if (!o) return null;
    return { id: newId(), kind: "link" as const, link: { kind: "offer" as const, id: o.id }, title: o.title, sub: o.savings_label ?? "Med Österlenpasset" };
  }, [offers]);
  const eventLink = useCallback((id: string) => {
    const e = events?.find((x) => String(x.id) === id);
    if (!e) return null;
    return { id: newId(), kind: "link" as const, link: { kind: "event" as const, id: String(e.id) }, title: e.title, sub: eventWhen(e) };
  }, [events]);

  // Öppnad från "Berätta om det i en berättelse": länken ligger på plats direkt
  useEffect(() => {
    if (phase !== "edit" || autoLinked.current) return;
    const link = params.offer ? offerLink(params.offer) : params.event ? eventLink(params.event) : null;
    if (link) {
      autoLinked.current = true;
      addItem(link, { x: cw / 2, y: ch * 0.72 });
    }
  }, [phase, params.offer, params.event, offerLink, eventLink, addItem, cw, ch]);

  // ── Bilden ──
  const start = async (kind: "camera" | "library" | { url: string }) => {
    try {
      let uri: string | null = null;
      if (typeof kind === "object") {
        uri = kind.url;
      } else {
        if (kind === "camera") {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            Alert.alert("Kameran är avstängd", "Slå på kameran för Österlenappen i telefonens inställningar.", [
              { text: "Avbryt", style: "cancel" },
              { text: "Öppna inställningar", onPress: () => Linking.openSettings() },
            ]);
            return;
          }
        }
        const result = kind === "camera"
          ? await ImagePicker.launchCameraAsync({ quality: 1 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
        if (result.canceled) return;
        const a = result.assets[0];
        uri = await preparePhoto({ uri: a.uri, width: a.width, height: a.height }, 1600);
      }
      setSource(uri);
      setFiltered({ none: uri });
      setFilterIndex(0);
      imgX.value = 0; imgY.value = 0; imgScale.value = 1;
      setPhase("edit");
    } catch (e) {
      setError(businessError(e));
    }
  };

  const changeFilter = useCallback((dir: 1 | -1) => {
    setFilterIndex((i) => {
      const next = Math.min(STORY_FILTERS.length - 1, Math.max(0, i + dir));
      if (next !== i) Haptics.selectionAsync().catch(() => {});
      return next;
    });
    flash.value = withSequence(withTiming(1, { duration: 120 }), withDelay(700, withTiming(0, { duration: 300 })));
  }, [flash]);

  const startText = useCallback((x: number, y: number) => {
    setEditing({ id: null, text: "", font: "classic", color: "#FFFFFF", bg: "none", at: { x, y } });
  }, []);

  // Bakgrunden: svep = filter, tryck = skriv, två fingrar = flytta och zooma bilden
  const background = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onStart(() => { imgStart.value = { x: imgX.value, y: imgY.value, scale: imgScale.value }; })
      .onUpdate((e) => { imgScale.value = Math.min(4, Math.max(1, imgStart.value.scale * e.scale)); });
    const pan = Gesture.Pan()
      .minPointers(2)
      .onStart(() => { imgStart.value = { x: imgX.value, y: imgY.value, scale: imgScale.value }; })
      .onUpdate((e) => { imgX.value = imgStart.value.x + e.translationX; imgY.value = imgStart.value.y + e.translationY; });
    const left = Gesture.Fling().direction(Directions.LEFT).onEnd(() => { runOnJS(changeFilter)(1); });
    const right = Gesture.Fling().direction(Directions.RIGHT).onEnd(() => { runOnJS(changeFilter)(-1); });
    const tap = Gesture.Tap().maxDistance(8).onEnd((e, ok) => { if (ok) runOnJS(startText)(e.x, e.y); });
    return Gesture.Race(Gesture.Simultaneous(pinch, pan), Gesture.Exclusive(left, right, tap));
  }, [changeFilter, startText, imgStart, imgX, imgY, imgScale]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: imgX.value }, { translateY: imgY.value }, { scale: imgScale.value }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const onTapItem = useCallback((id: string) => {
    const item = items.find((i) => i.id === id);
    if (item?.kind === "text") setEditing({ id, text: item.text, font: item.font, color: item.color, bg: item.bg, at: { x: 0, y: 0 } });
  }, [items]);

  const finishText = () => {
    if (!editing) return;
    const text = editing.text.trim();
    if (editing.id) {
      if (!text) removeItem(editing.id);
      else setItems((list) => list.map((i) => (i.id === editing.id ? { ...i, text, font: editing.font, color: editing.color, bg: editing.bg } as StoryItem : i)));
    } else if (text) {
      addItem({ id: newId(), kind: "text", text, font: editing.font, color: editing.color, bg: editing.bg }, editing.at);
    }
    setEditing(null);
  };

  // ── Publicera ──
  const linkRect = (): StoryLink | null => {
    const item = items.find((i) => i.kind === "link");
    if (!item || item.kind !== "link") return null;
    const m = motions.current.get(item.id);
    if (!m) return null;
    const w = m.w.value * m.scale.value;
    const h = m.h.value * m.scale.value;
    const r = m.rot.value;
    const bw = Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r));
    const bh = Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r));
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return {
      kind: item.link.kind, id: item.link.id,
      x: clamp((m.x.value - bw / 2) / cw), y: clamp((m.y.value - bh / 2) / ch),
      w: clamp(bw / cw), h: clamp(bh / ch),
    };
  };

  const publish = async () => {
    setError(null);
    setPhase("publishing");
    try {
      // En bildruta så att knappar och markeringar hunnit försvinna
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
      const snapshot = await makeImageFromView(capture);
      if (!snapshot) throw new Error("snapshot");
      const bytes = snapshot.encodeToBytes(ImageFormat.JPEG, 90);
      const url = await uploadPlaceBytes(placeId, bytes);
      const caption = items.filter((i) => i.kind === "text").map((i) => (i as { text: string }).text).join(" · ").slice(0, 300) || null;
      await actions.post(url, caption, linkRect());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPhase("done");
      setTimeout(() => router.back(), 1300);
    } catch (e) {
      setPhase("edit");
      setError(e instanceof Error && e.message === "snapshot" ? "Berättelsen kunde inte sparas. Försök igen." : businessError(e));
    }
  };

  const close = () => {
    if (phase === "pick" || (items.length === 0 && !source)) { router.back(); return; }
    Alert.alert("Släng berättelsen?", "Det du gjort sparas inte.", [
      { text: "Fortsätt redigera", style: "cancel" },
      { text: "Släng", style: "destructive", onPress: () => router.back() },
    ]);
  };

  const images = placeImages(place?.image_url);
  const activeOffers = (offers ?? []).filter((o) => o.offer.is_active && (!o.offer.expires_at || new Date(o.offer.expires_at).getTime() > Date.now()));
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (events ?? []).filter((e) => (e.end_date ?? e.date ?? "") >= today).slice(0, 8);

  // ── Välj bild ──
  if (phase === "pick") {
    return (
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <StatusBar style="light" />
        <View style={s.pickTop}>
          <TouchableOpacity onPress={close} hitSlop={10} style={s.round} accessibilityLabel="Stäng"><X size={22} color="#FFFFFF" strokeWidth={2.2} /></TouchableOpacity>
        </View>
        <View style={s.pickBody}>
          <Text style={s.pickTitle}>Ny berättelse</Text>
          <Text style={s.pickLead}>Visa hur det ser ut hos er just nu. Den syns överst på Hem i 24 timmar.</Text>
          <View style={s.pickButtons}>
            <TouchableOpacity style={[s.pickBtn, { backgroundColor: GOLD }]} activeOpacity={0.85} onPress={() => start("camera")}>
              <Camera size={22} color="#1A1408" strokeWidth={2.2} />
              <Text style={[s.pickBtnText, { color: "#1A1408" }]}>Ta en bild</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.pickBtn} activeOpacity={0.85} onPress={() => start("library")}>
              <ImageIcon size={22} color="#FFFFFF" strokeWidth={2} />
              <Text style={s.pickBtnText}>Välj från bilder</Text>
            </TouchableOpacity>
          </View>
          {images.length > 0 && (
            <>
              <Text style={s.pickSmall}>Eller använd en av era bilder</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {images.map((url) => (
                  <Pressable key={url} onPress={() => start({ url })} style={s.pickThumb}>
                    <ExpoImage source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
          {error && <Text style={s.error}>{error}</Text>}
        </View>
      </View>
    );
  }

  // ── Redigera ──
  const busy = phase === "publishing" || phase === "done";
  return (
    <View style={[s.root, { paddingTop: canvasTop }]}>
      <StatusBar style="light" hidden={busy} />
      <View style={[s.canvasWrap, { width: cw, height: ch }]}>
        {/* Det här fotograferas när man publicerar: bilden och allt ovanpå, inget annat */}
        <View ref={capture} collapsable={false} style={{ width: cw, height: ch, backgroundColor: "#000", overflow: "hidden" }}>
          <GestureDetector gesture={background}>
            <Reanimated.View style={StyleSheet.absoluteFill}>
              <Reanimated.View style={[StyleSheet.absoluteFill, imageStyle]}>
                {shown && <ExpoImage source={{ uri: shown }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />}
              </Reanimated.View>
            </Reanimated.View>
          </GestureDetector>
          {items.map((item) => {
            const motion = motions.current.get(item.id);
            return motion ? (
              <MovableItem
                key={item.id}
                item={item}
                motion={motion}
                maxWidth={cw * 0.86}
                trash={trash}
                onTap={onTapItem}
                onActive={setDragging}
                onOverTrash={setOverTrash}
                onDelete={removeItem}
              />
            ) : null;
          })}
        </View>

        {/* Knapparna ovanpå bilden (fotograferas inte) */}
        {!busy && !dragging && (
          <Reanimated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={s.tools} pointerEvents="box-none">
            <TouchableOpacity onPress={close} hitSlop={10} style={s.round} accessibilityLabel="Stäng"><X size={22} color="#FFFFFF" strokeWidth={2.2} /></TouchableOpacity>
            <View style={s.toolsRight}>
              <TouchableOpacity onPress={() => startText(cw / 2, ch * 0.4)} hitSlop={8} style={s.round} accessibilityLabel="Text"><Type size={21} color="#FFFFFF" strokeWidth={2.2} /></TouchableOpacity>
              <TouchableOpacity onPress={() => setStickers(true)} hitSlop={8} style={s.round} accessibilityLabel="Klistermärken"><Smile size={21} color="#FFFFFF" strokeWidth={2.2} /></TouchableOpacity>
            </View>
          </Reanimated.View>
        )}
        <Reanimated.View pointerEvents="none" style={[s.flash, flashStyle]}>
          <Text style={s.flashText}>{filter.name}</Text>
        </Reanimated.View>
        {dragging && (
          <View pointerEvents="none" style={[s.trash, overTrash && s.trashOver, { left: cw / 2 - 28, top: ch - 84 }]}>
            <Trash2 size={24} color={overTrash ? "#1A1408" : "#FFFFFF"} strokeWidth={2.2} />
          </View>
        )}
        {busy && (
          <Reanimated.View entering={FadeIn.duration(200)} style={[StyleSheet.absoluteFill, s.publishing]}>
            {phase === "done" ? (
              <>
                <View style={s.doneCircle}><Check size={40} color="#1A1408" strokeWidth={3} /></View>
                <Text style={s.publishText}>Berättelsen är ute!</Text>
              </>
            ) : (
              <Text style={s.publishText}>Lägger upp …</Text>
            )}
          </Reanimated.View>
        )}
      </View>

      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Text style={s.hint} numberOfLines={2}>
          {error ?? (items.length === 0 ? "Tryck på bilden för att skriva · svep för filter" : `Filter: ${filter.name}`)}
        </Text>
        <TouchableOpacity style={[s.publish, busy && { opacity: 0.5 }]} disabled={busy} activeOpacity={0.85} onPress={publish}>
          <Text style={s.publishBtn}>Publicera</Text>
        </TouchableOpacity>
      </View>

      {editing && <TextEditor editing={editing} onChange={setEditing} onDone={finishText} />}

      <Sheet visible={stickers} onClose={() => setStickers(false)} title="Lägg till" tall>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12, gap: 14 }}>
          {place && (
            <TouchableOpacity style={s.stickerRow} onPress={() => { setStickers(false); addItem({ id: newId(), kind: "place", text: place.name }, { x: cw / 2, y: ch * 0.22 }); }}>
              <MapPin size={20} color={GOLD} strokeWidth={2.2} />
              <Text style={s.stickerRowText}>Platsen · {place.name}</Text>
            </TouchableOpacity>
          )}
          {activeOffers.map((o) => (
            <TouchableOpacity key={o.offer.id} style={s.stickerRow} onPress={() => { setStickers(false); const l = offerLink(o.offer.id); if (l) addItem(l, { x: cw / 2, y: ch * 0.72 }); }}>
              <Ticket size={20} color={GOLD} strokeWidth={2.2} />
              <View style={{ flex: 1 }}>
                <Text style={s.stickerRowText} numberOfLines={1}>Erbjudande · {o.offer.title}</Text>
                <Text style={s.stickerRowSub}>Gästen trycker och kommer till erbjudandet</Text>
              </View>
            </TouchableOpacity>
          ))}
          {upcoming.map((e) => (
            <TouchableOpacity key={e.id} style={s.stickerRow} onPress={() => { setStickers(false); const l = eventLink(String(e.id)); if (l) addItem(l, { x: cw / 2, y: ch * 0.72 }); }}>
              <CalendarDays size={20} color={GOLD} strokeWidth={2.2} />
              <View style={{ flex: 1 }}>
                <Text style={s.stickerRowText} numberOfLines={1}>Evenemang · {e.title}</Text>
                <Text style={s.stickerRowSub}>{eventWhen(e)}</Text>
              </View>
            </TouchableOpacity>
          ))}
          <View style={s.emojis}>
            {EMOJIS.map((em) => (
              <TouchableOpacity key={em} style={s.emojiBtn} onPress={() => {
                setStickers(false);
                addItem({ id: newId(), kind: "emoji", text: em }, { x: cw * (0.3 + Math.random() * 0.4), y: ch * (0.3 + Math.random() * 0.3) });
              }}>
                <Text style={s.emojiText}>{em}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </Sheet>
    </View>
  );
}

/** Att skriva: texten mitt på skärmen, typsnitt och färger ovanför tangentbordet */
function TextEditor({ editing, onChange, onDone }: { editing: Editing; onChange: (e: Editing) => void; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({ paddingBottom: Math.max(keyboard.height.value, insets.bottom) + 10 }));
  const font = FONTS.find((f) => f.id === editing.font) ?? FONTS[0];
  const nextBg: Record<TextBg, TextBg> = { none: "solid", solid: "soft", soft: "none" };
  const solid = editing.bg === "solid";
  return (
    <Reanimated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={[StyleSheet.absoluteFill, s.editor]}>
      <View style={[s.editorTop, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={[s.bgBtn, editing.bg !== "none" && { backgroundColor: "#FFFFFF" }]}
          onPress={() => onChange({ ...editing, bg: nextBg[editing.bg] })}
          accessibilityLabel="Bakgrund bakom texten"
        >
          <Text style={[s.bgBtnText, editing.bg !== "none" && { color: "#111111" }]}>A</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDone} hitSlop={10}><Text style={s.doneText}>Klar</Text></TouchableOpacity>
      </View>
      <View style={s.editorCenter}>
        <View style={[s.editorBox, solid && { backgroundColor: editing.color }, editing.bg === "soft" && { backgroundColor: "rgba(0,0,0,0.5)" }]}>
          <TextInput
            value={editing.text}
            onChangeText={(text) => onChange({ ...editing, text })}
            autoFocus
            multiline
            maxLength={160}
            placeholder="Skriv något …"
            placeholderTextColor="rgba(255,255,255,0.5)"
            selectionColor={GOLD}
            style={[
              s.editorInput,
              { fontFamily: font.family, color: solid ? contrastOn(editing.color) : editing.color },
              font.id === "hand" && { fontSize: 40 },
              font.upper && { textTransform: "uppercase" },
            ]}
          />
        </View>
      </View>
      <Reanimated.View style={[s.editorBottom, lift]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fontRow} keyboardShouldPersistTaps="always">
          {FONTS.map((f) => (
            <TouchableOpacity key={f.id} onPress={() => onChange({ ...editing, font: f.id })} style={[s.fontChip, editing.font === f.id && s.fontChipOn]}>
              <Text style={[s.fontChipText, { fontFamily: f.family }, editing.font === f.id && { color: "#111111" }]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={s.colorRow}>
          {TEXT_COLORS.map((c) => (
            <TouchableOpacity key={c} onPress={() => onChange({ ...editing, color: c })} style={[s.colorDot, { backgroundColor: c }, editing.color === c && s.colorDotOn]} accessibilityLabel="Färg" />
          ))}
        </View>
      </Reanimated.View>
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000", alignItems: "center" },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.38)" },

  pickTop: { alignSelf: "stretch", paddingHorizontal: 16, paddingTop: 8 },
  pickBody: { flex: 1, alignSelf: "stretch", justifyContent: "center", paddingHorizontal: 24, gap: 14 },
  pickTitle: { fontFamily: "Montserrat_700Bold", fontSize: 30, letterSpacing: -0.6, color: "#FFFFFF" },
  pickLead: { fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 23, color: "rgba(255,255,255,0.7)" },
  pickButtons: { gap: 12, marginTop: 14 },
  pickBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 58, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.25)",
  },
  pickBtnText: { fontFamily: "Inter_700Bold", fontSize: 16.5, color: "#FFFFFF" },
  pickSmall: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: "rgba(255,255,255,0.6)", marginTop: 18 },
  pickThumb: { width: 70, height: 124, borderRadius: 12, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.08)" },
  error: { fontFamily: "Inter_500Medium", fontSize: 14, color: "#F87171", marginTop: 8 },

  canvasWrap: { borderRadius: 18, overflow: "hidden", backgroundColor: "#111111" },
  tools: { position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row", justifyContent: "space-between" },
  toolsRight: { flexDirection: "row", gap: 10 },
  flash: { position: "absolute", top: "42%", left: 0, right: 0, alignItems: "center" },
  flashText: {
    fontFamily: "Montserrat_700Bold", fontSize: 26, color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 },
  },
  trash: {
    position: "absolute", width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.7)",
  },
  trashOver: { backgroundColor: GOLD, borderColor: GOLD, transform: [{ scale: 1.15 }] },
  publishing: { backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", gap: 14 },
  publishText: { fontFamily: "Montserrat_700Bold", fontSize: 20, color: "#FFFFFF" },
  doneCircle: { width: 84, height: 84, borderRadius: 42, backgroundColor: GOLD, alignItems: "center", justifyContent: "center" },

  bar: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 12 },
  hint: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 18, color: "rgba(255,255,255,0.65)" },
  publish: { height: 50, paddingHorizontal: 26, borderRadius: 25, backgroundColor: GOLD, alignItems: "center", justifyContent: "center" },
  publishBtn: { fontFamily: "Montserrat_700Bold", fontSize: 14, letterSpacing: 1.2, textTransform: "uppercase", color: "#1A1408" },

  stickerRow: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)",
  },
  stickerRowText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#F5F1E8" },
  stickerRowSub: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: "rgba(245,241,232,0.55)", marginTop: 2 },
  emojis: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 6 },
  emojiBtn: { width: "14%", aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  emojiText: { fontSize: 34 },

  editor: { backgroundColor: "rgba(0,0,0,0.72)" },
  editorTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18 },
  bgBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  bgBtnText: { fontFamily: "Montserrat_700Bold", fontSize: 19, color: "#FFFFFF" },
  doneText: { fontFamily: "Inter_700Bold", fontSize: 17, color: "#FFFFFF" },
  editorCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  editorBox: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, maxWidth: "100%" },
  editorInput: { fontSize: 30, lineHeight: 36, textAlign: "center", minWidth: 60, padding: 0 },
  editorBottom: { gap: 12 },
  fontRow: { gap: 8, paddingHorizontal: 16 },
  fontChip: { paddingHorizontal: 14, height: 36, borderRadius: 18, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
  fontChipOn: { backgroundColor: "#FFFFFF" },
  fontChipText: { fontSize: 15, color: "#FFFFFF" },
  colorRow: { flexDirection: "row", justifyContent: "center", gap: 12, paddingHorizontal: 16 },
  colorDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "rgba(255,255,255,0.75)" },
  colorDotOn: { borderWidth: 3.5, borderColor: "#FFFFFF", transform: [{ scale: 1.15 }] },
});
