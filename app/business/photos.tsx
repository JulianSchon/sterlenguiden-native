/**
 * Bilder och logga. Loggan överst (rund, syns på er sida och i berättelserna). Sedan bilderna i
 * ordning: den första är huvudbilden (syns överst på er sida och i listor). Håll och dra för att
 * ändra ordning, minus för att ta bort (med Ångra), och lägg till flera på en gång.
 *
 * Nya bilder krymps till lagom storlek innan de laddas upp. En borttagen bild tas bort från
 * servern först när Ångra inte längre går.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionSheetIOS, Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from "react-native-draggable-flatlist";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Camera, GripVertical, ImagePlus, Minus, Store } from "lucide-react-native";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { Skeleton } from "@/components/Skeleton";
import { Note, PortalToast, SaveIndicator, SectionHeader, type PortalToastHandle } from "@/components/business/PortalParts";
import { useBusinessPlace, usePlaceAutosave, usePortalPlace } from "@/hooks/useBusiness";
import { pickSquarePhoto, type PhotoSource } from "@/hooks/useAccount";
import { placeImages } from "@/hooks/usePlaces";
import { businessError, removePlaceImages, uploadPlaceImage } from "@/lib/business";
import { pickPhotos, type PickedPhoto } from "@/lib/photos";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const MAX = 10;

interface Item { key: string; url: string | null; local?: string }

const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** Kamera eller bildbiblioteket (systemets egen meny på iPhone) */
function askSource(title: string, extra?: { label: string; destructive?: boolean; onPress: () => void }): Promise<PhotoSource | null> {
  return new Promise((resolve) => {
    const options = ["Välj bilder", "Ta en bild", ...(extra ? [extra.label] : []), "Avbryt"];
    const cancel = options.length - 1;
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { title, options, cancelButtonIndex: cancel, destructiveButtonIndex: extra?.destructive ? 2 : undefined },
        (i) => {
          if (i === 0) resolve("library");
          else if (i === 1) resolve("camera");
          else { if (extra && i === 2) extra.onPress(); resolve(null); }
        },
      );
    } else {
      Alert.alert(title, undefined, [
        { text: "Välj bilder", onPress: () => resolve("library") },
        { text: "Ta en bild", onPress: () => resolve("camera") },
        ...(extra ? [{ text: extra.label, style: extra.destructive ? "destructive" as const : "default" as const, onPress: () => { extra.onPress(); resolve(null); } }] : []),
        { text: "Avbryt", style: "cancel", onPress: () => resolve(null) },
      ]);
    }
  });
}

async function takePhoto(): Promise<PickedPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error("camera_denied");
  const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
  if (result.canceled) return null;
  const a = result.assets[0];
  return { uri: a.uri, width: a.width, height: a.height };
}

