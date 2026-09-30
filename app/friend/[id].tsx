/**
 * En persons profil, öppnad från Vänner (sökträff, förfrågan eller vän).
 * Samma hårdkodat mörka stil som resten av Mitt Österlen.
 *
 * Bakgrunden är personens eget Österlenpass-korts FÄRGER (samma två toner som variant.bg/bg2 i
 * cardVariants.ts) — inte själva kortbilden. Bildfilerna är gjorda för det breda, låga kortformatet
 * och har appens logotyp inbakad längst ner till höger, tänkt att skymmas av kortets egen text;
 * sträckt över den här höga, smala heron blev logotypen istället huvudmotivet och såg ut som en
 * söndrig, tudelad bild. Färgerna är säkra att använda i alla format. Namnet står bara en gång,
 * i heron, inte i headern.
 *
 * Innan ni är vänner är statistiken och aktivitetsloggen en igenkännbar men blurrad förhandstitt
 * (expo-blur, redan inbyggt sedan tidigare bygge) — riktiga rader och rutor i rätt form, men med
 * grå platshållarstaplar i stället för siffror, aldrig påhittade tal. "Lägg till vän" ligger ovanpå.
 * Först när relationen är accepterad hämtas och visas den riktiga statistiken (rpc_friend_stats).
 *
 * Profilbilden i ringen är initialer även för vänner — medvetet, se friends-grundens
 * integritetsbeslut. Att visa en väns riktiga foto kräver att den privata bild-mappens
 * åtkomstregler öppnas för vänner, vilket är en egen, medveten säkerhetsändring.
 */
import { useMemo } from "react";
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect as SvgRect } from "react-native-svg";
import {
  ArrowLeft, MapPin, Heart, Sparkles, Ticket, Compass, Flame, UserMinus, UserPlus, Check, X,
} from "lucide-react-native";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Avatar } from "@/components/profile/Avatar";
import { PressableScale } from "@/components/PressableScale";
import {
  useFriendProfile, useFriendStats, useSendFriendRequest, useAcceptFriendRequest, useRemoveFriendship,
  type FriendActivity, type FriendResult, type FriendStats,
} from "@/hooks/useFriends";
import { stickerImageUrl } from "@/hooks/useCollectibles";
import { usePlaces, firstImageUrl } from "@/hooks/usePlaces";
import { computeCategoryStats } from "@/lib/categories";
import { GROUP_INFO } from "@/lib/achievements";
import { TrophyMedal } from "@/components/trophies/TrophyMedal";
import { getVariant, cardColors } from "@/lib/cardVariants";
import { computeStreak, swedishDay } from "@/lib/streak";

const BG    = "#121212";
const FG    = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const CARD  = "#1A1A1D";
const GOLD  = "#C5A059";
const HERO_H = 340;

/** Grå stapel i skelettet — aldrig text, bara form, så den aldrig kan tas för en riktig siffra */
function SkelBar({ w, h }: { w: number; h: number }) {
  return <View style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: "rgba(255,255,255,0.10)" }} />;
}

