/**
 * Ny story — så likt Instagram som möjligt, så företagaren känner igen sig.
 *
 *  1. Ta en bild eller film, välj en ur telefonen eller använd en av platsens bilder. En film är
 *     högst 30 sekunder; den saknar filter och format men får allt annat ovanpå.
 *  2. Verktygen står i en rad till höger, som på Instagram: Text, Lägg till, Rita och Format.
 *     Filtren ligger som små förhandsbilder längst ner (eller svep åt sidan på bilden). Formatet
 *     (stående, liggande, kvadrat) får bilden suddig bakom vid liggande och kvadrat. Tryck på
 *     bilden för att skriva (typsnitt, färg, bakgrund, storlek med reglaget till vänster,
 *     justering). Lägg till emoji, klistermärken, en bild till, platsens namn och en länk till ett
 *     erbjudande eller evenemang (gästen trycker på den i storyn och kommer dit). Platsen, länken
 *     och klistermärkena byter stil vid tryck (smal/kvadrat, vit/svart). Rita med fingret. Dra, nyp
 *     och vrid allt; nära mitten syns en hjälplinje och saken fastnar. Den sak man rör hamnar
 *     överst. Dra till papperskorgen för att ta bort. Två fingrar på bilden flyttar och zoomar den.
 *     En enkät (fråga och två svar) eller en fråga (gästen skriver ett svar) — högst en per story —
 *     ritas inte in i bilden utan sparas med sin plats och visas levande för gästerna.
 *  3. Publicera: storyn fotograferas precis som den syns (med text och klistermärken inbakade),
 *     laddas upp och syns överst på Hem i 24 timmar. En film laddas upp som den är, med två bilder:
 *     ett genomskinligt lager med det man lagt ovanpå (visas över filmen) och ett omslag. Skärmen blir mörk och guldcirkeln kommer
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
  AlignCenter, AlignLeft, AlignRight, Brush, CalendarDays, Camera, ChartColumn, MessageCircleQuestionMark, Clock, ImageIcon, ImagePlus, MapPin, RectangleHorizontal,
  RectangleVertical, Smile, Square, Ticket, Trash2, Type, X,
} from "lucide-react-native";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { Sheet } from "@/components/Sheet";
import { useActionMenu } from "@/components/ActionMenu";
import { DoneMoment } from "@/components/business/WizardParts";
import {
  BADGES, FONTS, MovableItem, TEXT_COLORS, TEXT_SIZE, TOUCH_PAD, contrastOn, nextLook, textMetrics,
  type FontId, type ItemMotion, type StoryItem, type TextAlign, type TextBg,
} from "@/components/business/StoryItems";
import { DrawingTools, StrokesView, type Stroke } from "@/components/business/StoryDrawing";
import { StoryVideo, videoAvailable, type StoryVideoHandle } from "@/components/stories/StoryVideo";
import { PortalField } from "@/components/business/PortalParts";
import { PrimaryButton } from "@/components/Sheet";
import { useBusinessOffers, useBusinessPlace, usePlaceEvents, usePortalPlace, useStoryActions } from "@/hooks/useBusiness";
import { placeImages } from "@/hooks/usePlaces";
import { businessError, uploadPlaceBytes, type StoryInteraction, type StoryLink } from "@/lib/business";
import { preparePhoto } from "@/lib/photos";
import { STORY_FILTERS, renderFiltered } from "@/lib/storyFilters";
import { eventWhen } from "@/lib/events";
import { tb } from "@/i18n/business";
import { currentLanguage } from "@/i18n";

const EMOJIS = ["❤️", "🔥", "😍", "✨", "⭐", "☀️", "🌊", "🌿", "🍎", "🍷", "🍺", "☕", "🍰", "🦞", "🐟", "🧀", "🍕", "🎉", "🎶", "🛍️", "🌸", "🌻", "🍂", "❄️", "🥂", "👋", "🙌", "💛"];
const GOLD = "#E4C67A";
/** Nedre raden: filtren och Publicera */
const BAR_H = 100;
const THUMB = 52;

