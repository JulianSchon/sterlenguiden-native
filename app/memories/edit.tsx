/**
 * Skapa eller redigera ett minne. Utan `id` skapas ett nytt; `placeId` och
 * `title` fyller i formuläret i förväg (används från incheckningens belöning).
 */
import { useEffect, useMemo, useState } from "react";
import {
  View, Text, Image, ScrollView, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
  useWindowDimensions, StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Plus, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { PrimaryButton, sheetInput } from "@/components/Sheet";
import { PlacePickerSheet } from "@/components/PlacePickerSheet";
import { usePlaces } from "@/hooks/usePlaces";
import { useMemory, useSignedUrls, useCreateMemory, useUpdateMemory } from "@/hooks/useMemories";
import { MAX_MEMORY_PHOTOS, pickPhotos, type PickedPhoto } from "@/lib/photos";
import { isValidDay } from "@/lib/memories";
import { swedishDay } from "@/lib/streak";

const BG = "#121212";
const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";

export default function EditMemoryScreen() {
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
        router.back();
      } else {
        const newId = await create.mutateAsync({ input, photos: added });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        router.replace(`/memories/${newId}` as any);
      }
    } catch {
      Alert.alert("Det gick inte att spara", "Kontrollera anslutningen och försök igen.");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: insets.top, backgroundColor: BG }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{id ? "Redigera minne" : "Nytt minne"}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
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
                <TouchableOpacity style={[s.addTile, { width: thumb, height: thumb }]} onPress={addPhotos}>
                  <Plus size={28} color={GOLD} strokeWidth={1.8} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View>
            <Text style={s.label}>TITEL</Text>
            <TextInput
              style={sheetInput}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
              placeholder="T.ex. Sommardag i Kivik"
              placeholderTextColor="rgba(255,255,255,0.35)"
            />
          </View>

          <View>
            <Text style={s.label}>DATUM</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TextInput
                style={[sheetInput, { flex: 1 }, !dayOk && { borderColor: "#E57373" }]}
                value={day}
                onChangeText={setDay}
                maxLength={10}
                keyboardType="numbers-and-punctuation"
                placeholder="ÅÅÅÅ-MM-DD"
                placeholderTextColor="rgba(255,255,255,0.35)"
              />
              <TouchableOpacity style={s.todayBtn} onPress={() => setDay(swedishDay())}>
                <Text style={s.todayText}>Idag</Text>
              </TouchableOpacity>
            </View>
            {!dayOk && <Text style={s.error}>Skriv datumet som ÅÅÅÅ-MM-DD, till exempel 2026-07-14.</Text>}
          </View>

          <View>
            <Text style={s.label}>BERÄTTA LITE</Text>
            <TextInput
              style={[sheetInput, { minHeight: 120, textAlignVertical: "top" }]}
              value={story}
              onChangeText={setStory}
              maxLength={3000}
              multiline
              placeholder="Vad hände? Vad vill du minnas?"
              placeholderTextColor="rgba(255,255,255,0.35)"
            />
          </View>

          <View>
            <Text style={s.label}>PLATSER</Text>
            <View style={s.chips}>
              {placeIds.map((pid) => (
                <View key={pid} style={s.chip}>
                  <Text style={s.chipText} numberOfLines={1}>{placesById.get(pid)?.name ?? "Plats"}</Text>
                  <TouchableOpacity hitSlop={8} onPress={() => setPlaceIds((prev) => prev.filter((p) => p !== pid))}>
                    <X size={14} color={MUTED} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={s.chipAdd} onPress={() => setPickerOpen(true)}>
                <Plus size={14} color={GOLD} strokeWidth={2.5} />
                <Text style={s.chipAddText}>Lägg till plats</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View>
            <Text style={s.label}>VILKA VAR MED?</Text>
            <TextInput
              style={sheetInput}
              value={peopleText}
              onChangeText={setPeopleText}
              placeholder="Namn, skilda med komma"
              placeholderTextColor="rgba(255,255,255,0.35)"
            />
          </View>

          <PrimaryButton
            label={saving ? "Sparar…" : "Spara minne"}
            onPress={save}
            disabled={!canSave}
            loading={saving}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <PlacePickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Lägg till plats"
        selectedIds={placeIds}
        onPick={(place) => setPlaceIds((prev) => (prev.includes(place.id) ? prev : [...prev, place.id]))}
      />
    </View>
  );
}

function PhotoTile({ uri, size, onRemove }: { uri: string | undefined; size: number; onRemove: () => void }) {
  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image source={{ uri }} style={s.photo} resizeMode="cover" />
      ) : (
        <View style={[s.photo, { backgroundColor: "rgba(255,255,255,0.06)" }]} />
      )}
      <TouchableOpacity style={s.remove} hitSlop={6} onPress={onRemove}>
        <X size={14} color="#fff" strokeWidth={2.5} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  backBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: FG },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 11.5, letterSpacing: 1.2, color: MUTED, marginBottom: 8 },
  error: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: "#E57373", marginTop: 6 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photo: { width: "100%", height: "100%", borderRadius: 12 },
  remove: {
    position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center",
  },
  addTile: {
    borderRadius: 12, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(197,160,89,0.5)",
  },

  todayBtn: {
    paddingHorizontal: 16, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  todayText: { fontFamily: "Inter_500Medium", fontSize: 14, color: FG },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "100%",
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)",
  },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: FG, flexShrink: 1 },
  chipAdd: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: "rgba(197,160,89,0.5)",
  },
  chipAddText: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: GOLD },
});
