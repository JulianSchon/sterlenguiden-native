/**
 * Delarna som Mitt företag-sidorna delar: "Sparat"-markeringen i rubriken, textfälten (med
 * hjälptext, räknare och fel i klartext), valknappar (chips), valkort, segmentkontrollen, rubriker
 * för avsnitt, och ett kort besked nertill med Ångra.
 *
 * Allt tar färger från temat, så sidorna fungerar i både ljust och mörkt läge.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View, type TextInputProps,
} from "react-native";
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { AlertCircle, Check, CircleCheck, type LucideIcon } from "lucide-react-native";
import type { SaveState } from "@/hooks/useBusiness";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const light = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

// ── "Sparat" ────────────────────────────────────────────────────────────────

/** Till höger i rubriken: Sparar… → Sparat (med bock), eller Kunde inte spara (tryck = försök igen) */
export function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry?: () => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const fade = useSharedValue(state === "idle" ? 0 : 1);
  useEffect(() => {
    fade.value = withTiming(state === "idle" ? 0 : 1, { duration: 180 });
  }, [state, fade]);
  const style = useAnimatedStyle(() => ({ opacity: fade.value }));
  if (state === "error") {
    return (
      <TouchableOpacity onPress={onRetry} hitSlop={10} style={s.saveRow} accessibilityRole="button" accessibilityLabel="Försök spara igen">
        <AlertCircle size={15} color={colors.danger} strokeWidth={2.2} />
        <Text style={[s.saveText, { color: colors.danger }]}>Inte sparat</Text>
      </TouchableOpacity>
    );
  }
  return (
    <Reanimated.View style={[s.saveRow, style]} accessibilityLiveRegion="polite">
      {state === "saved" && <Check size={15} color={colors.success} strokeWidth={2.6} />}
      <Text style={[s.saveText, { color: state === "saved" ? colors.success : colors.muted }]}>
        {state === "saved" ? "Sparat" : "Sparar…"}
      </Text>
    </Reanimated.View>
  );
}

// ── Textfält ────────────────────────────────────────────────────────────────

interface PortalFieldProps extends TextInputProps {
  label: string;
  icon?: LucideIcon;
  /** Förklaring under fältet */
  help?: string;
  /** Felet i klartext (ersätter hjälptexten och gör kanten röd) */
  error?: string | null;
  /** Visar "12/160" */
  counter?: number;
  /** Text före och efter det man skriver ("@", "kr") */
  prefix?: string;
  suffix?: string;
  /** Stort fält (rubriker i stegen) */
  big?: boolean;
}

export const PortalField = forwardRef<TextInput, PortalFieldProps>(function PortalField(
  { label, icon: Icon, help, error, counter, prefix, suffix, big = false, multiline, style, onFocus, onBlur, value, ...input },
  ref,
) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const [focused, setFocused] = useState(false);
  const length = typeof value === "string" ? value.length : 0;
  const over = counter != null && length > counter;
  const border = error || over ? colors.danger : focused ? colors.goldBorder : colors.borderStrong;
  return (
    <View style={s.field}>
      <View style={s.labelRow}>
        {Icon && <Icon size={14} color={colors.muted} strokeWidth={1.9} />}
        <Text style={s.label}>{label}</Text>
        {counter != null && (
          <Text style={[s.counter, over && { color: colors.danger }]}>{length}/{counter}</Text>
        )}
      </View>
      <View style={[s.inputBox, big && s.inputBig, multiline && s.inputMulti, { borderColor: border }]}>
        {prefix && <Text style={[s.affix, big && s.affixBig]}>{prefix}</Text>}
        <TextInput
          ref={ref}
          value={value}
          multiline={multiline}
          placeholderTextColor={colors.faint}
          selectionColor={colors.gold}
          cursorColor={colors.gold}
          style={[s.input, !multiline && s.inputSingle, big && s.inputBigText, multiline && s.inputMultiText, style]}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          {...input}
        />
        {suffix && <Text style={[s.affix, big && s.affixBig]}>{suffix}</Text>}
      </View>
      {error ? (
        <Text style={[s.help, { color: colors.danger }]}>{error}</Text>
      ) : help ? (
        <Text style={s.help}>{help}</Text>
      ) : null}
    </View>
  );
});

// ── Val ─────────────────────────────────────────────────────────────────────

