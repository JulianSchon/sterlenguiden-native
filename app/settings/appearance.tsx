/**
 * Inställningar › Utseende: kortdesign som en svepbar rad med ditt eget kort i varje
 * design, profilring och underst temat (svepknapp, mörkt förvalt). Ringar tjänas in
 * och säljs aldrig; låsta ringar syns gråa med lås (src/lib/avatarRings.ts).
 * Cirkelns färg ändras på Konto, inte här.
 */
import { useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, Alert, Dimensions, StyleSheet,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from "react-native";
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
const GAP = 12;
const STEP = ITEM_W + GAP;
/** Sidopadding så att mittenkortet ligger mitt på skärmen och grannarna tittar fram */
const SIDE = (SW - ITEM_W) / 2;
/** SettingsScreen har 16 px marginal; raden ska gå kant i kant */
const BODY_MARGIN = 16;

export default function AppearanceSettings() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { data: profile } = useProfile();
  const avatarUrl = useAvatarUrl();
  const updateProfile = useUpdateProfile();

  const savedIndex = Math.max(0, CARD_VARIANTS.findIndex((v) => v.id === (profile?.card_color ?? CARD_VARIANTS[0].id)));
  const ring = profile?.avatar_ring ?? "none";
  const displayName = profile?.display_name ?? "";
  const circleColor = profile?.circle_color ?? "#2A2A2A";

  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(savedIndex);
  const positioned = useRef(false);

  // Raden startar på det kort som är valt; profilen kan komma efter första bilden
  useEffect(() => {
    if (!profile || positioned.current) return;
    positioned.current = true;
    setIndex(savedIndex);
    scroller.current?.scrollTo({ x: savedIndex * STEP, animated: false });
  }, [profile, savedIndex]);

  const indexAt = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    Math.min(CARD_VARIANTS.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / STEP)));

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = indexAt(e);
    if (next !== index) {
      Haptics.selectionAsync().catch(() => {});
      setIndex(next);
    }
  };

  // Designen sparas när raden stannat
  const onSettled = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = indexAt(e);
    if (CARD_VARIANTS[next].id !== profile?.card_color) updateProfile.mutate({ card_color: CARD_VARIANTS[next].id });
  };

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
        <Text style={s.label}>{t("appearance.cardDesign")}</Text>
        <ScrollView
          ref={scroller}
          horizontal
          style={{ marginHorizontal: -BODY_MARGIN }}
          contentContainerStyle={{ paddingHorizontal: SIDE, paddingVertical: 14, gap: GAP }}
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToOffsets={CARD_VARIANTS.map((_, i) => i * STEP)}
          snapToAlignment="start"
          scrollEventThrottle={16}
          onScroll={onScroll}
          onMomentumScrollEnd={onSettled}
          onScrollEndDrag={(e) => {
            // Utan sväng efter släppet kommer ingen momentum-händelse
            if (Math.abs(e.nativeEvent.velocity?.x ?? 0) < 0.05) onSettled(e);
          }}
        >
          {CARD_VARIANTS.map((v, i) => (
            <View key={v.id} style={s.cardShadow}>
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
                onCardPress={() => scroller.current?.scrollTo({ x: i * STEP, animated: true })}
              />
            </View>
          ))}
        </ScrollView>

        <View style={s.designFooter}>
          <Text style={s.designName}>{designNames[current.id] ?? current.name}</Text>
          <View style={s.dots}>
            {CARD_VARIANTS.map((v, i) => (
              <View key={v.id} style={[s.dot, i === index && s.dotActive]} />
            ))}
          </View>
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
                style={s.ringItem}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  if (r.unlocked) updateProfile.mutate({ avatar_ring: r.id });
                  else Alert.alert(t("appearance.ring.lockedTitle"), t("appearance.ring.lockedBody"));
                }}
              >
                <View style={[s.ringPreview, !r.unlocked && { opacity: 0.35 }]}>
                  <Avatar size={60} uri={avatarUrl} name={displayName} color={circleColor} ring={r.id} />
                </View>
                <View style={s.ringNameRow}>
                  {!r.unlocked && <Lock size={12} color={colors.muted} strokeWidth={2.2} />}
                  <Text style={[s.ringName, selected && { color: colors.goldText }]} numberOfLines={1}>{ringNames[r.id]}</Text>
                </View>
                <View style={[s.selectedDot, selected && { backgroundColor: colors.gold }]} />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View>
        <Text style={s.label}>{t("appearance.theme")}</Text>
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

  cardShadow: {
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 6,
  },
  designFooter: { alignItems: "center", gap: 10 },
  designName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: c.text },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.borderStrong },
  dotActive: { width: 18, backgroundColor: c.gold },

  // Ringarna ligger direkt mot bakgrunden, utan ruta
  ringRow: { flexDirection: "row", justifyContent: "space-evenly", paddingTop: 6 },
  ringItem: { alignItems: "center", gap: 10, paddingVertical: 6, minWidth: 96 },
  ringPreview: { width: 60, height: 60 },
  ringNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  ringName: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: c.muted },
  selectedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "transparent" },
});
