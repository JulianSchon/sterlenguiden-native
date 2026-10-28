/**
 * Appens egen meny i stället för telefonens (ActionSheet/Alert): den öppnas vid raden man tryckte
 * på, och en fråga som "Ta bort?" visas i samma ruta i stället för som en ruta mitt på skärmen.
 *
 *   const menu = useActionMenu();
 *   <Pressable onPress={(e) => menu.open(e, { title, items: [...] })} />
 *   {menu.element}
 *
 * Ett val med `confirm` frågar först; svaren där kan vara ett eller flera (t.ex. "Bara det här" /
 * "Alla kommande"). Rutan tonas in av Modalen själv: Reanimateds in- och uttoningar startar inte
 * inuti en Modal, och då syntes bara den mörka bakgrunden.
 */
import { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export interface MenuAction {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

export interface MenuItem {
  label: string;
  destructive?: boolean;
  onPress?: () => void;
  /** Fråga först, i samma ruta */
  confirm?: { title: string; message?: string; actions: MenuAction[] };
}

export interface MenuSpec {
  title?: string;
  items: MenuItem[];
}

const WIDTH = 270;
const MARGIN = 16;

export function useActionMenu() {
  const [state, setState] = useState<{ spec: MenuSpec; y: number } | null>(null);
  const open = useCallback((e: GestureResponderEvent | number, spec: MenuSpec) => {
    if (spec.items.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setState({ spec, y: typeof e === "number" ? e : e.nativeEvent.pageY });
  }, []);
  const close = useCallback(() => setState(null), []);
  /** Bara en fråga (utan meny först), t.ex. från en knapp */
  const ask = useCallback((e: GestureResponderEvent | number, confirm: NonNullable<MenuItem["confirm"]>) => {
    open(e, { items: [{ label: "", confirm }] });
  }, [open]);
  const element = <ActionMenu spec={state?.spec ?? null} y={state?.y ?? 0} onClose={close} />;
  return { open, ask, close, element };
}

function ActionMenu({ spec, y, onClose }: { spec: MenuSpec | null; y: number; onClose: () => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [height, setHeight] = useState(0);
  // En meny med bara en fråga börjar direkt på frågan
  const direct = spec?.items.length === 1 && !spec.items[0].label ? spec.items[0].confirm ?? null : null;
  const [asking, setAsking] = useState<MenuItem["confirm"] | null>(null);
  const confirm = direct ?? asking;

  const close = () => { setAsking(null); setHeight(0); onClose(); };
  const run = (fn: () => void) => { close(); setTimeout(fn, 120); };

  // Under fingret om det får plats, annars ovanför; alltid inom skärmen
  const top = Math.max(insets.top + 8, Math.min(y + 12, winH - insets.bottom - 12 - height));
  const left = Math.max(MARGIN, winW - WIDTH - MARGIN);

  return (
    <Modal visible={!!spec} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={close} />
      {spec && (
        // Osynlig tills höjden är mätt, så rutan aldrig hoppar till sin plats
        <View
          key={confirm ? "confirm" : "menu"}
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          style={[s.menu, { top, left, width: WIDTH, opacity: height ? 1 : 0 }]}
        >
          {confirm ? (
            <>
              <View style={s.head}>
                <Text style={s.title}>{confirm.title}</Text>
                {confirm.message ? <Text style={s.message}>{confirm.message}</Text> : null}
              </View>
              {confirm.actions.map((a) => (
                <Row key={a.label} label={a.label} destructive={a.destructive} onPress={() => run(a.onPress)} />
              ))}
              {/* Utan val är det bara ett besked: då stänger OK */}
              <Row label={confirm.actions.length ? "Avbryt" : "OK"} muted={confirm.actions.length > 0} onPress={close} />
            </>
          ) : (
            <>
              {spec.title ? <View style={s.head}><Text style={s.title} numberOfLines={2}>{spec.title}</Text></View> : null}
              {spec.items.map((item, i) => (
                <Row
                  key={item.label}
                  first={i === 0 && !spec.title}
                  label={item.label}
                  destructive={item.destructive}
                  onPress={() => (item.confirm ? setAsking(item.confirm) : run(item.onPress ?? (() => {})))}
                />
              ))}
            </>
          )}
        </View>
      )}
    </Modal>
  );
}

function Row({ label, destructive, muted, first, onPress }: { label: string; destructive?: boolean; muted?: boolean; first?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, first && { borderTopWidth: 0 }, pressed && { backgroundColor: colors.fill }]} accessibilityRole="button">
      <Text style={[s.rowText, destructive && { color: colors.danger }, muted && { color: colors.muted }]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  menu: {
    position: "absolute", borderRadius: 18, overflow: "hidden",
    backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong,
    shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 24, elevation: 12,
  },
  head: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 4 },
  title: { fontFamily: "Montserrat_600SemiBold", fontSize: 14.5, color: c.text },
  message: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18, color: c.muted },
  row: { paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  rowText: { fontFamily: "Inter_500Medium", fontSize: 15, color: c.text },
});
