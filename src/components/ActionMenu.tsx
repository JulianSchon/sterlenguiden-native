/**
 * Appens egen meny vid en rad: man trycker på ett erbjudande, ett evenemang eller en person och
 * valen visas där man tryckte (under fingret, eller ovanför om de inte får plats).
 *
 *   const menu = useActionMenu();
 *   <Pressable onPress={(e) => menu.open(e, { title, items: [...] })} />
 *   {menu.element}
 *
 * Regeln (Viktors val): appens meny används BARA för sådana val vid en rad. Allt annat är
 * telefonens egna rutor: frågor ("Ta bort?", "Logga ut?"), besked och fel (Alert.alert) och
 * bildvalet (ActionSheet). Ett val med `confirm` frågar därför med telefonens ruta, när menyn
 * stängts; `ask` är samma fråga direkt, utan meny.
 *
 * Rubriken är en liten grå text överst, så den inte ser ut som ett val. Menyn tonas in av Modalen
 * själv: Reanimateds in- och uttoningar startar inte inuti en Modal.
 */
import { useCallback, useRef, useState } from "react";
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import i18n from "i18next";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

interface MenuAction {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

/** En fråga i telefonens ruta: rubrik, förklaring och svaren (Avbryt läggs till) */
export interface Confirm {
  title: string;
  message?: string;
  actions: MenuAction[];
}

export interface MenuItem {
  label: string;
  destructive?: boolean;
  onPress?: () => void;
  /** Fråga först (telefonens ruta) */
  confirm?: Confirm;
}

interface MenuSpec {
  title?: string;
  items: MenuItem[];
}

const WIDTH = 264;
const MARGIN = 14;
const GAP = 10;

/** Telefonens fråga. Utan svar blir det ett besked med OK */
function askNative(c: Confirm) {
  Alert.alert(c.title, c.message, c.actions.length
    ? [
      { text: i18n.t("common.cancel"), style: "cancel" },
      ...c.actions.map((a) => ({ text: a.label, style: a.destructive ? "destructive" as const : "default" as const, onPress: a.onPress })),
    ]
    : undefined);
}

export function useActionMenu() {
  const [state, setState] = useState<{ spec: MenuSpec; x: number; y: number } | null>(null);
  const open = useCallback((e: GestureResponderEvent, spec: MenuSpec) => {
    if (spec.items.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setState({ spec, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
  }, []);
  const close = useCallback(() => setState(null), []);
  /** Bara en fråga, utan meny först */
  const ask = useCallback((confirm: Confirm) => askNative(confirm), []);
  const element = <ActionMenu spec={state?.spec ?? null} x={state?.x ?? 0} y={state?.y ?? 0} onClose={close} />;
  return { open, ask, close, element };
}

function ActionMenu({ spec, x, y, onClose }: { spec: MenuSpec | null; x: number; y: number; onClose: () => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [height, setHeight] = useState(0);

  // Ett val körs först när menyn stängts helt: öppnar valet något eget (telefonens fråga, kameran,
  // en ny sida) medan menyn fortfarande tonas bort kan iPhone låsa sig
  const pending = useRef<(() => void) | null>(null);
  const flush = () => { const fn = pending.current; pending.current = null; fn?.(); };
  const close = () => { setHeight(0); onClose(); };
  const run = (fn: () => void) => {
    pending.current = fn;
    close();
    if (Platform.OS !== "ios") setTimeout(flush, 300);
  };

  // Under fingret om den får plats, annars ovanför; i sidled centrerad på fingret, alltid inom skärmen
  const minTop = insets.top + 8;
  const maxTop = winH - insets.bottom - 12 - height;
  const below = y + GAP;
  const top = Math.max(minTop, below <= maxTop ? below : Math.min(maxTop, y - GAP - height));
  const left = Math.min(winW - WIDTH - MARGIN, Math.max(MARGIN, x - WIDTH / 2));

  return (
    <Modal visible={!!spec} transparent animationType="fade" onRequestClose={close} onDismiss={flush}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={close} />
      {spec && (
        // Osynlig tills höjden är mätt, så rutan aldrig hoppar till sin plats
        <View onLayout={(e) => setHeight(e.nativeEvent.layout.height)} style={[s.menu, { top, left, width: WIDTH, opacity: height ? 1 : 0 }]}>
          {spec.title ? <Text style={s.title} numberOfLines={2}>{spec.title}</Text> : null}
          {spec.items.map((item, i) => (
            <Pressable
              key={item.label}
              onPress={() => run(item.confirm ? () => askNative(item.confirm!) : item.onPress ?? (() => {}))}
              style={({ pressed }) => [s.row, i > 0 && s.rowBorder, pressed && { backgroundColor: item.destructive ? `${colors.danger}1F` : colors.fill }]}
              accessibilityRole="button"
            >
              <Text style={[s.rowText, item.destructive && { color: colors.danger }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Modal>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  menu: {
    position: "absolute", borderRadius: 20, overflow: "hidden",
    backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong,
    shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 26, elevation: 12,
  },
  // Rubriken: liten och grå, mitt över valen, så den inte kan tas för ett val
  title: {
    fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 0.3, color: c.muted, textAlign: "center",
    paddingHorizontal: 16, paddingTop: 13, paddingBottom: 11, backgroundColor: c.fill,
  },
  row: { paddingHorizontal: 18, paddingVertical: 15 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  rowText: { fontFamily: "Inter_600SemiBold", fontSize: 15.5, color: c.text },
});
