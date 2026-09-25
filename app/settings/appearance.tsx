/**
 * Inställningar › Utseende: förhandsvisning av kortet med vald design och ring,
 * tema (mörkt rekommenderas, eller ljust), kortdesign och profilring. Ringar
 * tjänas in och säljs aldrig; låsta ringar syns gråa med lås (src/lib/avatarRings.ts).
 * Cirkelns färg ändras på Konto, inte här.
 */
import { View, Text, TouchableOpacity, ImageBackground, Alert, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Check, Lock, Moon, Sun, type LucideIcon } from "lucide-react-native";
import Svg, {
  Defs, LinearGradient as SvgGrad, RadialGradient as SvgRadial,
  Stop, Rect as SvgRect,
} from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useProfile } from "@/hooks/useProfile";
import { useUpdateProfile } from "@/hooks/useAccount";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { CARD_VARIANTS } from "@/lib/cardVariants";
import { AVATAR_RINGS } from "@/lib/avatarRings";
import { formatDate } from "@/i18n/dates";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { MemberCard, CARD_W } from "@/components/MemberCard";
import { Avatar } from "@/components/profile/Avatar";
import { useTheme, useThemedStyles, type ThemeMode } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const PREVIEW_WIDTH = Math.round(CARD_W * 0.9);
// Två kort per rad: sidans bredd minus mellanrum
const MINI_W = Math.floor((CARD_W - 12) / 2);
const MINI_H = Math.round(MINI_W * 0.54);

// Mörkt först: det är förvalet och det som rekommenderas
const THEME_OPTIONS: { mode: ThemeMode; icon: LucideIcon; key: "themeDark" | "themeLight" }[] = [
  { mode: "dark", icon: Moon, key: "themeDark" },
  { mode: "light", icon: Sun, key: "themeLight" },
];

/** Mini-förhandsgranskning av ett kort — bild eller SVG-gradient */
function MiniCard({ variantId, name, isSelected }: { variantId: string; name: string; isSelected: boolean }) {
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
        <Text style={s.miniName}>{name.toUpperCase()}</Text>
      </View>

      {isSelected && (
        <View style={s.miniCheck}>
          <Check size={9} color={colors.onGold} strokeWidth={3} />
        </View>
      )}
    </View>
  );
}

export default function AppearanceSettings() {
  const { t } = useTranslation();
  const { colors, mode, setMode } = useTheme();
  const s = useThemedStyles(createStyles);
  const { data: profile } = useProfile();
  const avatarUrl = useAvatarUrl();
  const updateProfile = useUpdateProfile();

  const cardColor = profile?.card_color ?? CARD_VARIANTS[0].id;
  const ring = profile?.avatar_ring ?? "none";
  const displayName = profile?.display_name ?? "";
  const circleColor = profile?.circle_color ?? "#2A2A2A";

  const designNames = {
    forest: t("appearance.designs.forest"),
    rapeseed: t("appearance.designs.rapeseed"),
    ocean: t("appearance.designs.ocean"),
    grapes: t("appearance.designs.grapes"),
    obsidian: t("appearance.designs.obsidian"),
    copper: t("appearance.designs.copper"),
    sand: t("appearance.designs.sand"),
  } as Record<string, string>;
  const ringNames = {
    none: t("appearance.ring.none"),
    gold: t("appearance.ring.gold"),
    lightning: t("appearance.ring.lightning"),
  } as Record<string, string>;

  return (
    <SettingsScreen title={t("appearance.title")}>
      {/* Förhandsvisning: visar alltid framsidan med vald design och ring, även utan pass */}
      <View style={s.preview}>
        <MemberCard
          width={PREVIEW_WIDTH}
          displayName={displayName}
          isMember
          disableFlip
          memberSince={profile?.created_at ? formatDate(profile.created_at, "MMMM yyyy") : null}
          cardColor={cardColor}
          avatarUrl={avatarUrl}
          circleColor={circleColor}
          avatarRing={ring}
          onBuyPress={() => {}}
        />
      </View>

      <View>
        <Text style={s.label}>{t("appearance.theme")}</Text>
        <View style={s.themeRow}>
          {THEME_OPTIONS.map(({ mode: m, icon: Icon, key }) => {
            const active = mode === m;
            return (
              <TouchableOpacity
                key={m}
                style={[s.themeTile, active && s.themeTileActive]}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setMode(m);
                }}
              >
                <Icon size={22} color={active ? colors.goldText : colors.muted} strokeWidth={1.7} />
                <Text style={[s.themeText, active && { color: colors.text }]}>{t(`appearance.${key}`)}</Text>
                {m === "dark" && <Text style={s.recommended}>{t("appearance.themeRecommended")}</Text>}
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
                updateProfile.mutate({ card_color: v.id });
              }}
            >
              <MiniCard variantId={v.id} name={designNames[v.id] ?? v.name} isSelected={cardColor === v.id} />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View>
        <Text style={s.label}>{t("appearance.ring.title")}</Text>
        <View style={s.ringRow}>
          {AVATAR_RINGS.map((r) => {
            const selected = ring === r.id;
            return (
              <TouchableOpacity
                key={r.id}
                style={[s.ringTile, selected && s.ringTileActive]}
                activeOpacity={0.85}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  if (r.unlocked) updateProfile.mutate({ avatar_ring: r.id });
                  else Alert.alert(t("appearance.ring.lockedTitle"), t("appearance.ring.lockedBody"));
                }}
              >
                <View style={[s.ringPreview, !r.unlocked && { opacity: 0.35 }]}>
                  <Avatar size={46} uri={avatarUrl} name={displayName} color={circleColor} ring={r.id} />
                </View>
                <Text style={s.ringName} numberOfLines={1}>{ringNames[r.id]}</Text>
                {!r.unlocked && (
                  <View style={s.lock}>
                    <Lock size={11} color={colors.muted} strokeWidth={2.2} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
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
  preview: {
    alignSelf: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 14, elevation: 6,
  },

  themeRow: { flexDirection: "row", gap: 12 },
  themeTile: {
    flex: 1, alignItems: "center", gap: 6, paddingVertical: 18, borderRadius: 18,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  themeTileActive: { borderColor: c.goldBorder, backgroundColor: c.goldSoft },
  themeText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.muted },
  recommended: { fontFamily: "Inter_500Medium", fontSize: 11, color: c.goldText },

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

  ringRow: { flexDirection: "row", gap: 12 },
  ringTile: {
    flex: 1, alignItems: "center", gap: 10, paddingTop: 20, paddingBottom: 14, borderRadius: 18,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  ringTileActive: { borderColor: c.goldBorder, backgroundColor: c.goldSoft },
  ringPreview: { width: 46, height: 46, marginBottom: 2 },
  ringName: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: c.text },
  lock: { position: "absolute", top: 8, right: 8 },
});
