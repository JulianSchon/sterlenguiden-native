/**
 * Inställningar › Utseende: tema (följ systemet / ljust / mörkt) och kortdesign.
 * Cirkelns färg ändras på membercardet, inte här.
 */
import { View, Text, TouchableOpacity, ImageBackground, Dimensions, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Check, Moon, Smartphone, Sun, type LucideIcon } from "lucide-react-native";
import Svg, {
  Defs, LinearGradient as SvgGrad, RadialGradient as SvgRadial,
  Stop, Rect as SvgRect,
} from "react-native-svg";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { CARD_VARIANTS } from "@/lib/cardVariants";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { useTheme, useThemedStyles, type ThemeMode } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const { width: SW } = Dimensions.get("window");
// Två kort per rad: skärmbredd − sidmarginal − kortets inre marginal − mellanrum
const MINI_W = Math.floor((SW - 32 - 32 - 12) / 2);
const MINI_H = Math.round(MINI_W * 0.54);

const THEME_OPTIONS: { mode: ThemeMode; icon: LucideIcon; key: "themeSystem" | "themeLight" | "themeDark" }[] = [
  { mode: "system", icon: Smartphone, key: "themeSystem" },
  { mode: "light", icon: Sun, key: "themeLight" },
  { mode: "dark", icon: Moon, key: "themeDark" },
];

/** Mini-förhandsgranskning av ett kort — bild eller SVG-gradient */
function MiniCard({ variantId, isSelected }: { variantId: string; isSelected: boolean }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const v = CARD_VARIANTS.find((x) => x.id === variantId)!;
  return (
    <View style={[s.miniCard, isSelected && { borderColor: colors.gold, borderWidth: 2 }]}>
      {v.bgImage ? (
        <ImageBackground source={v.bgImage} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <Svg style={StyleSheet.absoluteFill} width={MINI_W} height={MINI_H}>
          <Defs>
            <SvgGrad id={`g_${v.id}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={v.bg} />
              <Stop offset="100%" stopColor={v.bg2} />
            </SvgGrad>
            {v.glow ? (
              <SvgRadial id={`r_${v.id}`} cx="70%" cy="30%" rx="60%" ry="60%">
                <Stop offset="0%" stopColor={v.glow} stopOpacity={1} />
                <Stop offset="100%" stopColor={v.glow} stopOpacity={0} />
              </SvgRadial>
            ) : null}
          </Defs>
          <SvgRect x={0} y={0} width={MINI_W} height={MINI_H} fill={`url(#g_${v.id})`} />
          {v.glow ? <SvgRect x={0} y={0} width={MINI_W} height={MINI_H} fill={`url(#r_${v.id})`} /> : null}
        </Svg>
      )}

      {/* Namnet ligger alltid som vit text med skugga så det syns på alla kort */}
      <View style={{ position: "absolute", bottom: 7, left: 10 }}>
        <Text style={s.miniName}>{v.name.toUpperCase()}</Text>
      </View>

      {isSelected && (
        <View style={s.miniCheck}>
          <Check size={9} color="#000" strokeWidth={3} />
        </View>
      )}
    </View>
  );
}

export default function AppearanceSettings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { colors, mode, setMode } = useTheme();
  const s = useThemedStyles(createStyles);
  const { data: profile } = useProfile();
  const cardColor = profile?.card_color ?? "midnight";

  const saveCardColor = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("profiles").update({ card_color: id }).eq("user_id", user.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });

  return (
    <SettingsScreen title={t("appearance.title")}>
      <View>
        <Text style={s.label}>{t("appearance.theme")}</Text>
        <View style={s.segment}>
          {THEME_OPTIONS.map(({ mode: m, icon: Icon, key }) => {
            const active = mode === m;
            return (
              <TouchableOpacity
                key={m}
                style={[s.segmentItem, active && s.segmentItemActive]}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setMode(m);
                }}
              >
                <Icon size={16} color={active ? colors.onGold : colors.muted} strokeWidth={2} />
                <Text style={[s.segmentText, active && { color: colors.onGold }]}>{t(`appearance.${key}`)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View>
        <Text style={s.label}>{t("appearance.cardDesign")}</Text>
        <View style={s.cardGrid}>
          {CARD_VARIANTS.map((v) => (
            <TouchableOpacity
              key={v.id}
              activeOpacity={0.85}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                saveCardColor.mutate(v.id);
              }}
            >
              <MiniCard variantId={v.id} isSelected={cardColor === v.id} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  label: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.6, color: c.muted,
    paddingLeft: 6, marginBottom: 10, textTransform: "uppercase",
  },
  segment: {
    flexDirection: "row", padding: 4, gap: 4, borderRadius: 16, backgroundColor: c.fill,
  },
  segmentItem: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 11, borderRadius: 12,
  },
  segmentItemActive: { backgroundColor: c.gold },
  segmentText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: c.muted },

  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  miniCard: {
    width: MINI_W, height: MINI_H, borderRadius: 10, overflow: "hidden",
    borderWidth: 1, borderColor: c.borderStrong,
  },
  miniName: {
    fontFamily: "Inter_600SemiBold", fontSize: 9, color: "rgba(255,255,255,0.92)", letterSpacing: 1.4,
    textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  miniCheck: {
    position: "absolute", top: 6, right: 6, width: 16, height: 16, borderRadius: 8,
    backgroundColor: c.gold, alignItems: "center", justifyContent: "center",
  },
});
