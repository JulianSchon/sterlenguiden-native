/**
 * Ny story — så likt Instagram som möjligt, så företagaren känner igen sig.
 *
 *  1. Ta en bild, välj en ur telefonen eller använd en av platsens egna.
 *  2. Filtren ligger som små förhandsbilder längst ner (eller svep åt sidan på bilden). Formatet
 *     (stående, liggande, kvadrat) byts uppe till höger; liggande och kvadrat får bilden suddig
 *     bakom. Tryck på bilden för att skriva (typsnitt, färg, bakgrund). Lägg till emoji,
 *     klistermärken, en bild till, platsens namn och en länk till ett erbjudande eller evenemang
 *     (gästen trycker på den i storyn och kommer dit). Platsen, länken och klistermärkena byter
 *     stil vid tryck. Dra, nyp och vrid allt; dra till papperskorgen för att ta bort. Två fingrar
 *     på bilden flyttar och zoomar den.
 *  3. Publicera: storyn fotograferas precis som den syns (med text och klistermärken inbakade),
 *     laddas upp och syns överst på Hem i 24 timmar. Skärmen blir mörk och guldcirkeln kommer
 *     fram, som när ett evenemang eller erbjudande läggs ut.
 *
 * Allt rör sig på UI-tråden. Filtren ritas av Skia i telefonen (lib/storyFilters).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions,
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
import {
  CalendarDays, Camera, Clock, ImageIcon, ImagePlus, MapPin, RectangleHorizontal, RectangleVertical, Smile, Square,
  Ticket, Trash2, Type, X,
} from "lucide-react-native";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { Sheet } from "@/components/Sheet";
import { useActionMenu } from "@/components/ActionMenu";
import { DoneMoment } from "@/components/business/WizardParts";
import {
  BADGES, FONTS, MovableItem, TEXT_COLORS, TOUCH_PAD, contrastOn, nextLook,
  type FontId, type ItemMotion, type StoryItem, type TextBg,
} from "@/components/business/StoryItems";
import { useBusinessOffers, useBusinessPlace, usePlaceEvents, usePortalPlace, useStoryActions } from "@/hooks/useBusiness";
import { placeImages } from "@/hooks/usePlaces";
import { businessError, uploadPlaceBytes, type StoryLink } from "@/lib/business";
import { preparePhoto } from "@/lib/photos";
import { STORY_FILTERS, renderFiltered } from "@/lib/storyFilters";
import { eventWhen } from "@/lib/events";

const EMOJIS = ["❤️", "🔥", "😍", "✨", "⭐", "☀️", "🌊", "🌿", "🍎", "🍷", "🍺", "☕", "🍰", "🦞", "🐟", "🧀", "🍕", "🎉", "🎶", "🛍️", "🌸", "🌻", "🍂", "❄️", "🥂", "👋", "🙌", "💛"];
const GOLD = "#E4C67A";
/** Nedre raden: filtren och Publicera */
const BAR_H = 148;
const THUMB = 52;

