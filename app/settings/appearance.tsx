/**
 * Inställningar › Utseende: kortdesign som en svepbar rad med ditt eget kort i varje
 * design (valt kort störst, grannarna mindre och mörkare), profilring och underst
 * temat (svepknapp, mörkt förvalt). Ringar tjänas in och säljs aldrig; låsta ringar
 * syns gråa med lås (src/lib/avatarRings.ts). Cirkelns färg ändras på Konto, inte här.
 *
 * Sidans färger följer temaknappen medan man sveper (`progress`, 0 = mörkt, 1 = ljust),
 * så bakgrund och text går över i samma takt som knappen. Övergången finns bara här,
 * eftersom det är den enda sida där man ser knappen röra sig.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View, TouchableOpacity, Alert, Dimensions, StyleSheet } from "react-native";
import Animated, {
  Extrapolation, interpolate, runOnJS, useAnimatedRef, useAnimatedScrollHandler,
  useAnimatedStyle, useSharedValue, withSpring, type SharedValue,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Check, Lock } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useProfile } from "@/hooks/useProfile";
import { useUpdateProfile } from "@/hooks/useAccount";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { CARD_VARIANTS } from "@/lib/cardVariants";
import { AVATAR_RINGS, type AvatarRingDef } from "@/lib/avatarRings";
import { formatDate } from "@/i18n/dates";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { MemberCard, CARD_W } from "@/components/MemberCard";
import { Avatar } from "@/components/profile/Avatar";
import { useTheme } from "@/theme/ThemeProvider";
import { useMorphStyle } from "@/theme/morph";

const { width: SW } = Dimensions.get("window");
// Kortet är smalt nog att grannarna, som är mindre, får plats med luft mellan sig
// och tittar fram en bit på var sida
const ITEM_W = Math.round(CARD_W * 0.82);
const STEP = ITEM_W;
/** Sidopadding så att mittenkortet ligger mitt på skärmen; grannarna syns i resten av bredden */
const SIDE = (SW - ITEM_W) / 2;
/** SettingsScreen har 16 px marginal; raden ska gå kant i kant */
const BODY_MARGIN = 16;
/** Grannkorten: så mycket mindre och så mörka de blir */
const SIDE_SCALE = 0.84;
const SIDE_DIM = 0.55;

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
    return {
      zIndex: interpolate(distance, [0, 1], [10, 1], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(distance, [0, 1], [1, SIDE_SCALE], Extrapolation.CLAMP) }],
    };
  });
  const dimStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollX.value - index * STEP) / STEP;
    return { opacity: interpolate(distance, [0, 1], [0, SIDE_DIM], Extrapolation.CLAMP) };
  });
  return (
    <Animated.View style={[st.cardShadow, cardStyle]}>
      {children({ onCardPress: onPress })}
      <Animated.View style={[st.dim, dimStyle]} pointerEvents="none" />
    </Animated.View>
  );
}

/**
 * En ring att välja. Den valda växer med en fjädrande rörelse och får en guldbock,
 * de andra är lite dämpade: bocken ger ett tydligt svar på vad som är valt, och
 * rörelsen visar att det just ändrades.
 */
function RingOption({ def, name, selected, avatarUrl, displayName, circleColor, progress, onPress }: {
  def: AvatarRingDef;
  name: string;
  selected: boolean;
  avatarUrl: string | null;
  displayName: string;
  circleColor: string;
  progress: SharedValue<number>;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const mText = useMorphStyle(progress, "color", "text");
  const mMuted = useMorphStyle(progress, "color", "muted");
  const mFaint = useMorphStyle(progress, "color", "faint");
  const mBadgeBg = useMorphStyle(progress, "backgroundColor", "bg");
  const mBadgeBorder = useMorphStyle(progress, "borderColor", "borderStrong");

  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.value = withSpring(selected ? 1 : 0, { damping: 12, stiffness: 190, mass: 0.7 });
  }, [selected, on]);

  const avatarStyle = useAnimatedStyle(() => ({
    opacity: def.unlocked ? interpolate(on.value, [0, 1], [0.7, 1], Extrapolation.CLAMP) : 0.35,
    transform: [{ scale: 1 + 0.14 * on.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, on.value),
    transform: [{ scale: Math.max(0, on.value) }],
  }));

  return (
    <TouchableOpacity style={st.ringItem} activeOpacity={0.8} onPress={onPress}>
      <View style={st.ringStage}>
        <Animated.View style={[st.ringAvatar, avatarStyle]}>
          <Avatar size={RING_AVATAR} uri={avatarUrl} name={displayName} color={circleColor} ring={def.id} />
        </Animated.View>
        <Animated.View style={[st.checkBadge, checkStyle]}>
          <Check size={14} color="#121212" strokeWidth={3} />
        </Animated.View>
        {!def.unlocked && (
          <Animated.View style={[st.lockBadge, mBadgeBg, mBadgeBorder]}>
            <Lock size={13} color={colors.text} strokeWidth={2.2} />
          </Animated.View>
        )}
      </View>
      <Animated.Text style={[st.ringName, selected ? mText : mMuted]} numberOfLines={1}>{name}</Animated.Text>
      <Animated.Text style={[st.ringState, mFaint]} numberOfLines={1}>{def.unlocked ? " " : t("appearance.ring.lockedTitle")}</Animated.Text>
    </TouchableOpacity>
  );
}

