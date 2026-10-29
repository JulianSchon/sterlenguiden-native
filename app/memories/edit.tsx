/**
 * Skapa eller redigera ett minne. Utan `id` skapas ett nytt; `placeId` och
 * `title` fyller i formuläret i förväg (används från incheckningens belöning).
 *
 * Sidan scrollar själv så att rutan man skriver i hamnar ovanför tangentbordet, och datumet väljs
 * med telefonens egen datumväljare (på Android en ruta som öppnas; saknas modulen i appbygget
 * skriver man datumet som förut).
 */
import { useEffect, useMemo, useState } from "react";
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Pressable, Alert, Platform, TurboModuleRegistry,
  useWindowDimensions, StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Plus, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { PrimaryButton, useSheetInput } from "@/components/Sheet";
import { PlacePickerSheet } from "@/components/PlacePickerSheet";
import { usePlaces } from "@/hooks/usePlaces";
import { useMemory, useSignedUrls, useCreateMemory, useUpdateMemory } from "@/hooks/useMemories";
import { MAX_MEMORY_PHOTOS, pickPhotos, type PickedPhoto } from "@/lib/photos";
import { isValidDay } from "@/lib/memories";
import { swedishDay } from "@/lib/streak";
import i18n from "i18next";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { Image as ExpoImage } from "expo-image";
import { imageSource } from "@/lib/imageSource";
import { formatDate } from "@/i18n/dates";
import { currentLanguage } from "@/i18n";

/** Telefonens datumväljare finns i appbygget (på Android måste modulen finnas innan den läses in) */
const NATIVE_PICKER = Platform.OS === "ios" || !!TurboModuleRegistry.get("RNCDatePicker");
const picker = NATIVE_PICKER
  ? (require("@react-native-community/datetimepicker") as typeof import("@react-native-community/datetimepicker"))
  : null;
const PICKER_LOCALE = { sv: "sv-SE", en: "en-GB", de: "de-DE" } as const;
const dateOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;


