/**
 * Platssidans enklare delar: rubrikerna, knappraden (Ring, Hemsida …), "Om platsen" med Läs mer,
 * Praktiskt och kontaktuppgifterna.
 */
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowUpRight, type LucideIcon } from "lucide-react-native";
import type { IconProps } from "@/components/BrandIcons";
import { PressableScale } from "@/components/PressableScale";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "@/theme/categories";

export const GUTTER = 16;

/** En ikon: lucide eller en av varumärkesikonerna (BrandIcons) */
export type IconType = ComponentType<IconProps>;

/** En rubrik och det som hör till den */
export function Section({ title, action, onAction, children }: {
  title: string; action?: string; onAction?: () => void; children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>{title}</Text>
        {action && onAction && (
          <TouchableOpacity onPress={onAction} hitSlop={10}>
            <Text style={[s.sectionAction, { color: colors.goldText }]}>{action}</Text>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}

// ── Knappraden ───────────────────────────────────────────────────────────────

export interface PlaceAction {
  key: string;
  label: string;
  Icon: IconType;
  onPress: () => void;
}

/** Upp till fyra lika breda knappar med ikon och text under: det man oftast vill göra direkt */
export function ActionRow({ actions }: { actions: PlaceAction[] }) {
  const { colors } = useTheme();
  if (actions.length === 0) return null;
  return (
    <View style={s.actions}>
      {actions.slice(0, 4).map(({ key, label, Icon, onPress }) => (
        <PressableScale
          key={key}
          onPress={onPress}
          scale={0.94}
          style={[s.action, { backgroundColor: colors.card, borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Icon size={20} color={colors.text} strokeWidth={2} />
          <Text style={[s.actionLabel, { color: colors.text }]} numberOfLines={1}>{label}</Text>
        </PressableScale>
      ))}
    </View>
  );
}

// ── Om platsen ───────────────────────────────────────────────────────────────

const ABOUT_LINES = 6;
const ABOUT_LINE_H = 23;

/**
 * Platsens beskrivning. Den korta ingressen står överst; den långa texten visar sex rader som
 * tonar ut, och Läs mer fäller ut resten (och ihop igen).
 */
export function AboutText({ lead, body }: { lead: string | null; body: string | null }) {
  const { colors } = useTheme();
  const [fullH, setFullH] = useState(0);
  const [open, setOpen] = useState(false);
  const progress = useSharedValue(0);
  const collapsedH = ABOUT_LINES * ABOUT_LINE_H;
  const long = fullH > collapsedH + ABOUT_LINE_H / 2;

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [open, progress]);
  const clipStyle = useAnimatedStyle(() => ({ height: collapsedH + (fullH - collapsedH) * progress.value }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));

  if (!lead && !body) return null;
  return (
    <View style={{ gap: 12 }}>
      {!!lead && <Text style={[s.lead, { color: colors.text }]}>{lead}</Text>}
      {!!body && (
        <View>
          {/* Hela texten mäts osynligt, så utfällningen vet hur hög den blir */}
          <Text
            style={[s.body, s.measure, { color: colors.muted }]}
            onLayout={(e) => setFullH(e.nativeEvent.layout.height)}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {body}
          </Text>
          <Reanimated.View style={[{ overflow: "hidden" }, long && clipStyle]}>
            <Text style={[s.body, { color: colors.muted }]}>{body}</Text>
            {long && (
              <Reanimated.View style={[s.fade, fadeStyle]} pointerEvents="none">
                <LinearGradient colors={[withAlpha(colors.bg, 0), colors.bg]} style={StyleSheet.absoluteFill} />
              </Reanimated.View>
            )}
          </Reanimated.View>
          {long && (
            <TouchableOpacity onPress={() => setOpen((o) => !o)} hitSlop={10} style={s.more}>
              <Text style={[s.moreText, { color: colors.goldText }]}>{open ? "Visa mindre" : "Läs mer"}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ── Praktiskt ────────────────────────────────────────────────────────────────

/** Det platsen har (barnvänligt, parkering …) i två kolumner — bara det som stämmer */
export function Amenities({ items }: { items: { id: string; label: string; Icon: LucideIcon }[] }) {
  const { colors } = useTheme();
  return (
    <View style={s.amenities}>
      {items.map(({ id, label, Icon }) => (
        <View key={id} style={s.amenity}>
          <View style={[s.amenityIcon, { backgroundColor: colors.fill }]}>
            <Icon size={17} color={colors.text} strokeWidth={2} />
          </View>
          <Text style={[s.amenityLabel, { color: colors.text }]} numberOfLines={1}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Kontakt ──────────────────────────────────────────────────────────────────

export interface ContactRow {
  key: string;
  Icon: IconType;
  /** "Telefon", "Hemsida" … */
  label: string;
  /** Det som står: numret, adressen */
  value: string;
  onPress: () => void;
  /** Långt tryck: kopiera värdet */
  onLongPress?: () => void;
}

export function ContactList({ rows }: { rows: ContactRow[] }) {
  const { colors } = useTheme();
  return (
    <View style={[s.contact, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {rows.map((r, i) => (
        <Pressable
          key={r.key}
          onPress={r.onPress}
          onLongPress={r.onLongPress}
          delayLongPress={350}
          style={({ pressed }) => [s.contactRow, pressed && { backgroundColor: colors.fill }]}
          accessibilityLabel={`${r.label}: ${r.value}`}
        >
          {i > 0 && <View style={[s.contactLine, { backgroundColor: colors.border }]} />}
          <View style={[s.contactIcon, { backgroundColor: colors.fill }]}>
            <r.Icon size={17} color={colors.text} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.contactLabel, { color: colors.muted }]}>{r.label}</Text>
            <Text style={[s.contactValue, { color: colors.text }]} numberOfLines={1}>{r.value}</Text>
          </View>
          <ArrowUpRight size={18} color={colors.faint} strokeWidth={2} />
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginTop: 34, paddingHorizontal: GUTTER },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 },
  sectionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 18, letterSpacing: -0.3 },
  sectionAction: { fontFamily: "Inter_600SemiBold", fontSize: 13.5 },

  actions: { flexDirection: "row", gap: 8, paddingHorizontal: GUTTER, marginTop: 20 },
  action: {
    flex: 1, height: 68, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center", justifyContent: "center", gap: 7,
  },
  actionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12.5 },

  lead: { fontFamily: "Inter_500Medium", fontSize: 16, lineHeight: 24 },
  body: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: ABOUT_LINE_H },
  measure: { position: "absolute", left: 0, right: 0, opacity: 0 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: ABOUT_LINE_H * 2.5 },
  more: { alignSelf: "flex-start", marginTop: 8 },
  moreText: { fontFamily: "Inter_600SemiBold", fontSize: 14.5 },

  amenities: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
  amenity: { width: "50%", flexDirection: "row", alignItems: "center", gap: 11, paddingRight: 8 },
  amenityIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  amenityLabel: { flexShrink: 1, fontFamily: "Inter_500Medium", fontSize: 14.5 },

  contact: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  contactLine: { position: "absolute", top: 0, left: 62, right: 0, height: StyleSheet.hairlineWidth },
  contactIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  contactLabel: { fontFamily: "Inter_500Medium", fontSize: 12 },
  contactValue: { fontFamily: "Inter_600SemiBold", fontSize: 15, marginTop: 1 },
});