type Phase = "pick" | "edit" | "publishing" | "done";
/** Hur bilden ligger i storyn: fyller hela (stående), eller liggande/kvadrat med bilden suddig bakom */
type Fit = "fill" | "landscape" | "square";
const FITS: { id: Fit; name: string; Icon: typeof Square; ratio: number }[] = [
  { id: "fill", name: "Stående", Icon: RectangleVertical, ratio: 9 / 16 },
  { id: "landscape", name: "Liggande", Icon: RectangleHorizontal, ratio: 4 / 3 },
  { id: "square", name: "Kvadrat", Icon: Square, ratio: 1 },
];
interface Editing { id: string | null; text: string; font: FontId; color: string; bg: TextBg; size: number; align: TextAlign; at: { x: number; y: number } }
const NEXT_ALIGN: Record<TextAlign, TextAlign> = { center: "left", left: "right", right: "center" };
/** Enkäten eller frågan som skrivs i panelen (id = den som ändras, null = ny) */
interface InteractionDraft { id: string | null; kind: "poll" | "question"; question: string; a: string; b: string; prompt: string }
/** Vad som syns när storyn fotograferas: allt (stillbild), bara det ovanpå (filmens lager) eller omslaget */
type Capture = "off" | "still" | "overlay" | "poster";
const isInteraction = (i: StoryItem) => i.kind === "poll" || i.kind === "question";
/** Ett par bildrutor, så att det som ändrats hunnit ritas innan storyn fotograferas */
const frames = (n = 3) => new Promise<void>((resolve) => {
  let i = 0;
  const tick = () => (++i >= n ? resolve() : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
});

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function StoryEditorScreen() {
  // Startsidan och Klart följer appens läge; själva redigeringen är alltid mörk, som en kamera
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StoryEditor />
    </GestureHandlerRootView>
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
  // Startsidan (välj bild) och Klart har appens färger i ljust och mörkt läge; redigeringen är mörk
  const { colors, scheme } = useTheme();
  const pick = { color: colors.text };

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
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  // Videostory: filmen i stället för bilden
  const [video, setVideo] = useState<{ uri: string } | null>(null);
  const videoRef = useRef<StoryVideoHandle>(null);
  const [capturing, setCapturing] = useState<Capture>("off");
  const [posterThumb, setPosterThumb] = useState<unknown | null>(null);
  const posterLoaded = useRef<(() => void) | null>(null);
  const [interactionDraft, setInteractionDraft] = useState<InteractionDraft | null>(null);
  const [drawing, setDrawing] = useState(false);
  // Hjälplinjerna genom mitten medan en sak dras dit
  const [guides, setGuides] = useState({ v: false, h: false });
  // Vilken sak som ligger överst: den man senast rörde (zIndex, så ingen flyttas i trädet mitt i en gest)
  const [front, setFront] = useState<Record<string, number>>({});
  const frontCounter = useRef(0);
  // Verktygens namn syns en stund när man börjar redigera, sedan bara symbolerna (som på Instagram)
  const [toolNames, setToolNames] = useState(true);
  useEffect(() => {
    if (phase !== "edit") return;
    const t = setTimeout(() => setToolNames(false), 3500);
    return () => clearTimeout(t);
  }, [phase]);
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
      .catch(() => { if (alive) setError(tb("Filtren fungerar inte på den här telefonen.")); });
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
      const rest = item.kind === "link" ? list.filter((i) => i.kind !== "link")
        : isInteraction(item) ? list.filter((i) => !isInteraction(i))
        : list;
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
    return { id: newId(), kind: "link", link: { kind: "offer", id: o.id }, title: o.title, sub: o.savings_label ?? tb("Med Österlenpasset"), look: 0 };
  }, [offers]);
  const eventLink = useCallback((id: string): StoryItem | null => {
    const e = events?.find((x) => String(x.id) === id);
    if (!e) return null;
    return { id: newId(), kind: "link", link: { kind: "event", id: String(e.id) }, title: e.title, sub: eventWhen(e, currentLanguage()), look: 0 };
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
  const pickPhoto = async (kind: "camera" | "library", allowVideo = false): Promise<{ uri: string; ratio: number; isVideo: boolean } | null> => {
    if (kind === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        menu.ask({
          title: tb("Kameran är avstängd"), message: tb("Slå på kameran för Österlenappen i telefonens inställningar."),
          actions: [{ label: tb("Öppna inställningar"), onPress: () => Linking.openSettings() }],
        });
        return null;
      }
    }
    // Film: högst 30 sekunder, och telefonen gör om den till 720p så den inte blir för stor
    const media: ImagePicker.ImagePickerOptions = allowVideo && videoAvailable()
      ? { mediaTypes: ["images", "videos"], videoMaxDuration: 30, videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720, quality: 1 }
      : { mediaTypes: ["images"], quality: 1 };
    const result = kind === "camera" ? await ImagePicker.launchCameraAsync(media) : await ImagePicker.launchImageLibraryAsync(media);
    if (result.canceled) return null;
    const a = result.assets[0];
    const ratio = a.width && a.height ? a.width / a.height : 1;
    if (a.type === "video") {
      if ((a.duration ?? 0) > 31000) throw new Error("video_too_long");
      return { uri: a.uri, ratio, isVideo: true };
    }
    const uri = await preparePhoto({ uri: a.uri, width: a.width, height: a.height }, 1600);
    return { uri, ratio, isVideo: false };
  };

  const start = async (kind: "camera" | "library" | { url: string }) => {
    try {
      const picked = typeof kind === "object" ? { uri: kind.url, isVideo: false } : await pickPhoto(kind, true);
      if (!picked) return;
      if (picked.isVideo) {
        setVideo({ uri: picked.uri });
        setSource(null);
        setFiltered({});
        setThumbs({});
        setPhase("edit");
        return;
      }
      const uri = picked.uri;
      setVideo(null);
      setSource(uri);
      setFiltered({ none: uri });
      setThumbs({});
      setFilterIndex(0);
      imgX.value = 0; imgY.value = 0; imgScale.value = 1;
      setPhase("edit");
    } catch (e) {
      setError(e instanceof Error && e.message === "video_too_long" ? tb("Filmen får vara högst 30 sekunder.") : businessError(e));
    }
  };

  /** En bild till, ovanpå storyn */
  const addPhoto = async () => {
    setStickers(false);
    // Bildväljaren kan inte öppnas medan panelen fortfarande glider ner (appen frös): vänta in den
    await new Promise((r) => setTimeout(r, 450));
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
    showFlash(tb(STORY_FILTERS[i].name));
  }, [showFlash]);
  const changeFilter = useCallback((dir: 1 | -1) => {
    chooseFilter(Math.min(STORY_FILTERS.length - 1, Math.max(0, filterIndex + dir)));
  }, [chooseFilter, filterIndex]);

  const cycleFit = () => {
    const next = FITS[(FITS.findIndex((f) => f.id === fit) + 1) % FITS.length];
    Haptics.selectionAsync().catch(() => {});
    setFit(next.id);
    imgX.value = 0; imgY.value = 0; imgScale.value = 1;
    showFlash(tb(next.name));
  };

  const startText = useCallback((x: number, y: number) => {
    setEditing({ id: null, text: "", font: "classic", color: "#FFFFFF", bg: "none", size: TEXT_SIZE.base, align: "center", at: { x, y } });
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
      setEditing({ id, text: item.text, font: item.font, color: item.color, bg: item.bg, size: item.size, align: item.align, at: { x: 0, y: 0 } });
    } else if (item.kind === "poll") {
      setInteractionDraft({ id, kind: "poll", question: item.question, a: item.options[0], b: item.options[1], prompt: "" });
    } else if (item.kind === "question") {
      setInteractionDraft({ id, kind: "question", question: "", a: "", b: "", prompt: item.prompt });
    } else if (item.kind === "place" || item.kind === "link" || item.kind === "badge") {
      Haptics.selectionAsync().catch(() => {});
      setItems((list) => list.map((i) => (i.id === id && "look" in i ? { ...i, look: nextLook(i.look) } as StoryItem : i)));
    }
  }, [items]);

  /** Panelen för enkät eller fråga öppnas först när Lägg till-panelen glidit ner */
  const newInteraction = (kind: "poll" | "question") => {
    setStickers(false);
    setTimeout(() => setInteractionDraft({ id: null, kind, question: "", a: tb("Ja"), b: tb("Nej"), prompt: tb("Fråga oss något!") }), 450);
  };
  const saveInteraction = () => {
    const d = interactionDraft;
    if (!d) return;
    const item: StoryItem = d.kind === "poll"
      ? { id: d.id ?? newId(), kind: "poll", question: d.question.trim(), options: [d.a.trim(), d.b.trim()] }
      : { id: d.id ?? newId(), kind: "question", prompt: d.prompt.trim() };
    if (d.id) setItems((list) => list.map((i) => (i.id === d.id ? item : i)));
    else addItem(item, { x: cw / 2, y: ch * 0.6 });
    setInteractionDraft(null);
  };
  const interactionOk = !!interactionDraft && (interactionDraft.kind === "poll"
    ? interactionDraft.a.trim().length > 0 && interactionDraft.b.trim().length > 0
    : interactionDraft.prompt.trim().length > 0);

  const bringToFront = useCallback((id: string) => {
    frontCounter.current += 1;
    const z = frontCounter.current;
    setFront((m) => ({ ...m, [id]: z }));
  }, []);
  const showGuides = useCallback((v: boolean, h: boolean) => setGuides({ v, h }), []);
  const addStroke = useCallback((stroke: Stroke) => setStrokes((list) => [...list, stroke]), []);

  const finishText = () => {
    if (!editing) return;
    const text = editing.text.trim();
    if (editing.id) {
      if (!text) removeItem(editing.id);
      else setItems((list) => list.map((i) => (i.id === editing.id ? { ...i, text, font: editing.font, color: editing.color, bg: editing.bg, size: editing.size, align: editing.align } as StoryItem : i)));
    } else if (text) {
      addItem({ id: newId(), kind: "text", text, font: editing.font, color: editing.color, bg: editing.bg, size: editing.size, align: editing.align }, editing.at);
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

  /** Enkäten eller frågan: mitten, storleken (utan det osynliga greppet) och vridningen, i andelar av bilden */
  const interactionRect = (): StoryInteraction | null => {
    const item = items.find(isInteraction);
    const m = item && motions.current.get(item.id);
    if (!item || !m) return null;
    const place = {
      x: m.x.value / cw, y: m.y.value / ch,
      w: ((m.w.value - TOUCH_PAD * 2) * m.scale.value) / cw, h: ((m.h.value - TOUCH_PAD * 2) * m.scale.value) / ch,
      r: m.rot.value,
    };
    if (item.kind === "poll") return { kind: "poll", question: item.question, options: item.options, ...place };
    if (item.kind === "question") return { kind: "question", prompt: item.prompt, ...place };
    return null;
  };

  /** Fotograferar det som syns i läget `mode` (det ritas om först) */
  const shoot = async (mode: Capture) => {
    setCapturing(mode);
    await frames();
    const image = await makeImageFromView(capture);
    if (!image) throw new Error("snapshot");
    return image;
  };

  const publish = async () => {
    setError(null);
    try {
      const caption = items.filter((i) => i.kind === "text").map((i) => (i as { text: string }).text).join(" · ").slice(0, 300) || null;
      const interaction = interactionRect();
      if (video) {
        // Lagret ovanpå filmen (genomskinligt), sedan omslaget: en stillbild ur filmen med samma saker ovanpå
        const overlay = await shoot("overlay");
        const thumb = await videoRef.current?.poster();
        const loaded = new Promise<void>((resolve) => { posterLoaded.current = resolve; setTimeout(resolve, 1500); });
        setPosterThumb(thumb ?? null);
        if (thumb) await loaded;
        const poster = await shoot("poster");
        setCapturing("off");
        setPhase("publishing");
        const film = await (await fetch(video.uri)).arrayBuffer();
        const [videoUrl, overlayUrl, imageUrl] = await Promise.all([
          uploadPlaceBytes(placeId, film, video.uri.toLowerCase().endsWith(".mov") ? "mov" : "mp4"),
          uploadPlaceBytes(placeId, overlay.encodeToBytes(ImageFormat.PNG, 100), "png"),
          uploadPlaceBytes(placeId, poster.encodeToBytes(ImageFormat.JPEG, 85)),
        ]);
        await actions.post({ imageUrl, caption, link: linkRect(), videoUrl, overlayUrl, interaction });
      } else {
        // Fotograferas innan skärmen blir mörk, så inget av det kommer med
        const snapshot = await shoot("still");
        setCapturing("off");
        setPhase("publishing");
        const imageUrl = await uploadPlaceBytes(placeId, snapshot.encodeToBytes(ImageFormat.JPEG, 90));
        await actions.post({ imageUrl, caption, link: linkRect(), interaction });
      }
      setPhase("done");
    } catch (e) {
      setCapturing("off");
      setPhase("edit");
      setError(e instanceof Error && e.message === "snapshot" ? tb("Storyn kunde inte sparas. Försök igen.") : businessError(e));
    }
  };

  const close = () => {
    if (phase === "pick" || (items.length === 0 && !source)) { router.back(); return; }
    menu.ask({
      title: tb("Släng storyn?"), message: tb("Det du gjort sparas inte."),
      actions: [{ label: tb("Släng"), destructive: true, onPress: () => router.back() }],
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
      <View style={[s.root, { backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <View style={s.pickTop}>
          <TouchableOpacity onPress={close} hitSlop={10} style={[s.round, { backgroundColor: colors.fill }]} accessibilityLabel={tb("Stäng")}><X size={22} color={colors.text} strokeWidth={2.2} /></TouchableOpacity>
        </View>
        <View style={s.pickBody}>
          <Text style={[s.pickTitle, pick]}>{tb("Ny story")}</Text>
          <Text style={[s.pickLead, { color: colors.muted }]}>{tb("Visa hur det ser ut hos er just nu. Den syns överst på Hem i 24 timmar.")}</Text>
          <View style={s.pickButtons}>
            <TouchableOpacity style={[s.pickBtn, { backgroundColor: GOLD }]} activeOpacity={0.85} onPress={() => start("camera")}>
              <Camera size={22} color="#1A1408" strokeWidth={2.2} />
              <Text style={[s.pickBtnText, { color: "#1A1408" }]}>{tb("Ta en bild")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.pickBtn, { backgroundColor: colors.card, borderColor: colors.borderStrong }]} activeOpacity={0.85} onPress={() => start("library")}>
              <ImageIcon size={22} color={colors.text} strokeWidth={2} />
              <Text style={[s.pickBtnText, pick]}>{tb("Välj från bilder")}</Text>
            </TouchableOpacity>
          </View>
          {images.length > 0 && (
            <>
              <Text style={[s.pickSmall, { color: colors.muted }]}>{tb("Eller använd en av era bilder")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {images.map((url) => (
                  <Pressable key={url} onPress={() => start({ url })} style={[s.pickThumb, { backgroundColor: colors.fill }]}>
                    <ExpoImage source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
          {error && <Text style={[s.error, { color: colors.danger }]}>{error}</Text>}
        </View>
      </View>
    );
  }

  // ── Klart: mörk skärm och guldcirkeln, som för evenemang och erbjudanden ──
  if (phase === "done") {
    return (
      <View style={[s.root, s.doneRoot, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <DoneMoment
          title={tb("Storyn är ute!")}
          text={tb("Den syns överst på Hem i 24 timmar – först för dem som sparat er.")}
          primary={{ label: tb("Klart"), onPress: () => router.back() }}
        />
      </View>
    );
  }

  // ── Redigera ──
  const busy = phase === "publishing";
  const frameH = fit === "fill" ? ch : cw / fitDef.ratio;
  return (
    <ThemeProvider forced="dark">
    <View style={[s.root, { paddingTop: canvasTop }]}>
      <StatusBar style="light" hidden={busy} />
      <View style={[s.canvasWrap, { width: cw, height: ch }]}>
        {/* Det här fotograferas när man publicerar: bilden och allt ovanpå, inget annat */}
        <View ref={capture} collapsable={false} style={{ width: cw, height: ch, backgroundColor: capturing === "overlay" ? "transparent" : "#000", overflow: "hidden" }}>
          {/* Liggande och kvadrat: samma bild suddig och lite mörkare bakom */}
          {!video && fit !== "fill" && shown && (
            <>
              <ExpoImage source={{ uri: shown }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} transition={0} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.25)" }]} />
            </>
          )}
          <GestureDetector gesture={background}>
            <Reanimated.View style={[StyleSheet.absoluteFill, s.center]}>
              {video ? (
                // Filmen (tyst medan man redigerar); när storyn fotograferas syns den inte, eller som omslag
                <View style={StyleSheet.absoluteFill}>
                  {capturing === "poster" ? (
                    posterThumb ? <ExpoImage source={posterThumb as never} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} onLoad={() => posterLoaded.current?.()} /> : null
                  ) : capturing !== "overlay" ? (
                    <StoryVideo ref={videoRef} uri={video.uri} playing={!busy} muted loop />
                  ) : null}
                </View>
              ) : (
                <Reanimated.View style={[{ width: cw, height: frameH, overflow: fit === "fill" ? "visible" : "hidden" }, imageStyle]}>
                  {!!shown && <ExpoImage source={{ uri: shown }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />}
                </Reanimated.View>
              )}
            </Reanimated.View>
          </GestureDetector>
          {items.map((item) => {
            const motion = motions.current.get(item.id);
            return motion ? (
              <View key={item.id} style={[StyleSheet.absoluteFill, { zIndex: front[item.id] ?? 0 }, capturing !== "off" && isInteraction(item) && { opacity: 0 }]} pointerEvents="box-none">
                <MovableItem
                  item={item}
                  motion={motion}
                  maxWidth={cw * 0.86}
                  trash={trash}
                  center={{ x: cw / 2, y: ch / 2 }}
                  onTap={onTapItem}
                  onFront={bringToFront}
                  onGuides={showGuides}
                  onActive={setDragging}
                  onOverTrash={setOverTrash}
                  onDelete={removeItem}
                />
              </View>
            ) : null;
          })}
          <View style={[StyleSheet.absoluteFill, { zIndex: frontCounter.current + 1 }]} pointerEvents="none">
            <StrokesView strokes={strokes} width={cw} height={ch} />
          </View>
        </View>

        {/* Hjälplinjerna genom mitten (fotograferas inte) */}
        {guides.v && <View pointerEvents="none" style={[s.guideV, { left: cw / 2 - 0.75 }]} />}
        {guides.h && <View pointerEvents="none" style={[s.guideH, { top: ch / 2 - 0.75 }]} />}

        {/* Knapparna ovanpå bilden (fotograferas inte) */}
        {!busy && !dragging && !drawing && (
          <Reanimated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={s.tools} pointerEvents="box-none">
            <TouchableOpacity onPress={close} hitSlop={10} style={s.round} accessibilityLabel={tb("Stäng")}><X size={22} color="#FFFFFF" strokeWidth={2.2} /></TouchableOpacity>
            <View style={s.toolsRight}>
              <Tool label={tb("Text")} showLabel={toolNames} onPress={() => startText(cw / 2, ch * 0.4)}><Type size={21} color="#FFFFFF" strokeWidth={2.2} /></Tool>
              <Tool label={tb("Lägg till")} showLabel={toolNames} onPress={() => { setStickersReady(false); setStickers(true); }}><Smile size={21} color="#FFFFFF" strokeWidth={2.2} /></Tool>
              <Tool label={tb("Rita")} showLabel={toolNames} onPress={() => setDrawing(true)}><Brush size={21} color="#FFFFFF" strokeWidth={2.2} /></Tool>
              {!video && <Tool label={tb(fitDef.name)} showLabel={toolNames} onPress={cycleFit}><fitDef.Icon size={21} color="#FFFFFF" strokeWidth={2.2} /></Tool>}
            </View>
          </Reanimated.View>
        )}
        {drawing && (
          <DrawingTools
            width={cw}
            height={ch}
            canUndo={strokes.length > 0}
            onStroke={addStroke}
            onUndo={() => setStrokes((list) => list.slice(0, -1))}
            onDone={() => setDrawing(false)}
          />
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
        {video ? <View style={{ flex: 1 }} /> : <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={s.filters}>
          {STORY_FILTERS.map((f, i) => {
            const on = i === filterIndex;
            return (
              <Pressable key={f.id} onPress={() => chooseFilter(i)} style={s.filter} accessibilityLabel={tb("Filter: {{0}}", { 0: f.name })}>
                <View style={[s.filterThumb, on && s.filterThumbOn]}>
                  {thumbs[f.id] ? <ExpoImage source={{ uri: thumbs[f.id] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
                </View>
                <Text style={[s.filterName, on && { color: "#FFFFFF" }]} numberOfLines={1}>{tb(f.name)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>}
        <TouchableOpacity style={[s.publish, busy && { opacity: 0.5 }]} disabled={busy} activeOpacity={0.85} onPress={publish}>
          <Text style={s.publishBtn}>{tb("Publicera")}</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={[s.errorFloat, { bottom: BAR_H + Math.max(insets.bottom, 12) }]} numberOfLines={2}>{error}</Text> : null}

      {/* Medan storyn laddas upp: skärmen mörk */}
      {busy && (
        <Reanimated.View entering={FadeIn.duration(200)} style={[StyleSheet.absoluteFill, s.publishing]}>
          <Text style={s.publishText}>{tb("Lägger upp …")}</Text>
        </Reanimated.View>
      )}

      {editing && <TextEditor editing={editing} onChange={setEditing} onSize={(size) => setEditing((e) => (e ? { ...e, size } : e))} onDone={finishText} />}

      <Sheet visible={stickers} onClose={() => setStickers(false)} onShow={() => setStickersReady(true)} title={tb("Lägg till")} tall>
        {stickersReady ? (
          <Reanimated.View entering={FadeIn.duration(160)} style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12, gap: 14 }}>
              <View style={s.quickRow}>
                {place && (
                  <TouchableOpacity style={s.quick} onPress={() => { setStickers(false); addItem({ id: newId(), kind: "place", text: place.name, look: 0 }, { x: cw / 2, y: ch * 0.22 }); }}>
                    <MapPin size={22} color={GOLD} strokeWidth={2.2} />
                    <Text style={s.quickText}>{tb("Platsen")}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={s.quick} onPress={() => newInteraction("poll")}>
                  <ChartColumn size={22} color={GOLD} strokeWidth={2.2} />
                  <Text style={s.quickText}>{tb("Enkät")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.quick} onPress={() => newInteraction("question")}>
                  <MessageCircleQuestionMark size={22} color={GOLD} strokeWidth={2.2} />
                  <Text style={s.quickText}>{tb("Fråga")}</Text>
                </TouchableOpacity>
              </View>
              <View style={s.quickRow}>
                <TouchableOpacity style={s.quick} onPress={addPhoto}>
                  <ImagePlus size={22} color={GOLD} strokeWidth={2.2} />
                  <Text style={s.quickText}>{tb("Bild")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.quick} onPress={() => { setStickers(false); addItem({ id: newId(), kind: "badge", text: tb("Kl {{0}}", { 0: clock }), look: 0 }, { x: cw / 2, y: ch * 0.3 }); }}>
                  <Clock size={22} color={GOLD} strokeWidth={2.2} />
                  <Text style={s.quickText}>{tb("Klockan")}</Text>
                </TouchableOpacity>
              </View>
              {activeOffers.map((o) => (
                <TouchableOpacity key={o.offer.id} style={s.stickerRow} onPress={() => { setStickers(false); const l = offerLink(o.offer.id); if (l) addItem(l, { x: cw / 2, y: ch * 0.72 }); }}>
                  <Ticket size={20} color={GOLD} strokeWidth={2.2} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.stickerRowText} numberOfLines={1}>{tb("Erbjudande ·")} {o.offer.title}</Text>
                    <Text style={s.stickerRowSub}>{tb("Gästen trycker och kommer till erbjudandet")}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {upcoming.map((e) => (
                <TouchableOpacity key={e.id} style={s.stickerRow} onPress={() => { setStickers(false); const l = eventLink(String(e.id)); if (l) addItem(l, { x: cw / 2, y: ch * 0.72 }); }}>
                  <CalendarDays size={20} color={GOLD} strokeWidth={2.2} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.stickerRowText} numberOfLines={1}>{tb("Evenemang ·")} {e.title}</Text>
                    <Text style={s.stickerRowSub}>{eventWhen(e, currentLanguage())}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              <Text style={s.sheetLabel}>{tb("Klistermärken")}</Text>
              <View style={s.badges}>
                {BADGES.map((b) => (
                  <TouchableOpacity key={b} style={s.badgeBtn} onPress={() => { setStickers(false); addItem({ id: newId(), kind: "badge", text: tb(b), look: 0 }, { x: cw / 2, y: ch * 0.3 }); }}>
                    <Text style={s.badgeBtnText}>{tb(b).toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.sheetLabel}>{tb("Emoji")}</Text>
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

      <Sheet visible={!!interactionDraft} onClose={() => setInteractionDraft(null)} title={interactionDraft?.kind === "question" ? tb("Fråga") : tb("Enkät")}>
        {interactionDraft && (
          <View style={{ gap: 14 }}>
            {interactionDraft.kind === "poll" ? (
              <>
                <PortalField label={tb("Frågan (valfritt)")} value={interactionDraft.question} maxLength={80} placeholder={tb("T.ex. Vilken tårta blir veckans?")}
                  onChangeText={(v) => setInteractionDraft({ ...interactionDraft, question: v })} />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <PortalField label={tb("Svar 1")} value={interactionDraft.a} maxLength={24} onChangeText={(v) => setInteractionDraft({ ...interactionDraft, a: v })} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PortalField label={tb("Svar 2")} value={interactionDraft.b} maxLength={24} onChangeText={(v) => setInteractionDraft({ ...interactionDraft, b: v })} />
                  </View>
                </View>
                <Text style={s.sheetNote}>{tb("Gästerna röstar direkt i storyn och ser resultatet. Ni ser rösterna under Stories.")}</Text>
              </>
            ) : (
              <>
                <PortalField label={tb("Er fråga")} value={interactionDraft.prompt} maxLength={80} onChangeText={(v) => setInteractionDraft({ ...interactionDraft, prompt: v })} />
                <Text style={s.sheetNote}>{tb("Gästerna skriver ett svar i storyn. Ni läser svaren under Stories, utan att se vem som skrivit.")}</Text>
              </>
            )}
            <PrimaryButton label={interactionDraft.id ? tb("Spara") : tb("Lägg till")} onPress={saveInteraction} disabled={!interactionOk} />
          </View>
        )}
      </Sheet>
    </View>
    </ThemeProvider>
  );
}

/** Att skriva: texten mitt på skärmen, typsnitt och färger ovanför tangentbordet */
function TextEditor({ editing, onChange, onSize, onDone }: {
  editing: Editing; onChange: (e: Editing) => void; onSize: (size: number) => void; onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({ paddingBottom: Math.max(keyboard.height.value, insets.bottom) + 10 }));
  const font = FONTS.find((f) => f.id === editing.font) ?? FONTS[0];
  const nextBg: Record<TextBg, TextBg> = { none: "solid", solid: "soft", soft: "none" };
  const solid = editing.bg === "solid";
  const AlignIcon = editing.align === "left" ? AlignLeft : editing.align === "right" ? AlignRight : AlignCenter;
  return (
    <Reanimated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={[StyleSheet.absoluteFill, s.editor]}>
      <SizeSlider value={editing.size} onChange={onSize} top={insets.top + 90} />
      <View style={[s.editorTop, { paddingTop: insets.top + 8 }]}>
        <View style={s.editorTopLeft}>
          <TouchableOpacity
            style={[s.bgBtn, editing.bg !== "none" && { backgroundColor: "#FFFFFF" }]}
            onPress={() => onChange({ ...editing, bg: nextBg[editing.bg] })}
            accessibilityLabel={tb("Bakgrund bakom texten")}
          >
            <Text style={[s.bgBtnText, editing.bg !== "none" && { color: "#111111" }]}>{tb("A")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.alignBtn} onPress={() => onChange({ ...editing, align: NEXT_ALIGN[editing.align] })} accessibilityLabel={tb("Justering")}>
            <AlignIcon size={22} color="#FFFFFF" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={onDone} hitSlop={10}><Text style={s.doneText}>{tb("Klar")}</Text></TouchableOpacity>
      </View>
      <View style={s.editorCenter}>
        <View style={[s.editorBox, solid && { backgroundColor: editing.color }, editing.bg === "soft" && { backgroundColor: "rgba(0,0,0,0.5)" }]}>
          <TextInput
            value={editing.text}
            onChangeText={(text) => onChange({ ...editing, text })}
            autoFocus
            multiline
            maxLength={160}
            placeholder={tb("Skriv något …")}
            placeholderTextColor="rgba(255,255,255,0.5)"
            selectionColor={GOLD}
            style={[
              s.editorInput,
              { fontFamily: font.family, color: solid ? contrastOn(editing.color) : editing.color, textAlign: editing.align },
              textMetrics(editing.font, editing.size),
              font.upper && { textTransform: "uppercase" },
            ]}
          />
        </View>
      </View>
      <Reanimated.View style={[s.editorBottom, lift]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fontRow} keyboardShouldPersistTaps="always">
          {FONTS.map((f) => (
            <TouchableOpacity key={f.id} onPress={() => onChange({ ...editing, font: f.id })} style={[s.fontChip, editing.font === f.id && s.fontChipOn]}>
              <Text style={[s.fontChipText, { fontFamily: f.family }, editing.font === f.id && { color: "#111111" }]}>{tb(f.label)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={s.colorRow}>
          {TEXT_COLORS.map((c) => (
            <TouchableOpacity key={c} onPress={() => onChange({ ...editing, color: c })} style={[s.colorDot, { backgroundColor: c }, editing.color === c && s.colorDotOn]} accessibilityLabel={tb("Färg")} />
          ))}
        </View>
      </Reanimated.View>
    </Reanimated.View>
  );
}

/** En knapp i verktygsraden till höger, med namnet bredvid (som på Instagram) */
function Tool({ label, showLabel, onPress, children }: { label: string; showLabel: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={6} style={s.tool} accessibilityLabel={label} activeOpacity={0.75}>
      {showLabel ? (
        <Reanimated.Text exiting={FadeOut.duration(250)} style={s.toolLabel} numberOfLines={1}>{label}</Reanimated.Text>
      ) : null}
      <View style={s.round}>{children}</View>
    </TouchableOpacity>
  );
}

const SLIDER_H = 220;

/** Textens storlek: dra uppåt för större, nedåt för mindre (lodrätt reglage till vänster, som på Instagram) */
function SizeSlider({ value, onChange, top }: { value: number; onChange: (size: number) => void; top: number }) {
  const fraction = (value - TEXT_SIZE.min) / (TEXT_SIZE.max - TEXT_SIZE.min);
  const set = (y: number) => {
    const f = Math.min(1, Math.max(0, 1 - y / SLIDER_H));
    onChange(Math.round(TEXT_SIZE.min + f * (TEXT_SIZE.max - TEXT_SIZE.min)));
  };
  const gesture = useMemo(() => Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => { runOnJS(set)(e.y); })
    .onUpdate((e) => { runOnJS(set)(e.y); }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [onChange]);
  return (
    <GestureDetector gesture={gesture}>
      <View style={[s.slider, { top }]} hitSlop={{ left: 16, right: 16 }} accessibilityLabel={tb("Storlek")}>
        {/* Spåret smalnar av nedåt, så det syns åt vilket håll texten blir större */}
        <View style={s.sliderTrack} />
        <View style={[s.sliderKnob, { top: (1 - fraction) * SLIDER_H - 11 }]} />
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000", alignItems: "center" },
  doneRoot: { alignItems: "stretch" },
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
  tools: { position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  toolsRight: { gap: 12, alignItems: "flex-end" },
  tool: { flexDirection: "row", alignItems: "center", gap: 8 },
  toolLabel: {
    fontFamily: "Inter_700Bold", fontSize: 12.5, color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 },
  },
  guideV: { position: "absolute", top: 0, bottom: 0, width: 1.5, backgroundColor: "rgba(228,198,122,0.9)" },
  guideH: { position: "absolute", left: 0, right: 0, height: 1.5, backgroundColor: "rgba(228,198,122,0.9)" },
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

  bar: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, paddingRight: 16 },
  filters: { gap: 12, paddingHorizontal: 16 },
  errorFloat: {
    position: "absolute", left: 16, right: 16, textAlign: "center", fontFamily: "Inter_600SemiBold", fontSize: 13,
    color: "#FFFFFF", backgroundColor: "rgba(220,38,38,0.85)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, overflow: "hidden",
  },
  filter: { alignItems: "center", gap: 5, width: THUMB + 6 },
  filterThumb: {
    width: THUMB, height: THUMB, borderRadius: 14, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 2, borderColor: "transparent",
  },
  filterThumbOn: { borderColor: GOLD },
  filterName: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: "rgba(255,255,255,0.55)" },
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
  sheetNote: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18, color: "rgba(245,241,232,0.6)" },
  sheetLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: "rgba(245,241,232,0.55)", marginTop: 4 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badgeBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: "#FFFFFF" },
  badgeBtnText: { fontFamily: "Montserrat_700Bold", fontSize: 13, letterSpacing: 0.6, color: "#111111" },
  emojis: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 6 },
  emojiBtn: { width: "14%", aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  emojiText: { fontSize: 34 },

  editor: { backgroundColor: "rgba(0,0,0,0.72)" },
  editorTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18 },
  editorTopLeft: { flexDirection: "row", gap: 10 },
  alignBtn: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  slider: { position: "absolute", left: 10, width: 28, height: SLIDER_H, alignItems: "center", zIndex: 2 },
  sliderTrack: {
    width: 0, height: SLIDER_H, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: SLIDER_H,
    borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "rgba(255,255,255,0.45)",
  },
  sliderKnob: { position: "absolute", width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" },
  bgBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  bgBtnText: { fontFamily: "Montserrat_700Bold", fontSize: 19, color: "#FFFFFF" },
  doneText: { fontFamily: "Inter_700Bold", fontSize: 17, color: "#FFFFFF" },
  editorCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  editorBox: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, maxWidth: "100%" },
  editorInput: { minWidth: 60, padding: 0 },
  editorBottom: { gap: 12 },
  fontRow: { gap: 8, paddingHorizontal: 16 },
  fontChip: { paddingHorizontal: 14, height: 36, borderRadius: 18, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
  fontChipOn: { backgroundColor: "#FFFFFF" },
  fontChipText: { fontSize: 15, color: "#FFFFFF" },
  colorRow: { flexDirection: "row", justifyContent: "center", gap: 12, paddingHorizontal: 16 },
  colorDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "rgba(255,255,255,0.75)" },
  colorDotOn: { borderWidth: 3.5, borderColor: "#FFFFFF", transform: [{ scale: 1.15 }] },
});
