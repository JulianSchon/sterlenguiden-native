/**
 * Delarna som inloggningen och onboardingen delar: de stora knapparna, textfälten, rubriken och
 * framstegsbalken överst. Färgerna kommer från temat, så allt fungerar i ljust och mörkt läge.
 */
import { forwardRef, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View, type TextInputProps,
} from "react-native";
import Reanimated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, ArrowRight, type LucideIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { PressableScale } from "@/components/PressableScale";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

/** Sidornas luft mot kanterna */
export const AUTH_GUTTER = 24;

// ── Knappar ──────────────────────────────────────────────────────────────────

/**
 * En stor knapp över hela bredden. primary = guld (stegets huvudknapp), apple = Apples svart/vitt
 * (Apples egna regler för sin knapp), outline = tunn kant. Snurran syns bara medan det man just
 * tryckt på pågår.
 */
export function AuthButton({
  label, onPress, variant = "primary", icon, disabled = false, loading = false,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "apple" | "outline";
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { colors, scheme } = useTheme();
  const look = variant === "primary"
    ? { bg: colors.gold, fg: colors.onGold, border: colors.gold }
    : variant === "apple"
      ? scheme === "dark" ? { bg: "#FFFFFF", fg: "#000000", border: "#FFFFFF" } : { bg: "#000000", fg: "#FFFFFF", border: "#000000" }
      : { bg: colors.bg, fg: colors.text, border: colors.borderStrong };
  return (
    <PressableScale
      scale={0.97}
      disabled={disabled}
      onPress={loading ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      style={[styles.button, { backgroundColor: look.bg, borderColor: look.border }]}
    >
      {loading ? (
        <ActivityIndicator color={look.fg} />
      ) : (
        <>
          {icon}
          <Text style={[styles.buttonText, { color: look.fg }]} numberOfLines={1}>{label}</Text>
        </>
      )}
    </PressableScale>
  );
}

/**
 * Den stora guldknappen (välkomsten, köpsidan): helt rundad, samma guld som medlemskortets baksida,
 * versal text med luft mellan bokstäverna, pilen i en mörk cirkel till höger, och ett ljus som då och
 * då sveper över — som över kortet.
 */
export function GoldButton({
  label, onPress, loading = false,
}: { label: string; onPress: () => void; loading?: boolean }) {
  const [width, setWidth] = useState(0);
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.value = withDelay(900, withRepeat(withSequence(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      withDelay(3800, withTiming(0, { duration: 0 })),
    ), -1));
  }, [sweep]);
  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -120 + sweep.value * (width + 240) }, { skewX: "-20deg" }] }));
  return (
    <PressableScale
      scale={0.97}
      onPress={loading ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: loading }}
      style={styles.gold}
    >
      <View style={StyleSheet.absoluteFill} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <LinearGradient colors={["#E4C67A", "#C9A24E", "#A9812F"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Reanimated.View pointerEvents="none" style={[styles.goldSweep, sweepStyle]}>
          <LinearGradient
            colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.32)", "rgba(255,255,255,0)"]}
            start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill}
          />
        </Reanimated.View>
      </View>
      {loading ? (
        <ActivityIndicator color="#1A1408" />
      ) : (
        <>
          <Text style={styles.goldText} numberOfLines={1}>{label}</Text>
          {/* Pilen i en mörk cirkel längst till höger */}
          <View style={styles.goldArrow}>
            <ArrowRight size={20} color="#F7EBD0" strokeWidth={2.4} />
          </View>
        </>
      )}
    </PressableScale>
  );
}

