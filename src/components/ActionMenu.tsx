/**
 * Appens egen meny i stället för telefonens (ActionSheet/Alert). Den öppnas där man tryckte (under
 * fingret, eller ovanför om den inte får plats), och en fråga som "Ta bort?" visas i samma ruta.
 *
 *   const menu = useActionMenu();
 *   <Pressable onPress={(e) => menu.open(e, { title, items: [...] })} />
 *   {menu.element}
 *
 * Rubriken är en liten grå text överst, så den inte ser ut som ett val. Valen är rader att trycka
 * på; i en fråga är svaren knappar. Ett val med `confirm` frågar först; svaren där kan vara ett
 * eller flera (t.ex. "Bara det här" / "Alla kommande").
 *
 * appAlert(rubrik, text, knappar) tar samma uppgifter som telefonens Alert.alert och visar frågan
 * mitt på skärmen, i appens stil (värden finns en gång i appens rot: ActionMenuHost). Används
 * i stället för Alert, så alla frågor ser likadana ut. Rutan tonas in av Modalen själv:
 * Reanimateds in- och uttoningar startar inte inuti en Modal.
 */
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type AlertButton, type GestureResponderEvent } from "react-native";
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

export interface MenuItem {
  label: string;
  destructive?: boolean;
  onPress?: () => void;
  /** Fråga först, i samma ruta */
  confirm?: Confirm;
}

/** En fråga: rubrik, förklaring, svaren och (om den finns) knappen som avbryter */
export interface Confirm {
  title: string;
  message?: string;
  actions: MenuAction[];
  /** Avbryt-knappens text (förvalt "Avbryt"); null = ingen sådan knapp */
  cancel?: string | null;
  onCancel?: () => void;
}

interface MenuSpec {
  title?: string;
  items: MenuItem[];
}

/** Var menyn ska öppnas: trycket (fingret), en punkt, en höjd (mitt i sidled) eller mitt på skärmen */
type MenuAnchor = GestureResponderEvent | { x: number; y: number } | number | "center";

const WIDTH = 264;
const MARGIN = 14;
const GAP = 10;

/** y = -1: mitt på skärmen */
const pointOf = (a: MenuAnchor): { x: number | null; y: number } =>
  a === "center" ? { x: null, y: -1 }
  : typeof a === "number" ? { x: null, y: a }
  : "nativeEvent" in a ? { x: a.nativeEvent.pageX, y: a.nativeEvent.pageY }
  : a;

export function useActionMenu() {
  const [state, setState] = useState<{ spec: MenuSpec; at: { x: number | null; y: number } } | null>(null);
  const open = useCallback((anchor: MenuAnchor, spec: MenuSpec) => {
    if (spec.items.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setState({ spec, at: pointOf(anchor) });
  }, []);
  const close = useCallback(() => setState(null), []);
  /** Bara en fråga (utan meny först), t.ex. från en knapp */
  const ask = useCallback((anchor: MenuAnchor, confirm: Confirm) => {
    open(anchor, { items: [{ label: "", confirm }] });
  }, [open]);
  const element = <ActionMenu spec={state?.spec ?? null} at={state?.at ?? { x: null, y: 0 }} onClose={close} />;
  return { open, ask, close, element };
}

// ── appAlert: frågor och besked från var som helst i appen ──

let alertState: { spec: MenuSpec; at: { x: number | null; y: number } } | null = null;
const alertListeners = new Set<() => void>();
const setAlert = (next: typeof alertState) => { alertState = next; alertListeners.forEach((l) => l()); };

/**
 * Samma uppgifter som Alert.alert. Knappen med style "cancel" blir Avbryt-knappen (med sin egen
 * text); utan knappar blir det ett besked med OK.
 */
export function appAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const cancel = buttons?.find((b) => b.style === "cancel");
  const actions = (buttons ?? []).filter((b) => b !== cancel).map((b) => ({
    label: b.text ?? "", destructive: b.style === "destructive", onPress: () => b.onPress?.(),
  }));
  // Bara en vanlig knapp (t.ex. "Okej"): den stänger, ingen Avbryt bredvid
  const lone = !cancel && actions.length === 1 && !actions[0].destructive;
  setAlert({
    at: { x: null, y: -1 },
    spec: {
      items: [{
        label: "",
        confirm: lone
          ? { title, message, actions: [], cancel: actions[0].label, onCancel: actions[0].onPress }
          : { title, message, actions, cancel: cancel ? cancel.text ?? null : actions.length ? null : undefined, onCancel: () => cancel?.onPress?.() },
      }],
    },
  });
}

/** Läggs en gång i appens rot och visar det appAlert ber om */
export function ActionMenuHost() {
  const state = useSyncExternalStore((l) => { alertListeners.add(l); return () => { alertListeners.delete(l); }; }, () => alertState);
  return <ActionMenu spec={state?.spec ?? null} at={state?.at ?? { x: null, y: -1 }} onClose={() => setAlert(null)} />;
}

