/**
 * Från platssidan: dina listor, med en bock för var platsen ligger. Tryck på raden så läggs platsen
 * till eller tas bort (bocken byter direkt, sparandet sker i bakgrunden). Tryck på listans bild så
 * öppnas listan — tillbaka därifrån leder till platsen igen.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { Check } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useLists, useAddPlaceToList, useRemovePlaceFromListByPlace } from "@/hooks/useLists";
import { ListCover } from "./ListCover";
import { Sheet } from "@/components/Sheet";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import i18n from "i18next";

export function SaveToListSheet({
  visible, onClose, placeId, onOpenList,
}: { visible: boolean; onClose: () => void; placeId: number; onOpenList: (listId: string) => void }) {
  const { data: lists = [] } = useLists();
  const { mutateAsync: add } = useAddPlaceToList();
  const { mutateAsync: remove } = useRemovePlaceFromListByPlace();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);

  // Det man tryckt i panelen, tills servern hunnit ikapp (listId → ligger platsen där)
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  // Ett sparande i taget per lista, så snabba tryck (lägg till, ta bort) hamnar i rätt ordning
  const queue = useRef(new Map<string, Promise<unknown>>());
  // Nästa gång panelen öppnas gäller det servern säger (listan kan ha ändrats på listsidan)
  useEffect(() => {
    if (!visible) setPicked({});
  }, [visible]);

  const toggle = useCallback((listId: string, next: boolean) => {
    Haptics.impactAsync(next ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPicked((p) => ({ ...p, [listId]: next }));
    const run = (queue.current.get(listId) ?? Promise.resolve())
      .then(() => (next ? add({ listId, placeId }) : remove({ listId, placeId })))
      .catch(() => {
        // Gick inte att spara: bocken visar det som faktiskt gäller igen
        setPicked((p) => {
          const { [listId]: _, ...rest } = p;
          return rest;
        });
      });
    queue.current.set(listId, run);
  }, [add, remove, placeId]);

  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t("lists.saveSheet.title")}>
      {lists.length === 0 ? (
        <Text style={s.empty}>{i18n.t("lists.saveSheet.empty")}</Text>
      ) : (
        <FlatList
          data={lists}
          keyExtractor={(l) => l.id}
          extraData={picked}
          renderItem={({ item: l }) => {
            const was = l.placeIds.includes(placeId);
            const saved = picked[l.id] ?? was;
            const count = l.placeIds.length + (saved === was ? 0 : saved ? 1 : -1);
            return (
              <Pressable
                style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
                onPress={() => toggle(l.id, !saved)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: saved }}
                accessibilityLabel={l.name}
              >
                <Pressable
                  onPress={() => onOpenList(l.id)}
                  hitSlop={6}
                  style={({ pressed }) => pressed && { opacity: 0.7 }}
                  accessibilityRole="button"
                  accessibilityLabel={i18n.t("lists.saveSheet.open", { name: l.name })}
                >
                  <ListCover coverImageUrl={l.coverImageUrl} images={l.images} size={52} radius={10} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>{l.name}</Text>
                  <Text style={s.sub}>{count === 1 ? i18n.t("lists.placesOne") : i18n.t("lists.placesOther", { count })}</Text>
                </View>
                <View style={[s.check, saved ? { backgroundColor: colors.goldText, borderColor: colors.goldText } : { borderColor: colors.border }]}>
                  {saved && <Check size={16} color={colors.bg} strokeWidth={3} />}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </Sheet>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  empty: { fontFamily: "Inter_400Regular", fontSize: 14, color: c.muted, lineHeight: 21, paddingBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.text },
  sub: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: c.muted, marginTop: 1 },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