export default function EditMemoryScreen() {
  const { colors, scheme } = useTheme();
  const sheetInput = useSheetInput();
  const today = useMemo(() => new Date(), []);
  const s = useThemedStyles(createStyles);
  const { id, placeId, title: presetTitle } = useLocalSearchParams<{ id?: string; placeId?: string; title?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data: places = [] } = usePlaces();
  const { data: memory } = useMemory(id);
  const create = useCreateMemory();
  const update = useUpdateMemory();

  const [title, setTitle] = useState(presetTitle ?? "");
  const [story, setStory] = useState("");
  const [day, setDay] = useState(swedishDay());
  const [placeIds, setPlaceIds] = useState<number[]>(placeId ? [Number(placeId)] : []);
  const [peopleText, setPeopleText] = useState("");
  const [keptPaths, setKeptPaths] = useState<string[]>([]);
  const [added, setAdded] = useState<PickedPhoto[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Vid redigering: fyll formuläret med minnet, en gång
  useEffect(() => {
    if (!memory || loaded) return;
    setTitle(memory.title);
    setStory(memory.story ?? "");
    setDay(memory.memoryDate);
    setPlaceIds(memory.placeIds);
    setPeopleText(memory.people.join(", "));
    setKeptPaths(memory.photoPaths);
    setLoaded(true);
  }, [memory, loaded]);

  const { data: urls = {} } = useSignedUrls(keptPaths);
  const photoCount = keptPaths.length + added.length;
  const saving = create.isPending || update.isPending;
  const dayOk = isValidDay(day);
  const canSave = title.trim().length > 0 && dayOk && !saving;
  const thumb = (width - 32 - 16) / 3;
  const placesById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);

  async function addPhotos() {
    const picked = await pickPhotos(MAX_MEMORY_PHOTOS - photoCount);
    if (picked.length) setAdded((prev) => [...prev, ...picked]);
  }

  async function save() {
    const input = {
      title,
      story,
      memoryDate: day,
      placeIds,
      people: peopleText.split(",").map((p) => p.trim()).filter(Boolean),
    };
    try {
      if (memory) {
        await update.mutateAsync({ memory, input, keptPaths, newPhotos: added });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        router.back();
      } else {
        const newId = await create.mutateAsync({ input, photos: added });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        router.replace(`/memories/${newId}`);
      }
    } catch {
      Alert.alert(i18n.t("memories.saveFailedTitle"), i18n.t("memories.saveFailedText"));
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.bg }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} accessibilityLabel={i18n.t("memories.back")}>
            <ArrowLeft size={24} color={colors.text} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{i18n.t(id ? "memories.editTitle" : "memories.newTitle")}</Text>
        </View>
      </View>

      {/* Rutan man skriver i hamnar ovanför tangentbordet: scrollytan får tangentbordets höjd som
          luft nertill och scrollar själv dit (iOS), och man drar ner tangentbordet med listan */}
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 16) + 32, gap: 24 }}
      >
          {/* Foton */}
          <View>
            <Text style={s.label}>FOTON · {photoCount} av {MAX_MEMORY_PHOTOS}</Text>
            <View style={s.grid}>
              {keptPaths.map((path) => (
                <PhotoTile
                  key={path}
                  uri={urls[path]}
                  size={thumb}
                  onRemove={() => setKeptPaths((prev) => prev.filter((p) => p !== path))}
                />
              ))}
              {added.map((photo) => (
                <PhotoTile
                  key={photo.uri}
                  uri={photo.uri}
                  size={thumb}
                  onRemove={() => setAdded((prev) => prev.filter((p) => p.uri !== photo.uri))}
                />
              ))}
              {photoCount < MAX_MEMORY_PHOTOS && (
                <TouchableOpacity style={[s.addTile, { width: thumb, height: thumb }]} onPress={addPhotos} accessibilityLabel={i18n.t("memories.addPhotos")}>
                  <Plus size={28} color={colors.goldText} strokeWidth={1.8} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View>
            <Text style={s.label}>{i18n.t("memories.titleLabel")}</Text>
            <TextInput
              style={sheetInput}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
              placeholder={i18n.t("memories.titlePlaceholder")}
              placeholderTextColor={colors.faint}
            />
          </View>

          <View>
            <Text style={s.label}>{i18n.t("memories.date")}</Text>
            {Platform.OS === "ios" && picker ? (
              // iPhones egen: datumet i en knapp som öppnar kalendern
              <View style={s.datePicker}>
                <picker.default
                  value={dayOk ? dateOf(day) : today}
                  mode="date"
                  display="compact"
                  maximumDate={today}
                  locale={PICKER_LOCALE[currentLanguage()]}
                  themeVariant={scheme}
                  accentColor={colors.gold}
                  onChange={(_e, date) => { if (date) setDay(isoOf(date)); }}
                />
              </View>
            ) : picker ? (
              <Pressable
                style={[sheetInput, s.dateRow]}
                onPress={() => picker.DateTimePickerAndroid.open({
                  value: dayOk ? dateOf(day) : today,
                  mode: "date",
                  maximumDate: today,
                  onChange: (event, date) => { if (event.type === "set" && date) setDay(isoOf(date)); },
                })}
              >
                <Text style={s.dateText}>{dayOk ? formatDate(dateOf(day), "d MMMM yyyy") : ""}</Text>
              </Pressable>
            ) : (
              <>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TextInput
                    style={[sheetInput, { flex: 1 }, !dayOk && { borderColor: "#E57373" }]}
                    value={day}
                    onChangeText={setDay}
                    maxLength={10}
                    keyboardType="numbers-and-punctuation"
                    placeholder={i18n.t("memories.datePlaceholder")}
                    placeholderTextColor={colors.faint}
                  />
                  <TouchableOpacity style={s.todayBtn} onPress={() => setDay(swedishDay())}>
                    <Text style={s.todayText}>{i18n.t("memories.today")}</Text>
                  </TouchableOpacity>
                </View>
                {!dayOk && <Text style={s.error}>{i18n.t("memories.dateError")}</Text>}
              </>
            )}
          </View>

          <View>
            <Text style={s.label}>{i18n.t("memories.story")}</Text>
            <TextInput
              style={[sheetInput, { minHeight: 120, textAlignVertical: "top" }]}
              value={story}
              onChangeText={setStory}
              maxLength={3000}
              multiline
              placeholder={i18n.t("memories.storyPlaceholder")}
              placeholderTextColor={colors.faint}
            />
          </View>

          <View>
            <Text style={s.label}>{i18n.t("memories.places")}</Text>
            <View style={s.chips}>
              {placeIds.map((pid) => (
                <View key={pid} style={s.chip}>
                  <Text style={s.chipText} numberOfLines={1}>{placesById.get(pid)?.name ?? i18n.t("memories.place")}</Text>
                  <TouchableOpacity hitSlop={8} onPress={() => setPlaceIds((prev) => prev.filter((p) => p !== pid))}>
                    <X size={14} color={colors.muted} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={s.chipAdd} onPress={() => setPickerOpen(true)}>
                <Plus size={14} color={colors.goldText} strokeWidth={2.5} />
                <Text style={s.chipAddText}>{i18n.t("memories.addPlace")}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View>
            <Text style={s.label}>{i18n.t("memories.whoLabel")}</Text>
            <TextInput
              style={sheetInput}
              value={peopleText}
              onChangeText={setPeopleText}
              placeholder={i18n.t("memories.whoPlaceholder")}
              placeholderTextColor={colors.faint}
            />
          </View>

          <PrimaryButton
            label={i18n.t(saving ? "memories.saving" : "memories.save")}
            onPress={save}
            disabled={!canSave}
            loading={saving}
          />
      </ScrollView>

      <PlacePickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={i18n.t("memories.addPlace")}
        selectedIds={placeIds}
        onPick={(place) => setPlaceIds((prev) => (prev.includes(place.id) ? prev : [...prev, place.id]))}
      />
    </View>
  );
}

function PhotoTile({ uri, size, onRemove }: { uri: string | undefined; size: number; onRemove: () => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <ExpoImage source={imageSource(uri)} style={s.photo} contentFit="cover" />
      ) : (
        <View style={[s.photo, { backgroundColor: colors.fill }]} />
      )}
      <TouchableOpacity style={s.remove} hitSlop={6} onPress={onRemove} accessibilityLabel={i18n.t("memories.removePhoto")}>
        <X size={14} color="#fff" strokeWidth={2.5} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  backBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: c.fill, borderWidth: 1, borderColor: c.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  // Playfair bort, versaler in — samma mönster som Vänner/Mitt Österlen/Listor
  headerTitle: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, color: c.text, textTransform: "uppercase" },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 11.5, letterSpacing: 1.2, color: c.muted, marginBottom: 8 },
  error: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: "#E57373", marginTop: 6 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photo: { width: "100%", height: "100%", borderRadius: 12 },
  remove: {
    position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 12,
    backgroundColor: c.overlay, alignItems: "center", justifyContent: "center",
  },
  addTile: {
    borderRadius: 12, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderStyle: "dashed", borderColor: c.goldBorder,
  },

  datePicker: { alignItems: "flex-start" },
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, minHeight: 50 },
  dateText: { fontFamily: "Inter_500Medium", fontSize: 16, color: c.text },
  todayBtn: {
    paddingHorizontal: 16, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: c.fill, borderWidth: 1, borderColor: c.borderStrong,
  },
  todayText: { fontFamily: "Inter_500Medium", fontSize: 14, color: c.text },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "100%",
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: c.border,
  },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: c.text, flexShrink: 1 },
  chipAdd: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: c.goldBorder,
  },
  chipAddText: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: c.goldText },
});