/** Ett diskret textval under huvudknappen ("Hoppa över", "Inte nu") */
export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} hitSlop={8} style={styles.textButton} accessibilityRole="button">
      <Text style={[styles.textButtonText, { color: colors.muted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Textfält ─────────────────────────────────────────────────────────────────

/** Ett textfält: rundad ruta som får en guldkant när man skriver i den */
export const AuthField = forwardRef<TextInput, TextInputProps & {
  icon?: LucideIcon;
  /** Text före det man skriver, t.ex. "@" */
  prefix?: string;
  /** Innehåll längst till höger (t.ex. Visa/Dölj) */
  right?: ReactNode;
  /** Rött när det man skrivit inte går */
  invalid?: boolean;
}>(function AuthField({ icon: Icon, prefix, right, invalid = false, style, onFocus, onBlur, ...input }, ref) {
  const { colors } = useTheme();
  const s = useThemedStyles(createFieldStyles);
  const [focused, setFocused] = useState(false);
  const border = invalid ? colors.danger : focused ? colors.goldBorder : colors.borderStrong;
  return (
    <View style={[s.field, { borderColor: border }]}>
      {Icon && <Icon size={19} color={focused ? colors.goldText : colors.faint} strokeWidth={1.8} />}
      {prefix && <Text style={s.prefix}>{prefix}</Text>}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.faint}
        selectionColor={colors.gold}
        cursorColor={colors.gold}
        style={[s.input, style]}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        {...input}
      />
      {right}
    </View>
  );
});

const createFieldStyles = (c: ThemeColors) => StyleSheet.create({
  field: {
    flexDirection: "row", alignItems: "center", gap: 10, height: 58, paddingHorizontal: 16,
    borderRadius: 16, borderWidth: 1.5, backgroundColor: c.raised,
  },
  prefix: { fontFamily: "Inter_500Medium", fontSize: 17, color: c.muted, marginRight: -6 },
  input: { flex: 1, height: "100%", fontFamily: "Inter_500Medium", fontSize: 17, color: c.text },
});

// ── Rubrik och meddelanden ───────────────────────────────────────────────────

export function StepTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.titleBlock}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
    </View>
  );
}

/** En rad under fältet: rött när något är fel, grönt när det är bra, annars dämpat */
export function FieldNote({ text, tone = "muted" }: { text: string; tone?: "muted" | "danger" | "success" }) {
  const { colors } = useTheme();
  const color = tone === "danger" ? colors.danger : tone === "success" ? colors.success : colors.muted;
  return <Text style={[styles.note, { color }]}>{text}</Text>;
}

// ── Framstegsbalken ──────────────────────────────────────────────────────────

/**
 * Överst i onboardingen: tillbaka-pilen och en balk som fylls mjukt för varje steg, så man ser att
 * man kommer framåt. Balken flyttas på UI-tråden (translateX i en klippt ram), aldrig genom att
 * ändra bredden.
 */
export function StepBar({ progress, onBack }: { progress: number; onBack: (() => void) | null }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const width = useSharedValue(0);
  const p = useSharedValue(progress);
  useEffect(() => {
    p.value = withTiming(progress, { duration: 520, easing: Easing.out(Easing.cubic) });
  }, [progress, p]);
  const fill = useAnimatedStyle(() => ({ transform: [{ translateX: (p.value - 1) * width.value }] }));

  return (
    <View style={styles.bar}>
      <TouchableOpacity
        onPress={onBack ?? undefined}
        disabled={!onBack}
        style={[styles.back, { backgroundColor: colors.fill, borderColor: colors.borderStrong, opacity: onBack ? 1 : 0 }]}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
      >
        <ArrowLeft size={22} color={colors.text} strokeWidth={2} />
      </TouchableOpacity>
      <View
        style={[styles.track, { backgroundColor: colors.fill }]}
        onLayout={(e) => { width.value = e.nativeEvent.layout.width; }}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      >
        <Reanimated.View style={[StyleSheet.absoluteFill, styles.fill, { backgroundColor: colors.gold }, fill]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56, borderRadius: 16, borderWidth: 1.5,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 18,
  },
  buttonText: { fontFamily: "Inter_600SemiBold", fontSize: 16.5 },
  gold: {
    height: 64, borderRadius: 32, overflow: "hidden",
    flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 64,
  },
  goldArrow: {
    position: "absolute", right: 8, top: 8, width: 48, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center", backgroundColor: "#1A1408",
  },
  goldSweep: { position: "absolute", top: -10, bottom: -10, width: 120 },
  goldText: { fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.6, textTransform: "uppercase", color: "#1A1408" },
  textButton: { alignSelf: "center", paddingVertical: 12, paddingHorizontal: 16 },
  textButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },

  titleBlock: { gap: 10 },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 28, lineHeight: 34, letterSpacing: -0.7 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 23 },
  note: { fontFamily: "Inter_500Medium", fontSize: 13.5, lineHeight: 19 },

  bar: { flexDirection: "row", alignItems: "center", gap: 16, height: 64, paddingHorizontal: 16 },
  back: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { borderRadius: 3 },
});