/** En valknapp (chip). Vald = guld. */
export function Chip({ label, selected, onPress, icon: Icon, dot }: {
  label: string; selected: boolean; onPress: () => void; icon?: LucideIcon;
  /** En liten färgprick före texten (kategorins färg) */
  dot?: string;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={() => { light(); onPress(); }}
      style={({ pressed }) => [s.chip, selected && s.chipOn, pressed && { opacity: 0.75 }]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {dot && <View style={[s.chipDot, { backgroundColor: dot }]} />}
      {Icon && <Icon size={15} color={selected ? colors.onGold : colors.text} strokeWidth={2} />}
      <Text style={[s.chipText, selected && { color: colors.onGold }]}>{label}</Text>
    </Pressable>
  );
}

/** Ett större val med rubrik och förklaring, och en rund bock när det är valt */
export function ChoiceCard({ title, subtitle, selected, onPress, icon: Icon, tag }: {
  title: string; subtitle?: string; selected: boolean; onPress: () => void; icon?: LucideIcon;
  /** Liten etikett efter rubriken ("Vanligast") */
  tag?: string;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={() => { light(); onPress(); }}
      style={({ pressed }) => [s.choice, selected && s.choiceOn, pressed && { transform: [{ scale: 0.99 }] }]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      {Icon && (
        <View style={[s.choiceIcon, selected && { backgroundColor: colors.goldSoft }]}>
          <Icon size={19} color={selected ? colors.goldText : colors.muted} strokeWidth={1.9} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={s.choiceTitleRow}>
          <Text style={s.choiceTitle}>{title}</Text>
          {tag && <Text style={s.choiceTag}>{tag}</Text>}
        </View>
        {subtitle && <Text style={s.choiceSub}>{subtitle}</Text>}
      </View>
      <View style={[s.radio, selected && s.radioOn]}>
        {selected && <Check size={14} color={colors.onGold} strokeWidth={3} />}
      </View>
    </Pressable>
  );
}

/** Segmentkontroll (temafärger): två–fyra val bredvid varandra */
export function PortalSegmented<T extends string | number>({ options, value, onChange }: {
  options: { id: T; label: string }[]; value: T; onChange: (id: T) => void;
}) {
  const s = useThemedStyles(createStyles);
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  const segW = width > 0 ? (width - 8) / options.length : 0;
  const indicator = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(index * segW, { duration: 220, easing: Easing.out(Easing.cubic) }) }],
  }));
  return (
    <View style={s.seg} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      {segW > 0 && <Reanimated.View style={[s.segThumb, { width: segW }, indicator]} />}
      {options.map((o) => (
        <TouchableOpacity
          key={String(o.id)}
          style={s.segItem}
          activeOpacity={0.7}
          onPress={() => { if (o.id !== value) { Haptics.selectionAsync().catch(() => {}); onChange(o.id); } }}
          accessibilityRole="tab"
          accessibilityState={{ selected: o.id === value }}
        >
          <Text style={[s.segText, o.id === value && s.segTextOn]} numberOfLines={1}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Rubriker och texter ─────────────────────────────────────────────────────

/** Rubrik för ett avsnitt, med ett valfritt tryckbart val till höger */
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const s = useThemedStyles(createStyles);
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionTitle}>{title}</Text>
      {action && onAction && (
        <TouchableOpacity onPress={onAction} hitSlop={10}>
          <Text style={s.sectionAction}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** En lugn förklaring med ikon (gröna bocken när något är klart) */
export function Note({ text, icon: Icon = CircleCheck, tone = "muted" }: { text: string; icon?: LucideIcon; tone?: "muted" | "gold" | "danger" }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const color = tone === "gold" ? colors.goldText : tone === "danger" ? colors.danger : colors.muted;
  return (
    <View style={s.note}>
      <Icon size={15} color={color} strokeWidth={2} style={{ marginTop: 1 }} />
      <Text style={[s.noteText, { color }]}>{text}</Text>
    </View>
  );
}

// ── Kort besked nertill ─────────────────────────────────────────────────────

export interface PortalToastHandle { show: (text: string, undo?: () => void) => void }

/** "Sparat", "Inbjudan skickad", "Bilden borttagen · Ångra" — tonar bort av sig själv */
export const PortalToast = forwardRef<PortalToastHandle>(function PortalToast(_, ref) {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(createStyles);
  const [text, setText] = useState("");
  const undoRef = useRef<(() => void) | null>(null);
  const [hasUndo, setHasUndo] = useState(false);
  const v = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = useCallback(() => {
    v.value = withTiming(0, { duration: 220 });
    undoRef.current = null;
    setTimeout(() => setHasUndo(false), 230);
  }, [v]);
  useImperativeHandle(ref, () => ({
    show: (t: string, undo?: () => void) => {
      setText(t);
      undoRef.current = undo ?? null;
      setHasUndo(!!undo);
      if (timer.current) clearTimeout(timer.current);
      v.value = withTiming(1, { duration: 160 });
      timer.current = setTimeout(hide, undo ? 4500 : 1800);
    },
  }), [v, hide]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 10 }] }));
  return (
    <Reanimated.View style={[s.toast, { bottom: insets.bottom + 20 }, style]} pointerEvents={hasUndo ? "box-none" : "none"}>
      <Check size={15} color="#FFFFFF" strokeWidth={2.6} />
      <Text style={s.toastText}>{text}</Text>
      {hasUndo && (
        <TouchableOpacity
          onPress={() => { const u = undoRef.current; hide(); u?.(); }}
          hitSlop={10}
          accessibilityRole="button"
        >
          <Text style={s.toastUndo}>Ångra</Text>
        </TouchableOpacity>
      )}
    </Reanimated.View>
  );
});

const createStyles = (c: ThemeColors) => StyleSheet.create({
  saveRow: { flexDirection: "row", alignItems: "center", gap: 5, minWidth: 74, justifyContent: "flex-end" },
  saveText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  field: { gap: 7 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 2 },
  label: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 13, color: c.muted },
  counter: { fontFamily: "Inter_500Medium", fontSize: 12, color: c.faint, fontVariant: ["tabular-nums"] },
  inputBox: {
    flexDirection: "row", alignItems: "center", gap: 8, minHeight: 54, paddingHorizontal: 14,
    borderRadius: 14, borderWidth: 1.5, backgroundColor: c.raised,
  },
  inputBig: { minHeight: 64, borderRadius: 16 },
  inputMulti: { alignItems: "flex-start", paddingVertical: 12 },
  // fontSize 16 hindrar iOS från att zooma in vid fokus
  input: { flex: 1, minHeight: 50, fontFamily: "Inter_500Medium", fontSize: 16, color: c.text },
  // En rad: fast höjd utan egen luft, så texten (och platshållaren) står mitt i rutan
  inputSingle: { height: 50, paddingVertical: 0 },
  inputBigText: { fontFamily: "Montserrat_600SemiBold", fontSize: 20, letterSpacing: -0.3 },
  inputMultiText: { minHeight: 120, textAlignVertical: "top", lineHeight: 22, paddingTop: 0 },
  affix: { fontFamily: "Inter_500Medium", fontSize: 16, color: c.muted },
  affixBig: { fontFamily: "Montserrat_600SemiBold", fontSize: 20 },
  help: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18, color: c.muted, paddingLeft: 2 },

  chip: {
    flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 14, height: 40, borderRadius: 20,
    backgroundColor: c.fill, borderWidth: 1, borderColor: c.borderStrong,
  },
  chipOn: { backgroundColor: c.gold, borderColor: c.gold },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.text },

  choice: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 18,
    backgroundColor: c.card, borderWidth: 1.5, borderColor: c.border,
  },
  choiceOn: { borderColor: c.gold, backgroundColor: c.raised },
  choiceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.fill },
  choiceTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  choiceTitle: { fontFamily: "Montserrat_600SemiBold", fontSize: 15.5, letterSpacing: -0.2, color: c.text },
  choiceTag: {
    fontFamily: "Inter_700Bold", fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", color: c.goldText,
    backgroundColor: c.goldSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: "hidden",
  },
  choiceSub: { fontFamily: "Inter_400Regular", fontSize: 13.5, lineHeight: 19, color: c.muted, marginTop: 3 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  radioOn: { backgroundColor: c.gold, borderColor: c.gold },

  seg: { flexDirection: "row", padding: 4, borderRadius: 14, backgroundColor: c.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  segThumb: { position: "absolute", top: 4, bottom: 4, left: 4, borderRadius: 10, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong },
  segItem: { flex: 1, height: 38, alignItems: "center", justifyContent: "center" },
  segText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: c.muted },
  segTextOn: { color: c.text },

  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, marginBottom: 10 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: c.muted },
  sectionAction: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: c.goldText },

  note: { flexDirection: "row", gap: 8, paddingHorizontal: 4 },
  noteText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },

  toast: {
    position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999, backgroundColor: "#1C1C1E",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  toastText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#FFFFFF" },
  toastUndo: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#E8C674", marginLeft: 6 },
});