export default function FriendProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: friend, isLoading: profileLoading } = useFriendProfile(id ?? null);
  const isFriend = friend?.friendStatus === "accepted";
  const { data: stats, isLoading: statsLoading, isError } = useFriendStats(isFriend ? id ?? null : null);
  const { data: places = [] } = usePlaces();
  const send = useSendFriendRequest();
  const accept = useAcceptFriendRequest();
  const remove = useRemoveFriendship();
  const busy = send.isPending || accept.isPending || remove.isPending;

  const who = friend?.displayName || friend?.username || "";
  const streak = useMemo(
    () => (stats ? computeStreak(stats.appDays, swedishDay()) : null),
    [stats],
  );
  const topCategory = useMemo(() => {
    if (!stats) return null;
    const cat = computeCategoryStats(places, stats.visitedPlaceIds)[0];
    return cat && cat.visited > 0 ? cat : null;
  }, [places, stats]);

  // Samma två toner som personens eget Österlenpass-kort — fritt valda oavsett medlemskap, bara
  // kosmetik. Ljusa kort (Sand, Rapsfält) behöver mörk text, annars försvinner den i bakgrunden.
  const variant = friend ? getVariant(friend.cardColor) : null;
  const heroColors = variant ? cardColors(variant) : null;
  const heroFrom = variant?.bg ?? "#171310";
  const heroTo = variant?.bg2 ?? "#0E0B08";
  const heroText = heroColors?.text ?? "#FFFFFF";
  const heroMuted = heroColors?.muted ?? "rgba(255,255,255,0.75)";

  const confirmRemove = () => {
    if (!friend?.friendshipId) return;
    Alert.alert(
      "Ta bort vän?",
      `Du och ${who} kommer inte längre se varandras statistik.`,
      [
        { text: "Avbryt", style: "cancel" },
        { text: "Ta bort", style: "destructive", onPress: () => { remove.mutate(friend.friendshipId!); router.back(); } },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Bakgrund: kortets egna två toner, med en lång, mjuk toning ner mot sidans botten */}
      <View style={[StyleSheet.absoluteFill, { height: HERO_H }]} pointerEvents="none">
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgGrad id="heroBase" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={heroFrom} />
              <Stop offset="100%" stopColor={heroTo} />
            </SvgGrad>
            <SvgGrad id="heroFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor={BG} stopOpacity={0}    />
              <Stop offset="55%"  stopColor={BG} stopOpacity={0.1}  />
              <Stop offset="80%"  stopColor={BG} stopOpacity={0.6}  />
              <Stop offset="100%" stopColor={BG} stopOpacity={1}    />
            </SvgGrad>
          </Defs>
          <SvgRect width="100%" height="100%" fill="url(#heroBase)" />
          <SvgRect width="100%" height="100%" fill="url(#heroFade)" />
        </Svg>
      </View>

      {/* Headern flyter ovanpå bakgrunden — inget namn här, det står bara en gång, i heron */}
      <View style={[s.header, { top: insets.top }]}>
        <TouchableOpacity style={s.headerBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={FG} strokeWidth={2} />
        </TouchableOpacity>
        {isFriend && (
          <TouchableOpacity style={s.headerBtn} onPress={confirmRemove} hitSlop={8}>
            <UserMinus size={19} color={FG} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingBottom: Math.max(insets.bottom, 16) + 24 }, !isFriend && friend && { flexGrow: 1 }]}
      >
        <View style={s.hero}>
          <View>
            <Avatar size={92} uri={null} name={who} color={friend?.circleColor ?? "#2A2A2A"} ring={friend?.avatarRing} />
            {/* Elden ersätter en egen "streak"-ruta: syns bara från 1 dag, en 0 är ingen streak värd att visa.
                Vid 40px är den levande, riktade elden (StreakFlame) för liten och för svajig för att läsas —
                siffran hamnade bakom lågan och rörde sig med den. En liten, stilla pill med ikon + siffra
                bredvid varandra går att läsa direkt i stället. */}
            {!!streak && streak.current >= 1 && (
              <View style={s.streakBadge} pointerEvents="none">
                <Flame size={13} color={GOLD} fill={GOLD} strokeWidth={1.5} />
                <Text style={s.streakBadgeNumber}>{streak.current}</Text>
              </View>
            )}
          </View>
          <Text style={[s.name, { color: heroText }]}>{who}</Text>
          <View style={s.metaRow}>
            {friend?.username && <Text style={[s.meta, { color: heroMuted }]}>@{friend.username}</Text>}
            {friend?.city && (
              <View style={s.metaItem}>
                <MapPin size={12} color={heroMuted} strokeWidth={2} />
                <Text style={[s.meta, { color: heroMuted }]}>{friend.city}</Text>
              </View>
            )}
          </View>
          {friend?.memberSince && (
            <Text style={[s.since, { color: heroMuted }]}>Medlem sedan {format(new Date(friend.memberSince), "MMMM yyyy", { locale: sv })}</Text>
          )}
        </View>

        {profileLoading && <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />}

        {isFriend ? (
          <>
            {statsLoading && <ActivityIndicator color={GOLD} style={{ marginTop: 30 }} />}
            {isError && <Text style={s.errorText}>Kunde inte hämta statistik just nu.</Text>}
            {stats && streak && (
              <RealContent who={who} stats={stats} streak={streak} topCategory={topCategory} totalPlaces={places.length} />
            )}
          </>
        ) : friend ? (
          <LockedContent friend={friend} busy={busy} onAdd={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            send.mutate(friend.userId);
          }} onCancel={() => remove.mutate(friend.friendshipId!)} onDecline={() => remove.mutate(friend.friendshipId!)} onAccept={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            accept.mutate(friend.friendshipId!);
          }} />
        ) : null}
      </ScrollView>
    </View>
  );
}

