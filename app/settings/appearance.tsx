/**
 * Inställningar › Utseende: kortdesign som en svepbar rad med ditt eget kort i varje
 * design (valt kort störst, grannarna mindre och mörkare), profilring och underst
 * temat (svepknapp, mörkt förvalt). Ringar tjänas in och säljs aldrig; låsta ringar
 * syns gråa med lås (src/lib/avatarRings.ts). Cirkelns färg ändras på Konto, inte här.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Alert, Dimensions, StyleSheet } from "react-native";
import Animated, {
  Extrapolation, interpolate, runOnJS, useAnimatedRef, useAnimatedScrollHandler,
  useAnimatedStyle, useSharedValue, type SharedValue,
} from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useProfile } from "@/hooks/useProfile";
import { useUpdateProfile } from "@/hooks/useAccount";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { CARD_VARIANTS } from "@/lib/cardVariants";
import { AVATAR_RINGS } from "@/lib/avatarRings";
import { formatDate } from "@/i18n/dates";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { MemberCard, CARD_W } from "@/components/MemberCard";
import { Avatar } from "@/components/profile/Avatar";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const { width: SW } = Dimensions.get("window");
const ITEM_W = Math.round(CARD_W * 0.94);
const GAP = 4;
const STEP = ITEM_W + GAP;
/** Sidopadding så att mittenkortet ligger mitt på skärmen och grannarna tittar fram */
const SIDE = (SW - ITEM_W) / 2;
/** SettingsScreen har 16 px marginal; raden ska gå kant i kant */
const BODY_MARGIN = 16;
/** Grannkorten: så mycket mindre och så mörka de blir */
const SIDE_SCALE = 0.82;
const SIDE_DIM = 0.6;

const RING_AVATAR = 72;
const RING_TILE = 104;

/** Ett kort i raden. Storlek och mörkning följer avståndet till mitten. */
function DesignCard({ index, scrollX, onPress, children }: {
  index: number;
  scrollX: SharedValue<number>;
  onPress: () => void;
  children: (props: { onCardPress: () => void }) => React.ReactNode;
}) {
  const cardStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollX.value - index * STEP) / STEP;
    return { transform: [{ scale: interpolate(distance, [0, 1], [1, SIDE_SCALE], Extrapolation.CLAMP) }] };
  });
  const dimStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollX.value - index * STEP) / STEP;
    return { opacity: interpolate(distance, [0, 1], [0, SIDE_DIM], Extrapolation.CLAMP) };
  });
  return (
    <Animated.View style={[s.cardShadow, cardStyle]}>
      {children({ onCardPress: onPress })}
      <Animated.View style={[s.dim, dimStyle]} pointerEvents="none" />
    </Animated.View>
  );
}