export default function BusinessPhotos() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { placeId } = usePortalPlace();
  const { data: place } = useBusinessPlace(placeId);
  const auto = usePlaceAutosave(placeId, 0);
  const toast = useRef<PortalToastHandle>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [logoBusy, setLogoBusy] = useState(false);
  // Borttagna bilder raderas från servern när Ångra inte längre går (eller när man lämnar sidan)
  const doomed = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!place || items) return;
    setItems(placeImages(place.image_url).map((url) => ({ key: url, url })));
    setLogo(place.logo_url);
  }, [place, items]);

  useEffect(() => () => {
    const urls = [...doomed.current.keys()];
    doomed.current.forEach((t) => clearTimeout(t));
    removePlaceImages(urls);
  }, []);

  const saveList = useCallback((list: Item[]) => {
    auto.queue({ image_url: list.map((i) => i.url).filter((u): u is string => !!u) }, true);
  }, [auto]);

  const showError = (e: unknown) => {
    if (e instanceof Error && e.message === "camera_denied") {
      Alert.alert("Kameran är avstängd", "Slå på kameran för Österlenappen i telefonens inställningar.", [
        { text: "Avbryt", style: "cancel" },
        { text: "Öppna inställningar", onPress: () => Linking.openSettings() },
      ]);
    } else {
      toast.current?.show(businessError(e));
    }
  };

  const add = async () => {
    if (!items) return;
    const room = MAX - items.length;
    if (room <= 0) { toast.current?.show(`Högst ${MAX} bilder – ta bort en först`); return; }
    const source = await askSource("Lägg till bilder");
    if (!source) return;
    try {
      const picked = source === "camera" ? [await takePhoto()].filter((p): p is PickedPhoto => !!p) : await pickPhotos(room);
      if (picked.length === 0) return;
      const pending: Item[] = picked.map((p) => ({ key: newKey(), url: null, local: p.uri }));
      let list = [...items, ...pending];
      setItems(list);
      // En i taget, i ordning — varje färdig bild sparas direkt
      for (let i = 0; i < picked.length; i++) {
        try {
          const url = await uploadPlaceImage(placeId, picked[i]);
          list = list.map((it) => (it.key === pending[i].key ? { ...it, url, local: undefined } : it));
        } catch (e) {
          list = list.filter((it) => it.key !== pending[i].key);
          showError(e);
        }
        setItems(list);
        saveList(list);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      showError(e);
    }
  };

  const remove = (item: Item) => {
    if (!items || !item.url) return;
    const before = items;
    const next = items.filter((i) => i.key !== item.key);
    setItems(next);
    saveList(next);
    const url = item.url;
    doomed.current.set(url, setTimeout(() => { doomed.current.delete(url); removePlaceImages([url]); }, 6000));
    toast.current?.show("Bilden borttagen", () => {
      const t = doomed.current.get(url);
      if (t) clearTimeout(t);
      doomed.current.delete(url);
      setItems(before);
      saveList(before);
    });
  };

  const changeLogo = async () => {
    const source = await askSource("Logga", logo ? {
      label: "Ta bort loggan", destructive: true,
      onPress: () => {
        const old = logo;
        setLogo(null);
        auto.queue({ logo_url: null }, true);
        toast.current?.show("Loggan borttagen", () => { setLogo(old); auto.queue({ logo_url: old }, true); });
      },
    } : undefined);
    if (!source) return;
    try {
      const photo = await pickSquarePhoto(source);
      if (!photo) return;
      setLogoBusy(true);
      const url = await uploadPlaceImage(placeId, photo, 600);
      const old = logo;
      setLogo(url);
      auto.queue({ logo_url: url }, true);
      if (old) removePlaceImages([old]);
    } catch (e) {
      showError(e);
    } finally {
      setLogoBusy(false);
    }
  };

  if (!items || logo === undefined) {
    return (
      <SettingsScreen title="Bilder och logga">
        <Skeleton height={110} radius={18} />
        <Skeleton height={86} radius={16} />
        <Skeleton height={86} radius={16} />
      </SettingsScreen>
    );
  }

  const header = (
    <View style={s.headerBlock}>
      <SectionHeader title="Logga" />
      <TouchableOpacity style={s.logoRow} activeOpacity={0.8} onPress={changeLogo} accessibilityRole="button" accessibilityLabel="Byt logga">
        <View style={s.logo}>
          {logoBusy ? <Skeleton width={72} height={72} radius={36} /> : logo ? (
            <ExpoImage source={{ uri: logo }} style={{ width: "100%", height: "100%" }} contentFit="contain" />
          ) : (
            <Store size={28} color={colors.faint} strokeWidth={1.6} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.logoTitle}>{logo ? "Byt logga" : "Lägg till er logga"}</Text>
          <Text style={s.logoSub}>Syns i en rund ram på er sida och i era berättelser.</Text>
        </View>
      </TouchableOpacity>
      <View style={{ height: 26 }} />
      <SectionHeader title={`Bilder · ${items.length} av ${MAX}`} />
      <Note text="Den första är huvudbilden – den syns överst och i listor. Håll i ⋮⋮ och dra för att ändra ordning." />
      <View style={{ height: 12 }} />
    </View>
  );

  const footer = (
    <View style={s.footerBlock}>
      {items.length < MAX && (
        <TouchableOpacity style={s.addBtn} activeOpacity={0.8} onPress={add} accessibilityRole="button">
          <ImagePlus size={20} color={colors.goldText} strokeWidth={2} />
          <Text style={s.addText}>Lägg till bilder</Text>
        </TouchableOpacity>
      )}
      <Note icon={Camera} text="Tips: ljusa bilder i liggande format blir finast. Visa gärna både miljön, maten eller varorna och människorna." />
      {auto.error && <Text style={s.error}>{auto.error}</Text>}
    </View>
  );

  return (
    <>
      <SettingsScreen title="Bilder och logga" right={<SaveIndicator state={auto.state} onRetry={auto.flush} />} fixed>
        <DraggableFlatList
          containerStyle={{ flex: 1 }}
          data={items}
          keyExtractor={(i) => i.key}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: Math.max(insets.bottom, 16) + 40 }}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          activationDistance={8}
          onDragBegin={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})}
          onDragEnd={({ data }) => {
            if (data.map((d) => d.key).join() === items.map((d) => d.key).join()) return;
            setItems(data);
            saveList(data);
          }}
          renderItem={({ item, drag, isActive, getIndex }: RenderItemParams<Item>) => (
            <ScaleDecorator activeScale={1.03}>
              <View style={[s.row, isActive && s.rowActive]}>
                <View style={s.thumb}>
                  {item.url || item.local ? (
                    <ExpoImage source={{ uri: item.url ?? item.local }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
                  ) : null}
                  {!item.url && <View style={[StyleSheet.absoluteFill, s.uploading]}><Skeleton width="100%" height="100%" radius={0} /></View>}
                </View>
                <View style={{ flex: 1 }}>
                  {getIndex() === 0 ? (
                    <Text style={s.mainTag}>Huvudbild</Text>
                  ) : (
                    <Text style={s.rowLabel}>Bild {(getIndex() ?? 0) + 1}</Text>
                  )}
                  {!item.url && <Text style={s.rowSub}>Laddar upp …</Text>}
                </View>
                {item.url && (
                  <TouchableOpacity onPress={() => remove(item)} hitSlop={10} style={s.minus} accessibilityLabel="Ta bort bilden">
                    <Minus size={16} color="#FFFFFF" strokeWidth={3} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onLongPress={drag} delayLongPress={120} hitSlop={12} disabled={!item.url} accessibilityLabel="Dra för att flytta">
                  <GripVertical size={22} color={colors.faint} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            </ScaleDecorator>
          )}
        />
      </SettingsScreen>
      <PortalToast ref={toast} />
    </>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  headerBlock: {},
  logoRow: {
    flexDirection: "row", alignItems: "center", gap: 16, padding: 14, borderRadius: 18,
    backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border,
  },
  logo: {
    width: 72, height: 72, borderRadius: 36, overflow: "hidden", backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong,
  },
  logoTitle: { fontFamily: "Montserrat_600SemiBold", fontSize: 15, color: c.goldText },
  logoSub: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18, color: c.muted, marginTop: 3 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 10, borderRadius: 16, marginBottom: 10,
    backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border,
  },
  rowActive: { borderColor: c.goldBorder, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  thumb: { width: 108, height: 72, borderRadius: 12, overflow: "hidden", backgroundColor: c.fill },
  uploading: { opacity: 0.85 },
  mainTag: {
    alignSelf: "flex-start", fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase",
    color: c.onGold, backgroundColor: c.gold, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, overflow: "hidden",
  },
  rowLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: c.muted },
  rowSub: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: c.faint, marginTop: 4 },
  minus: { width: 26, height: 26, borderRadius: 13, backgroundColor: c.danger, alignItems: "center", justifyContent: "center" },
  footerBlock: { gap: 16, marginTop: 6 },
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 56, borderRadius: 16,
    borderWidth: 1.5, borderStyle: "dashed", borderColor: c.goldBorder, backgroundColor: c.goldSoft,
  },
  addText: { fontFamily: "Inter_700Bold", fontSize: 15, color: c.goldText },
  error: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: c.danger, textAlign: "center" },
});