// ─── Innehåll när ni är vänner: aktivitet, statistik, troféer ────────────────

function RealContent({
  who, stats, streak, topCategory, totalPlaces,
}: {
  who: string; stats: FriendStats; streak: ReturnType<typeof computeStreak>;
  topCategory: ReturnType<typeof computeCategoryStats>[number] | null; totalPlaces: number;
}) {
  return (
    <>
      {stats.activity.length > 0 && (
        <View style={[s.section, { marginTop: 22 }]}>
          <Text style={s.sectionTitle}>Senaste aktivitet</Text>
          <View style={s.card}>
            {stats.activity.map((a, i) => (
              <ActivityRow key={i} who={who} activity={a} bordered={i > 0} />
            ))}
          </View>
        </View>
      )}

      {/* Streaken ligger redan som eld på profilringen ovanför — de tre andra som en rad */}
      <View style={[s.statsRow, { marginTop: 22 }]}>
        <StatTile value={String(stats.visitsTotal)} label={stats.visitsTotal === 1 ? "Besökt plats" : "Besökta platser"} />
        <StatTile icon={<Heart size={16} color={GOLD} strokeWidth={2} />} value={String(stats.favoritesTotal)} label={stats.favoritesTotal === 1 ? "Favorit" : "Favoriter"} />
        <StatTile icon={<Ticket size={16} color={GOLD} strokeWidth={2} />} value={String(stats.stickersTotal)} label="Samlarobjekt" />
      </View>

      {stats.trophies.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Troféer</Text>
          <TrophyRow trophies={stats.trophies} />
        </View>
      )}

      {(topCategory || stats.visitsTotal > 0) && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Statistik</Text>
          <View style={s.card}>
            {topCategory && (
              <View style={[s.statRow, { borderTopWidth: 0 }]}>
                <View style={s.statRowIcon}>
                  <topCategory.Icon size={15} color={GOLD} strokeWidth={2} />
                </View>
                <Text style={s.statRowLabel}>Mest besökta kategori</Text>
                <Text style={s.statRowValue} numberOfLines={1}>{topCategory.label}</Text>
              </View>
            )}
            {totalPlaces > 0 && (
              <View style={[s.statRow, !topCategory && { borderTopWidth: 0 }]}>
                <View style={s.statRowIcon}>
                  <Compass size={15} color={GOLD} strokeWidth={2} />
                </View>
                <Text style={s.statRowLabel}>Utforskat av Österlen</Text>
                <Text style={s.statRowValue}>{stats.visitsTotal} av {totalPlaces}</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </>
  );
}

function TrophyRow({ trophies }: { trophies: FriendStats["trophies"] }) {
  return (
    <View style={s.trophyRow}>
      {trophies.map((t, i) => {
        const info = GROUP_INFO[t.achievementType];
        if (!info) return null;
        return (
          <View key={i} style={s.trophyItem}>
            <TrophyMedal size={52} tier={t.level} Icon={info.Icon} unlocked groupId={t.achievementType} />
            <Text style={s.trophyLabel} numberOfLines={1}>{info.theme}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ActivityRow({ who, activity, bordered }: { who: string; activity: FriendActivity; bordered: boolean }) {
  const date = format(new Date(activity.happenedAt), "HH:mm, d MMM", { locale: sv });
  const text =
    activity.kind === "visit" ? `${who} besökte ${activity.label}` :
    activity.kind === "favorite" ? `${who} lade till ${activity.label} i favoriter` :
    `${who} samlade in ${activity.label}`;

  // Stickerns bild ligger i stickerbucketen (kräver stickerImageUrl); platsens/eventets image_url
  // är redan en öppen adress och används som den är. Saknas en bild visas kategorins egen ikon.
  const photoUri =
    activity.kind === "sticker"
      ? (activity.imagePath ? stickerImageUrl(activity.imagePath) : null)
      : firstImageUrl(activity.imagePath);

  return (
    <View style={[s.activityRow, bordered && s.activityRowBorder]}>
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={s.activityThumb}
          resizeMode={activity.kind === "sticker" ? "contain" : "cover"}
        />
      ) : (
        <View style={s.activityIcon}>
          {activity.kind === "visit" ? <MapPin size={18} color={GOLD} strokeWidth={2} /> : activity.kind === "favorite" ? <Heart size={18} color={GOLD} strokeWidth={2} /> : <Sparkles size={18} color={GOLD} strokeWidth={2} />}
        </View>
      )}
      <View style={s.activityBody}>
        <Text style={s.activityText} numberOfLines={2}>{text}</Text>
        <Text style={s.activityDate}>{date}</Text>
      </View>
    </View>
  );
}

function StatTile({ icon, value, label }: { icon?: React.ReactNode; value: string; label: string }) {
  return (
    <View style={s.statTile}>
      {icon}
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Innehåll innan ni är vänner: en igenkännbar men blurrad förhandstitt ────

const SKELETON_WIDTHS = [128, 96, 150, 110];

function LockedContent({
  friend, busy, onAdd, onCancel, onDecline, onAccept,
}: {
  friend: FriendResult;
  busy: boolean;
  onAdd: () => void; onCancel: () => void; onDecline: () => void; onAccept: () => void;
}) {
  return (
    <View style={s.lockedWrap}>
      {/* Skelettet: samma form som den riktiga statistiken, men aldrig påhittade siffror */}
      <View style={{ flex: 1 }}>
        <View style={[s.section, { marginTop: 22 }]}>
          <View style={s.card}>
            {SKELETON_WIDTHS.map((w, i) => (
              <View key={i} style={[s.activityRow, i > 0 && s.activityRowBorder]}>
                <View style={s.activityIcon} />
                <SkelBar w={w} h={12} />
              </View>
            ))}
          </View>
        </View>
        <View style={s.statsRow}>
          <View style={s.statTile}><SkelBar w={30} h={22} /><SkelBar w={60} h={10} /></View>
          <View style={s.statTile}><SkelBar w={30} h={22} /><SkelBar w={70} h={10} /></View>
        </View>
        <View style={s.statsRow}>
          <View style={s.statTile}><SkelBar w={30} h={22} /><SkelBar w={60} h={10} /></View>
          <View style={s.statTile}><SkelBar w={30} h={22} /><SkelBar w={70} h={10} /></View>
        </View>
      </View>

      <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />

      <View style={s.lockedCard}>
        {friend.friendStatus === "none" && (
          <PressableScale style={s.primaryBtn} disabled={busy} onPress={onAdd}>
            <UserPlus size={17} color="#0B0B0D" strokeWidth={2.2} />
            <Text style={s.primaryBtnText}>Lägg till vän</Text>
          </PressableScale>
        )}
        {friend.friendStatus === "outgoing" && friend.friendshipId && (
          <>
            <Text style={s.actionHint}>Vänförfrågan skickad</Text>
            <PressableScale style={s.ghostBtn} disabled={busy} onPress={onCancel}>
              <Text style={s.ghostBtnText}>Avbryt förfrågan</Text>
            </PressableScale>
          </>
        )}
        {friend.friendStatus === "incoming" && friend.friendshipId && (
          <>
            <Text style={s.actionHint}>Vill bli vän med dig</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <PressableScale style={[s.ghostBtn, { flex: 1 }]} disabled={busy} onPress={onDecline}>
                <X size={16} color={MUTED} strokeWidth={2.2} />
                <Text style={s.ghostBtnText}>Neka</Text>
              </PressableScale>
              <PressableScale style={[s.primaryBtn, { flex: 1 }]} disabled={busy} onPress={onAccept}>
                <Check size={16} color="#0B0B0D" strokeWidth={2.4} />
                <Text style={s.primaryBtnText}>Acceptera</Text>
              </PressableScale>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    position: "absolute", left: 0, right: 0, zIndex: 2,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.30)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },

  hero: { alignItems: "center", paddingTop: 156 },
  streakBadge: {
    position: "absolute", right: -8, bottom: -6,
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 8, height: 24, borderRadius: 12,
    backgroundColor: "#1A1A1D", borderWidth: 1.5, borderColor: BG,
  },
  streakBadgeNumber: { fontFamily: "Inter_700Bold", fontSize: 12.5, color: "#FFFFFF" },
  name: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 24, color: "#FFFFFF", marginTop: 14 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)" },
  since: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, marginTop: 8 },

  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, textAlign: "center", marginTop: 30, paddingHorizontal: 30 },

  statsRow: { flexDirection: "row", gap: 12, marginHorizontal: 16, marginTop: 12 },
  statTile: {
    flex: 1, alignItems: "center", gap: 4, paddingVertical: 18,
    borderRadius: 16, backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 22, color: FG, marginTop: 2 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED },

  section: { marginTop: 26, paddingHorizontal: 16 },
  sectionTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: FG, marginBottom: 12 },
  card: { borderRadius: 16, backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden" },

  activityRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  activityBody: { flex: 1, minHeight: 40, justifyContent: "space-between" },
  activityRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.08)" },
  activityIcon: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: "rgba(197,160,89,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  // Ett riktigt foto (plats/event) fyller rutan; en sticker ligger fri (contain) på samma mörka platta
  activityThumb: { width: 40, height: 40, borderRadius: 10, backgroundColor: CARD },
  activityText: { fontFamily: "Inter_500Medium", fontSize: 14, color: FG, lineHeight: 19 },
  activityDate: { alignSelf: "flex-end", fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED },

  trophyRow: { flexDirection: "row", flexWrap: "wrap", gap: 16, paddingHorizontal: 4 },
  trophyItem: { width: 68, alignItems: "center", gap: 6 },
  trophyLabel: { fontFamily: "Inter_500Medium", fontSize: 10.5, color: MUTED, textAlign: "center" },

  statRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.08)",
  },
  statRowIcon: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(197,160,89,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  statRowLabel: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13.5, color: MUTED },
  statRowValue: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: FG },

  lockedWrap: { flex: 1, marginTop: 6 },
  lockedCard: {
    position: "absolute", left: 16, right: 16, top: "45%", transform: [{ translateY: -60 }],
    padding: 16, borderRadius: 18, gap: 12, alignItems: "stretch",
    backgroundColor: "rgba(26,26,29,0.75)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
  },
  actionHint: { fontFamily: "Inter_500Medium", fontSize: 13, color: FG, textAlign: "center" },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 48, borderRadius: 12, backgroundColor: GOLD,
  },
  primaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#0B0B0D" },
  ghostBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 48, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.20)",
  },
  ghostBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: FG },
});