export default function AppearanceSettings() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const st = useThemedStyles(createStyles);
  const { data: profile } = useProfile();
  const avatarUrl = useAvatarUrl();
  const updateProfile = useUpdateProfile();

  const savedIndex = Math.max(0, CARD_VARIANTS.findIndex((v) => v.id === (profile?.card_color ?? CARD_VARIANTS[0].id)));
  const ring = profile?.avatar_ring ?? "none";
  const displayName = profile?.display_name ?? "";
  const circleColor = profile?.circle_color ?? "#2A2A2A";

  const scroller = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(savedIndex * STEP);
  const lastIndex = useSharedValue(savedIndex);
  const [index, setIndex] = useState(savedIndex);
  const positioned = useRef(false);

  // Raden startar på det kort som är valt; profilen kan komma efter första bilden
  useEffect(() => {
    if (!profile || positioned.current) return;
    positioned.current = true;
    setIndex(savedIndex);
    lastIndex.value = savedIndex;
    scrollX.value = savedIndex * STEP;
    scroller.current?.scrollTo({ x: savedIndex * STEP, animated: false });
  }, [profile, savedIndex, scroller, scrollX, lastIndex]);

  const onIndexChange = useCallback((next: number) => {
    Haptics.selectionAsync().catch(() => {});
    setIndex(next);
  }, []);
  // Designen sparas när raden stannat
  const save = useCallback((next: number) => {
    if (CARD_VARIANTS[next].id !== profile?.card_color) updateProfile.mutate({ card_color: CARD_VARIANTS[next].id });
  }, [profile?.card_color, updateProfile]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
      const next = Math.min(CARD_VARIANTS.length - 1, Math.max(0, Math.round(e.contentOffset.x / STEP)));
      if (next !== lastIndex.value) {
        lastIndex.value = next;
        runOnJS(onIndexChange)(next);
      }
    },
    onMomentumEnd: (e) => {
      runOnJS(save)(Math.min(CARD_VARIANTS.length - 1, Math.max(0, Math.round(e.contentOffset.x / STEP))));
    },
    onEndDrag: (e) => {
      // Utan sväng efter släppet kommer ingen momentum-händelse
      if (Math.abs(e.velocity?.x ?? 0) < 0.05) {
        runOnJS(save)(Math.min(CARD_VARIANTS.length - 1, Math.max(0, Math.round(e.contentOffset.x / STEP))));
      }
    },
  });

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

  const current = CARD_VARIANTS[index];

  return (
    <SettingsScreen title={t("appearance.title")}>
      <View>
        <Text style={st.label}>{t("appearance.cardDesign")}</Text>
        <Animated.ScrollView
          ref={scroller}
          horizontal
          style={{ marginHorizontal: -BODY_MARGIN }}
          contentContainerStyle={{ paddingHorizontal: SIDE, paddingVertical: 16, gap: GAP, alignItems: "center" }}
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToOffsets={CARD_VARIANTS.map((_, i) => i * STEP)}
          snapToAlignment="start"
          scrollEventThrottle={16}
          onScroll={scrollHandler}
        >
          {CARD_VARIANTS.map((v, i) => (
            <DesignCard
              key={v.id}
              index={i}
              scrollX={scrollX}
              onPress={() => scroller.current?.scrollTo({ x: i * STEP, animated: true })}
            >
              {({ onCardPress }) => (
                <MemberCard
                  width={ITEM_W}
                  displayName={displayName}
                  isMember
                  disableFlip
                  memberSince={profile?.created_at ? formatDate(profile.created_at, "MMMM yyyy") : null}
                  cardColor={v.id}
                  avatarUrl={avatarUrl}
                  circleColor={circleColor}
                  avatarRing={ring}
                  onBuyPress={() => {}}
                  onCardPress={onCardPress}
                />
              )}
            </DesignCard>
          ))}
        </Animated.ScrollView>

        {/* Namnet på valt kort, mellan två fina guldlinjer */}
        <View style={st.designFooter}>
          <View style={st.rule} />
          <Text style={st.designName}>{(designNames[current.id] ?? current.name).toUpperCase()}</Text>
          <View style={st.rule} />
        </View>
      </View>

      <View>
        <Text style={st.label}>{t("appearance.ring.title")}</Text>
        <View style={st.ringRow}>
          {AVATAR_RINGS.map((r) => {
            const selected = ring === r.id;
            return (
              <TouchableOpacity
                key={r.id}
                style={st.ringItem}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  if (r.unlocked) updateProfile.mutate({ avatar_ring: r.id });
                  else Alert.alert(t("appearance.ring.lockedTitle"), t("appearance.ring.lockedBody"));
                }}
              >
                <View style={st.ringStage}>
                  {/* Mjukt guldsken bakom den valda ringen */}
                  {selected && (
                    <Svg width={RING_TILE + 40} height={RING_TILE + 40} style={st.glow} pointerEvents="none">
                      <Defs>
                        <RadialGradient id="ringGlow" cx="50%" cy="50%" rx="50%" ry="50%">
                          <Stop offset="0" stopColor="#C5A059" stopOpacity="0.32" />
                          <Stop offset="1" stopColor="#C5A059" stopOpacity="0" />
                        </RadialGradient>
                      </Defs>
                      <Rect x={0} y={0} width={RING_TILE + 40} height={RING_TILE + 40} fill="url(#ringGlow)" />
                    </Svg>
                  )}
                  <View style={[st.ringAvatar, !r.unlocked && { opacity: 0.35 }]}>
                    <Avatar size={RING_AVATAR} uri={avatarUrl} name={displayName} color={circleColor} ring={r.id} />
                  </View>
                  {!r.unlocked && (
                    <View style={st.lockBadge}>
                      <Lock size={13} color={colors.text} strokeWidth={2.2} />
                    </View>
                  )}
                </View>
                <Text style={[st.ringName, selected && { color: colors.text }]} numberOfLines={1}>{ringNames[r.id]}</Text>
                <Text style={[st.ringState, selected && { color: colors.goldText }]} numberOfLines={1}>
                  {selected ? t("appearance.ring.selected") : !r.unlocked ? t("appearance.ring.lockedTitle") : " "}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={st.ringHint}>{t("appearance.ring.hint")}</Text>
      </View>

      <View>
        <Text style={st.label}>{t("appearance.theme")}</Text>
        <ThemeSwitch />
      </View>
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  label: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.6, color: c.muted,
    paddingLeft: 6, marginBottom: 10, textTransform: "uppercase",
  },

  designFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 40 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.goldBorder },
  designName: { fontFamily: "Montserrat_700Bold", fontSize: 13, letterSpacing: 3, color: c.goldText },

  // Ringarna ligger direkt mot bakgrunden, utan ruta
  ringRow: { flexDirection: "row", justifyContent: "space-evenly", paddingTop: 4 },
  ringItem: { alignItems: "center", gap: 4, width: RING_TILE },
  ringStage: { width: RING_TILE, height: RING_TILE, alignItems: "center", justifyContent: "center" },
  glow: { position: "absolute", left: -20, top: -20 },
  ringAvatar: { width: RING_AVATAR, height: RING_AVATAR },
  lockBadge: {
    position: "absolute", right: 14, bottom: 12, width: 24, height: 24, borderRadius: 12,
    alignItems: "center", justifyContent: "center", backgroundColor: c.bg, borderWidth: 1, borderColor: c.borderStrong,
  },
  ringName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.muted },
  ringState: { fontFamily: "Inter_500Medium", fontSize: 12, color: c.faint },
  ringHint: {
    fontFamily: "Inter_400Regular", fontSize: 12.5, lineHeight: 18, color: c.faint,
    textAlign: "center", paddingHorizontal: 24, marginTop: 6,
  },
});

// Stilar som inte beror på temat
const s = StyleSheet.create({
  cardShadow: {
    borderRadius: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 6,
  },
  dim: { ...StyleSheet.absoluteFillObject, borderRadius: 16, backgroundColor: "#000" },
});
