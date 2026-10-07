/**
 * Bottenpanel som listdialogerna delar, plus huvudknappen och textfältens
 * stil. Färgerna kommer från temat.
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  Modal, View, Text, Pressable, TouchableOpacity, KeyboardAvoidingView, ActivityIndicator,
  Platform, StyleSheet, Keyboard, useWindowDimensions,
} from "react-native";
import Reanimated, { LinearTransition, runOnJS, useAnimatedStyle, useSharedValue, withTiming, Easing } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export function Sheet({
  visible, onClose, title, tall = false, centered = false, onShow, children,
}: {
  visible: boolean; onClose: () => void; title: string; tall?: boolean; centered?: boolean;
  /** Körs exakt när modalen är klar (Modals onShow) — bättre än en gissad setTimeout-fördröjning
   * för att t.ex. fokusera ett fält: tangentbordet hinner då glida upp SAMTIDIGT som modalen
   * tonar in i stället för som ett synligt andra steg en stund efter. */
  onShow?: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { height: winH } = useWindowDimensions();

  // Modalens egen animationType="slide" animerar HELA innehållet (bakgrund + ruta) som en enda
  // skjutande yta — bakgrunden såg därför ut att "skickas upp från botten" i stället för att
  // bara tona mörkare på plats. Styr i stället bakgrund och ruta separat: bakgrunden tonar in,
  // rutan glider upp — samma mönster som Lägg till plats-arket redan använder.
  const [mounted, setMounted] = useState(visible);
  const backdrop = useSharedValue(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      backdrop.value = withTiming(1, { duration: 220 });
      progress.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
    } else if (mounted) {
      backdrop.value = withTiming(0, { duration: 180 });
      progress.value = withTiming(0, { duration: 200 }, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
  }, [visible]);

  // Tangentbordet ska stänga SAMTIDIGT som modalen börjar tonas bort, inte snärta undan efteråt
  // (vilket såg ut som att rutan "hackade" tillbaka till mitten när man stängde).
  function handleClose() {
    Keyboard.dismiss();
    onClose();
  }

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const contentStyle = useAnimatedStyle(() =>
    centered
      ? { opacity: progress.value }
      : { transform: [{ translateY: (1 - progress.value) * winH }] }
  );

  return (
    <Modal visible={mounted} transparent animationType="none" onShow={onShow} onRequestClose={handleClose}>
      {/* Bakgrunden ligger som en egen helskärmslager under allt, så den täcker skärmen i båda
          lägena oavsett var innehållet hamnar (nederkant eller mitten). */}
      <Reanimated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Reanimated.View>
      <KeyboardAvoidingView
        style={centered ? s.centerWrap : { flex: 1, justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        pointerEvents="box-none"
      >
        {/* layout animerar höjdändringar mjukt (t.ex. när innehållet byts ut i ett steg-baserat
            formulär) i stället för att rutan hoppar direkt till sin nya storlek. */}
        <Reanimated.View
          layout={LinearTransition.duration(220)}
          style={[
            centered ? s.centerSheet : s.sheet,
            tall && !centered && { height: "85%" },
            !centered && { paddingBottom: insets.bottom + 16 },
            contentStyle,
          ]}
        >
          <View style={s.head}>
            <Text style={s.title}>{title}</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={12}>
              <X size={22} color={colors.muted} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          {children}
        </Reanimated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function PrimaryButton({
  label, onPress, disabled = false, loading = false,
}: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <TouchableOpacity
      style={[s.button, (disabled || loading) && { opacity: 0.4 }]}
      activeOpacity={0.8}
      disabled={disabled || loading}
      onPress={onPress}
    >
      {loading ? <ActivityIndicator color={colors.onGold} /> : <Text style={s.buttonText}>{label}</Text>}
    </TouchableOpacity>
  );
}

/** Ghost-knapp för ett sekundärt steg (t.ex. "Klar" på ett delval, inte huvudhandlingen i
 * popupen) — helt guldfylld såg fel ut för något som inte är huvudknappen. */
export function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const s = useThemedStyles(createStyles);
  return (
    <TouchableOpacity style={s.secondaryButton} activeOpacity={0.8} onPress={onPress}>
      <Text style={s.secondaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Textfältens stil i paneler. fontSize 16 hindrar iOS från att zooma in vid fokus. */
export function useSheetInput() {
  const { colors } = useTheme();
  return {
    fontFamily: "Inter_400Regular", fontSize: 16, color: colors.text,
    backgroundColor: colors.raised, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.borderStrong,
  } as const;
}

/** Mörk variant för sidor som inte fått tema än (minnesformuläret). Byts mot useSheetInput när sidan migreras. */
export const sheetInput = {
  fontFamily: "Inter_400Regular", fontSize: 16, color: "#F5F1E8",
  backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12,
  paddingHorizontal: 14, paddingVertical: 12,
  borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
} as const;

const createStyles = (c: ThemeColors) => StyleSheet.create({
  sheet: {
    backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 20,
  },
  // Poppar upp i mitten i stället för att åka upp från botten — Ny lista/Gå med i lista
  centerWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  centerSheet: {
    width: "100%", maxWidth: 420,
    backgroundColor: c.card, borderRadius: 24, padding: 20,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  // Playfair bort — bara för personnamn i appen numera
  title: { fontFamily: "Montserrat_700Bold", fontSize: 18, letterSpacing: -0.2, color: c.text },
  button: { backgroundColor: c.gold, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  buttonText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: c.onGold },
  secondaryButton: {
    backgroundColor: c.raised, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 8,
    borderWidth: 1, borderColor: c.borderStrong,
  },
  secondaryButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: c.text },
});