type Phase = "pick" | "edit" | "publishing" | "done";
/** Hur bilden ligger i storyn: fyller hela (stående), eller liggande/kvadrat med bilden suddig bakom */
type Fit = "fill" | "landscape" | "square";
const FITS: { id: Fit; name: string; Icon: typeof Square; ratio: number }[] = [
  { id: "fill", name: "Stående", Icon: RectangleVertical, ratio: 9 / 16 },
  { id: "landscape", name: "Liggande", Icon: RectangleHorizontal, ratio: 4 / 3 },
  { id: "square", name: "Kvadrat", Icon: Square, ratio: 1 },
];
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
  const menu = useActionMenu();

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
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [fit, setFit] = useState<Fit>("fill");
  const [items, setItems] = useState<StoryItem[]>([]);
  const motions = useRef(new Map<string, ItemMotion>());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [stickers, setStickers] = useState(false);
  // Panelens innehåll byggs först när den glidit upp, så den inte hackar på vägen
  const [stickersReady, setStickersReady] = useState(false);
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
  const [flashText, setFlashText] = useState("");

  const filter = STORY_FILTERS[filterIndex];
  const shown = filtered[filter.id] ?? filtered.none ?? source;
  const fitDef = FITS.find((f) => f.id === fit) ?? FITS[0];

  // Filtret ritas när man byter till det (en gång per filter)
  useEffect(() => {
    if (!source || filtered[filter.id]) return;
    let alive = true;
    renderFiltered(source, filter.matrix)
      .then((r) => { if (alive && r) setFiltered((m) => ({ ...m, [filter.id]: r.uri })); })
      .catch(() => { if (alive) setError("Filtren fungerar inte på den här telefonen."); });
    return () => { alive = false; };
  }, [source, filter, filtered]);

  // Små förhandsbilder av varje filter, en i taget
  useEffect(() => {
    if (!source) return;
    let alive = true;
    (async () => {
      for (const f of STORY_FILTERS) {
        const r = await renderFiltered(source, f.matrix, 160).catch(() => null);
        if (!alive) return;
        if (r) setThumbs((m) => ({ ...m, [f.id]: r.uri }));
      }
    })();
    return () => { alive = false; };
  }, [source]);

  const showFlash = useCallback((text: string) => {
    setFlashText(text);
    flash.value = withSequence(withTiming(1, { duration: 120 }), withDelay(700, withTiming(0, { duration: 300 })));
  }, [flash]);

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
      // Bara en länk per story
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

  const offerLink = useCallback((id: string): StoryItem | null => {
    const o = offers?.find((x) => x.offer.id === id)?.offer;
    if (!o) return null;
    return { id: newId(), kind: "link", link: { kind: "offer", id: o.id }, title: o.title, sub: o.savings_label ?? "Med Österlenpasset", look: 0 };
  }, [offers]);
  const eventLink = useCallback((id: string): StoryItem | null => {
    const e = events?.find((x) => String(x.id) === id);
    if (!e) return null;
    return { id: newId(), kind: "link", link: { kind: "event", id: String(e.id) }, title: e.title, sub: eventWhen(e, "sv"), look: 0 };
  }, [events]);

  // Öppnad från "Berätta om det i en story": länken ligger på plats direkt
  useEffect(() => {
    if (phase !== "edit" || autoLinked.current) return;
    const link = params.offer ? offerLink(params.offer) : params.event ? eventLink(params.event) : null;
    if (link) {
      autoLinked.current = true;
      addItem(link, { x: cw / 2, y: ch * 0.72 });
    }
  }, [phase, params.offer, params.event, offerLink, eventLink, addItem, cw, ch]);

  // ── Bilden ──
  /** Kameran eller biblioteket; null om man avbröt eller kameran är avstängd */
  const pickPhoto = async (kind: "camera" | "library"): Promise<{ uri: string; ratio: number } | null> => {
    if (kind === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        menu.ask(SH / 2 - 120, {
          title: "Kameran är avstängd", message: "Slå på kameran för Österlenappen i telefonens inställningar.",
          actions: [{ label: "Öppna inställningar", onPress: () => Linking.openSettings() }],
        });
        return null;
      }
    }
    const result = kind === "camera"
      ? await ImagePicker.launchCameraAsync({ quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (result.canceled) return null;
    const a = result.assets[0];
    const uri = await preparePhoto({ uri: a.uri, width: a.width, height: a.height }, 1600);
    return { uri, ratio: a.width && a.height ? a.width / a.height : 1 };
  };

  const start = async (kind: "camera" | "library" | { url: string }) => {
    try {
      const uri = typeof kind === "object" ? kind.url : (await pickPhoto(kind))?.uri ?? null;
      if (!uri) return;
      setSource(uri);
      setFiltered({ none: uri });
      setThumbs({});
      setFilterIndex(0);
      imgX.value = 0; imgY.value = 0; imgScale.value = 1;
      setPhase("edit");
    } catch (e) {
      setError(businessError(e));
    }
  };

  /** En bild till, ovanpå storyn */
  const addPhoto = async () => {
    setStickers(false);
    try {
      const photo = await pickPhoto("library");
      if (photo) addItem({ id: newId(), kind: "photo", uri: photo.uri, ratio: photo.ratio }, { x: cw / 2, y: ch * 0.45 });
    } catch (e) {
      setError(businessError(e));
    }
  };

  const chooseFilter = useCallback((i: number) => {
    setFilterIndex((cur) => {
      if (i !== cur) Haptics.selectionAsync().catch(() => {});
      return i;
    });
    showFlash(STORY_FILTERS[i].name);
  }, [showFlash]);
  const changeFilter = useCallback((dir: 1 | -1) => {
    chooseFilter(Math.min(STORY_FILTERS.length - 1, Math.max(0, filterIndex + dir)));
  }, [chooseFilter, filterIndex]);

  const cycleFit = () => {
    const next = FITS[(FITS.findIndex((f) => f.id === fit) + 1) % FITS.length];
    Haptics.selectionAsync().catch(() => {});
    setFit(next.id);
    imgX.value = 0; imgY.value = 0; imgScale.value = 1;
    showFlash(next.name);
  };

  const startText = useCallback((x: number, y: number) => {
    setEditing({ id: null, text: "", font: "classic", color: "#FFFFFF", bg: "none", at: { x, y } });
  }, []);

  // Bakgrunden: svep = filter, tryck = skriv, två fingrar = flytta och zooma bilden
  const background = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onStart(() => { imgStart.value = { x: imgX.value, y: imgY.value, scale: imgScale.value }; })
      .onUpdate((e) => { imgScale.value = Math.min(4, Math.max(0.5, imgStart.value.scale * e.scale)); });
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

  // Tryck på en sak: texten öppnas för att skrivas om; plats, länk och klistermärke byter stil
  const onTapItem = useCallback((id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    if (item.kind === "text") {
      setEditing({ id, text: item.text, font: item.font, color: item.color, bg: item.bg, at: { x: 0, y: 0 } });
    } else if (item.kind === "place" || item.kind === "link" || item.kind === "badge") {
      Haptics.selectionAsync().catch(() => {});
      setItems((list) => list.map((i) => (i.id === id && "look" in i ? { ...i, look: nextLook(i.look) } as StoryItem : i)));
    }
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
    // Det osynliga greppet runt länken räknas inte
    const w = (m.w.value - TOUCH_PAD * 2) * m.scale.value;
    const h = (m.h.value - TOUCH_PAD * 2) * m.scale.value;
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
    try {
      // Fotograferas innan skärmen blir mörk, så inget av det kommer med
      const snapshot = await makeImageFromView(capture);
      if (!snapshot) throw new Error("snapshot");
      setPhase("publishing");
      const bytes = snapshot.encodeToBytes(ImageFormat.JPEG, 90);
      const url = await uploadPlaceBytes(placeId, bytes);
      const caption = items.filter((i) => i.kind === "text").map((i) => (i as { text: string }).text).join(" · ").slice(0, 300) || null;
      await actions.post(url, caption, linkRect());
      setPhase("done");
    } catch (e) {
      setPhase("edit");
      setError(e instanceof Error && e.message === "snapshot" ? "Storyn kunde inte sparas. Försök igen." : businessError(e));
    }
  };

  const close = () => {
    if (phase === "pick" || (items.length === 0 && !source)) { router.back(); return; }
    menu.ask(insets.top + 56, {
      title: "Släng storyn?", message: "Det du gjort sparas inte.",
      actions: [{ label: "Släng", destructive: true, onPress: () => router.back() }],
    });
  };

  const images = placeImages(place?.image_url);
  const activeOffers = (offers ?? []).filter((o) => o.offer.is_active && (!o.offer.expires_at || new Date(o.offer.expires_at).getTime() > Date.now()));
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (events ?? []).filter((e) => (e.end_date ?? e.date ?? "") >= today).slice(0, 8);
  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  // ── Välj bild ──
  if (phase === "pick") {
    return (
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <StatusBar style="light" />
        <View style={s.pickTop}>
          <TouchableOpacity onPress={close} hitSlop={10} style={s.round} accessibilityLabel="Stäng"><X size={22} color="#FFFFFF" strokeWidth={2.2} /></TouchableOpacity>
        </View>
        <View style={s.pickBody}>
          <Text style={s.pickTitle}>Ny story</Text>
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
        {menu.element}
      </View>
    );
  }

  // ── Klart: mörk skärm och guldcirkeln, som för evenemang och erbjudanden ──
  if (phase === "done") {
    return (
      <View style={[s.root, s.doneRoot, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <DoneMoment
          title="Storyn är ute!"
          text="Den syns överst på Hem i 24 timmar – först för dem som sparat er."
          primary={{ label: "Klart", onPress: () => router.back() }}
        />
      </View>
    );
  }

  // ── Redigera ──
  const busy = phase === "publishing";
  const frameH = fit === "fill" ? ch : cw / fitDef.ratio;
  return (
    <View style={[s.root, { paddingTop: canvasTop }]}>
      <StatusBar style="light" hidden={busy} />
      <View style={[s.canvasWrap, { width: cw, height: ch }]}>
        {/* Det här fotograferas när man publicerar: bilden och allt ovanpå, inget annat */}
        <View ref={capture} collapsable={false} style={{ width: cw, height: ch, backgroundColor: "#000", overflow: "hidden" }}>
          {/* Liggande och kvadrat: samma bild suddig och lite mörkare bakom */}
          {fit !== "fill" && shown && (
            <>
              <ExpoImage source={{ uri: shown }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} transition={0} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.25)" }]} />
            </>
          )}
          <GestureDetector gesture={background}>
            <Reanimated.View style={[StyleSheet.absoluteFill, s.center]}>
              <Reanimated.View style={[{ width: cw, height: frameH, overflow: fit === "fill" ? "visible" : "hidden" }, imageStyle]}>
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
              <TouchableOpacity onPress={() => { setStickersReady(false); setStickers(true); }} hitSlop={8} style={s.round} accessibilityLabel="Lägg till"><Smile size={21} color="#FFFFFF" strokeWidth={2.2} /></TouchableOpacity>
              <TouchableOpacity onPress={cycleFit} hitSlop={8} style={s.round} accessibilityLabel={`Format: ${fitDef.name}`}>
                <fitDef.Icon size={21} color="#FFFFFF" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
          </Reanimated.View>
        )}
        <Reanimated.View pointerEvents="none" style={[s.flash, flashStyle]}>
          <Text style={s.flashText}>{flashText}</Text>
        </Reanimated.View>
        {dragging && (
          <View pointerEvents="none" style={[s.trash, overTrash && s.trashOver, { left: cw / 2 - 28, top: ch - 84 }]}>
            <Trash2 size={24} color={overTrash ? "#1A1408" : "#FFFFFF"} strokeWidth={2.2} />
          </View>
        )}
      </View>

      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {/* Filtren som små förhandsbilder: det valda har en guldram */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
          {STORY_FILTERS.map((f, i) => {
            const on = i === filterIndex;
            return (
              <Pressable key={f.id} onPress={() => chooseFilter(i)} style={s.filter} accessibilityLabel={`Filter: ${f.name}`}>
                <View style={[s.filterThumb, on && s.filterThumbOn]}>
                  {thumbs[f.id] ? <ExpoImage source={{ uri: thumbs[f.id] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
                </View>
                <Text style={[s.filterName, on && { color: "#FFFFFF" }]} numberOfLines={1}>{f.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={s.barRow}>
          <Text style={s.hint} numberOfLines={2}>
            {error ?? "Tryck på bilden för att skriva. Tryck på en sak för att byta stil."}
          </Text>
          <TouchableOpacity style={[s.publish, busy && { opacity: 0.5 }]} disabled={busy} activeOpacity={0.85} onPress={publish}>
            <Text style={s.publishBtn}>Publicera</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Medan storyn laddas upp: skärmen mörk */}
      {busy && (
        <Reanimated.View entering={FadeIn.duration(200)} style={[StyleSheet.absoluteFill, s.publishing]}>
          <Text style={s.publishText}>Lägger upp …</Text>
        </Reanimated.View>
      )}

      {editing && <TextEditor editing={editing} onChange={setEditing} onDone={finishText} />}

      <Sheet visible={stickers} onClose={() => setStickers(false)} onShow={() => setStickersReady(true)} title="Lägg till" tall>
        {stickersReady ? (
          <Reanimated.View entering={FadeIn.duration(160)} style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12, gap: 14 }}>
              <View style={s.quickRow}>
                {place && (
                  <TouchableOpacity style={s.quick} onPress={() => { setStickers(false); addItem({ id: newId(), kind: "place", text: place.name, look: 0 }, { x: cw / 2, y: ch * 0.22 }); }}>
                    <MapPin size={22} color={GOLD} strokeWidth={2.2} />
                    <Text style={s.quickText}>Platsen</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={s.quick} onPress={addPhoto}>
                  <ImagePlus size={22} color={GOLD} strokeWidth={2.2} />
                  <Text style={s.quickText}>Bild</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.quick} onPress={() => { setStickers(false); addItem({ id: newId(), kind: "badge", text: `Kl ${clock}`, look: 0 }, { x: cw / 2, y: ch * 0.3 }); }}>
                  <Clock size={22} color={GOLD} strokeWidth={2.2} />
                  <Text style={s.quickText}>Klockan</Text>
                </TouchableOpacity>
              </View>
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
                    <Text style={s.stickerRowSub}>{eventWhen(e, "sv")}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              <Text style={s.sheetLabel}>Klistermärken</Text>
              <View style={s.badges}>
                {BADGES.map((b) => (
                  <TouchableOpacity key={b} style={s.badgeBtn} onPress={() => { setStickers(false); addItem({ id: newId(), kind: "badge", text: b, look: 0 }, { x: cw / 2, y: ch * 0.3 }); }}>
                    <Text style={s.badgeBtnText}>{b.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.sheetLabel}>Emoji</Text>
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
          </Reanimated.View>
        ) : null}
      </Sheet>
      {menu.element}
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
  doneRoot: { alignItems: "stretch", backgroundColor: "#121212" },
  center: { alignItems: "center", justifyContent: "center" },
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
  publishing: { backgroundColor: "#121212", alignItems: "center", justifyContent: "center" },
  publishText: { fontFamily: "Montserrat_700Bold", fontSize: 20, color: "#FFFFFF" },

  bar: { alignSelf: "stretch", gap: 10, paddingTop: 10 },
  filters: { gap: 12, paddingHorizontal: 16 },
  filter: { alignItems: "center", gap: 5, width: THUMB + 6 },
  filterThumb: {
    width: THUMB, height: THUMB, borderRadius: 14, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 2, borderColor: "transparent",
  },
  filterThumbOn: { borderColor: GOLD },
  filterName: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "rgba(255,255,255,0.55)" },
  barRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 },
  hint: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 12.5, lineHeight: 17, color: "rgba(255,255,255,0.65)" },
  publish: { height: 48, paddingHorizontal: 24, borderRadius: 24, backgroundColor: GOLD, alignItems: "center", justifyContent: "center" },
  publishBtn: { fontFamily: "Montserrat_700Bold", fontSize: 14, letterSpacing: 1.2, textTransform: "uppercase", color: "#1A1408" },

  quickRow: { flexDirection: "row", gap: 10 },
  quick: {
    flex: 1, alignItems: "center", gap: 6, paddingVertical: 14, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)",
  },
  quickText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#F5F1E8" },
  stickerRow: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)",
  },
  stickerRowText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#F5F1E8" },
  stickerRowSub: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: "rgba(245,241,232,0.55)", marginTop: 2 },
  sheetLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: "rgba(245,241,232,0.55)", marginTop: 4 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badgeBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: "#FFFFFF" },
  badgeBtnText: { fontFamily: "Montserrat_700Bold", fontSize: 13, letterSpacing: 0.6, color: "#111111" },
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