function ActionMenu({ spec, at, onClose }: { spec: MenuSpec | null; at: { x: number | null; y: number }; onClose: () => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [height, setHeight] = useState(0);
  // En meny med bara en fråga börjar direkt på frågan
  const direct = spec?.items.length === 1 && !spec.items[0].label ? spec.items[0].confirm ?? null : null;
  const [asking, setAsking] = useState<MenuItem["confirm"] | null>(null);
  const confirm = direct ?? asking;

  // Ett val körs först när menyn stängts helt: öppnar valet något eget (kameran, bildväljaren, en
  // panel) medan menyn fortfarande tonas bort kan iPhone låsa sig
  const pending = useRef<(() => void) | null>(null);
  const flush = () => { const fn = pending.current; pending.current = null; fn?.(); };
  const close = () => { setAsking(null); setHeight(0); onClose(); };
  const run = (fn: () => void) => {
    pending.current = fn;
    close();
    if (Platform.OS !== "ios") setTimeout(flush, 300);
  };
  const cancel = () => run(confirm?.onCancel ?? (() => {}));

  // Under fingret om den får plats, annars ovanför; i sidled centrerad på fingret, alltid inom skärmen
  const minTop = insets.top + 8;
  const maxTop = winH - insets.bottom - 12 - height;
  const below = at.y + GAP;
  const top = at.y < 0 ? Math.max(minTop, (winH - height) / 2)
    : Math.max(minTop, below <= maxTop ? below : Math.min(maxTop, at.y - GAP - height));
  const left = Math.min(winW - WIDTH - MARGIN, Math.max(MARGIN, (at.x ?? winW / 2) - WIDTH / 2));

  return (
    <Modal visible={!!spec} transparent animationType="fade" onRequestClose={close} onDismiss={flush}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={confirm ? cancel : close} />
      {spec && (
        // Osynlig tills höjden är mätt, så rutan aldrig hoppar till sin plats
        <View
          key={confirm ? "confirm" : "menu"}
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          style={[s.menu, { top, left, width: WIDTH, opacity: height ? 1 : 0 }]}
        >
          {confirm ? (
            <View style={s.confirm}>
              <Text style={s.confirmTitle}>{confirm.title}</Text>
              {confirm.message ? <Text style={s.confirmMessage}>{confirm.message}</Text> : null}
              <View style={s.buttons}>
                {confirm.actions.map((a) => (
                  <Pressable
                    key={a.label}
                    onPress={() => run(a.onPress)}
                    style={({ pressed }) => [s.button, a.destructive ? s.buttonDanger : s.buttonGold, pressed && { opacity: 0.8 }]}
                    accessibilityRole="button"
                  >
                    <Text style={[s.buttonText, a.destructive ? { color: colors.danger } : { color: colors.onGold }]}>{a.label}</Text>
                  </Pressable>
                ))}
                {/* Avbryt (eller OK för ett besked utan val) — inte när frågan bara har egna svar */}
                {confirm.cancel !== null && (
                  <Pressable onPress={cancel} style={({ pressed }) => [s.button, s.buttonQuiet, pressed && { opacity: 0.7 }]} accessibilityRole="button">
                    <Text style={[s.buttonText, { color: colors.text }]}>
                      {confirm.cancel ?? (confirm.actions.length ? i18n.t("common.cancel") : i18n.t("common.ok"))}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          ) : (
            <>
              {spec.title ? <Text style={s.title} numberOfLines={2}>{spec.title}</Text> : null}
              <View style={s.rows}>
                {spec.items.map((item, i) => (
                  <Pressable
                    key={item.label}
                    onPress={() => (item.confirm ? setAsking(item.confirm) : run(item.onPress ?? (() => {})))}
                    style={({ pressed }) => [s.row, i > 0 && s.rowBorder, pressed && { backgroundColor: item.destructive ? `${colors.danger}1F` : colors.fill }]}
                    accessibilityRole="button"
                  >
                    <Text style={[s.rowText, item.destructive && { color: colors.danger }]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
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
  rows: {},
  row: { paddingHorizontal: 18, paddingVertical: 15 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  rowText: { fontFamily: "Inter_600SemiBold", fontSize: 15.5, color: c.text },

  confirm: { padding: 16, gap: 6 },
  confirmTitle: { fontFamily: "Montserrat_700Bold", fontSize: 16, lineHeight: 21, color: c.text, textAlign: "center" },
  confirmMessage: { fontFamily: "Inter_400Regular", fontSize: 13.5, lineHeight: 19, color: c.muted, textAlign: "center" },
  buttons: { gap: 8, marginTop: 10 },
  button: { height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  buttonDanger: { backgroundColor: `${c.danger}1F` },
  buttonGold: { backgroundColor: c.gold },
  buttonQuiet: { backgroundColor: c.fill },
  buttonText: { fontFamily: "Inter_700Bold", fontSize: 15 },
});