export default function AppearanceSettings() {
  const { t } = useTranslation();
  const { mode } = useTheme();
  const { data: profile } = useProfile();
  const avatarUrl = useAvatarUrl();
  const updateProfile = useUpdateProfile();

  // Följer temaknappen medan man sveper: 0 = mörkt, 1 = ljust
  const progress = useSharedValue(mode === "light" ? 1 : 0);
  const mMuted = useMorphStyle(progress, "color", "muted");
  const mFaint = useMorphStyle(progress, "color", "faint");
  const mGold = useMorphStyle(progress, "color", "goldText");
  const mRule = useMorphStyle(progress, "backgroundColor", "goldBorder");

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
    <SettingsScreen title={t("appearance.title")} morph={progress}>
      <View>
        <Animated.Text style={[st.label, mMuted]}>{t("appearance.cardDesign")}</Animated.Text>
        <Animated.ScrollView
          ref={scroller}
          horizontal
          style={{ marginHorizontal: -BODY_MARGIN }}
          contentContainerStyle={{ paddingHorizontal: SIDE, paddingVertical: 16, alignItems: "center" }}
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
          <Animated.View style={[st.rule, mRule]} />
          <Animated.Text style={[st.designName, mGold]}>{(designNames[current.id] ?? current.name).toUpperCase()}</Animated.Text>
          <Animated.View style={[st.rule, mRule]} />
        </View>
      </View>

      <View>
        <Animated.Text style={[st.label, mMuted]}>{t("appearance.ring.title")}</Animated.Text>
        <View style={st.ringRow}>
          {AVATAR_RINGS.map((r) => (
            <RingOption
              key={r.id}
              def={r}
              name={ringNames[r.id]}
              selected={ring === r.id}
              avatarUrl={avatarUrl}
              displayName={displayName}
              circleColor={circleColor}
              progress={progress}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                if (r.unlocked) updateProfile.mutate({ avatar_ring: r.id });
                else Alert.alert(t("appearance.ring.lockedTitle"), t("appearance.ring.lockedBody"));
              }}
            />
          ))}
        </View>
        <Animated.Text style={[st.ringHint, mFaint]}>{t("appearance.ring.hint")}</Animated.Text>
      </View>

      <View>
        <Animated.Text style={[st.label, mMuted]}>{t("appearance.theme")}</Animated.Text>
        <ThemeSwitch progress={progress} />
      </View>
    </SettingsScreen>
  );
}

// Färgerna sätts av övergången ovan, inte här
const st = StyleSheet.create({
  label: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.6,
    paddingLeft: 6, marginBottom: 10, textTransform: "uppercase",
  },

  cardShadow: {
    borderRadius: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 6,
  },
  dim: { ...StyleSheet.absoluteFillObject, borderRadius: 16, backgroundColor: "#000" },

  designFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 40 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  designName: { fontFamily: "Montserrat_700Bold", fontSize: 13, letterSpacing: 3 },

  // Ringarna ligger direkt mot bakgrunden, utan ruta
  ringRow: { flexDirection: "row", justifyContent: "space-evenly", paddingTop: 4 },
  ringItem: { alignItems: "center", gap: 4, width: RING_TILE },
  ringStage: { width: RING_TILE, height: RING_TILE, alignItems: "center", justifyContent: "center" },
  ringAvatar: { width: RING_AVATAR, height: RING_AVATAR },
  checkBadge: {
    position: "absolute", right: 12, bottom: 10, width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center", backgroundColor: "#E8C674",
  },
  lockBadge: {
    position: "absolute", right: 14, bottom: 12, width: 24, height: 24, borderRadius: 12,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  ringName: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  ringState: { fontFamily: "Inter_500Medium", fontSize: 12 },
  ringHint: {
    fontFamily: "Inter_400Regular", fontSize: 12.5, lineHeight: 18,
    textAlign: "center", paddingHorizontal: 24, marginTop: 6,
  },
});
