/**
 * En persons profil, öppnad från Vänner (sökträff, förfrågan eller vän).
 * Samma hårdkodat mörka stil som resten av Mitt Österlen.
 *
 * Bakgrunden är personens eget Österlenpass-kort (samma bild som på MemberCard) — det är
 * offentligt kosmetiskt, inte känsligt, så det visas även innan ni är vänner. Namnet står bara en
 * gång, i heron, inte i headern.
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
import { Canvas, Rect, LinearGradient, vec } from "@shopify/react-native-skia";
import { ArrowLeft, MapPin, Heart, Sparkles, Flame, Ticket, UserMinus, UserPlus, Check, X } from "lucide-react-native";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Avatar } from "@/components/profile/Avatar";
import { PressableScale } from "@/components/PressableScale";
import {
  useFriendProfile, useFriendStats, useSendFriendRequest, useAcceptFriendRequest, useRemoveFriendship,
  type FriendActivity, type FriendResult, type FriendStats,
} from "@/hooks/useFriends";
import { stickerImageUrl } from "@/hooks/useCollectibles";
import { getVariant, cardColors } from "@/lib/cardVariants";
import { computeStreak, swedishDay } from "@/lib/streak";

const BG    = "#121212";
const FG    = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const CARD  = "#1A1A1D";
const GOLD  = "#C5A059";
const HERO_H = 300;

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
  const send = useSendFriendRequest();
  const accept = useAcceptFriendRequest();
  const remove = useRemoveFriendship();
  const busy = send.isPending || accept.isPending || remove.isPending;

  const who = friend?.displayName || friend?.username || "";
  const streak = useMemo(
    () => (stats ? computeStreak(stats.appDays, swedishDay()) : null),
    [stats],
  );

  // Samma kortdesign som personens eget Österlenpass — bara kosmetik, aldrig känsligt.
  // Ljusa kort (Sand, Rapsfält) behöver mörk text, annars försvinner den i bilden.
  const variant = friend?.isMember ? getVariant(friend.cardColor) : null;
  const heroColors = variant ? cardColors(variant) : null;
  const heroBg = variant?.bg ?? "#171310";
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
      {/* Bakgrund: kortets egen bild (eller en tyst mörk ton utan pass), med en toning ner mot sidans botten */}
      <View style={[StyleSheet.absoluteFill, { height: HERO_H, backgroundColor: heroBg }]} pointerEvents="none">
        {variant?.bgImage && (
          <Image source={variant.bgImage} style={StyleSheet.absoluteFill} resizeMode="cover" />
        )}
        <Canvas style={StyleSheet.absoluteFill}>
          <Rect x={0} y={0} width={2000} height={HERO_H}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, HERO_H)}
              colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.35)", BG]}
              positions={[0, 0.55, 1]}
            />
          </Rect>
        </Canvas>
      </View>

      {/* Headern flyter ovanpå bilden — inget namn här, det står bara en gång, i heron */}
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}>
        <View style={s.hero}>
          <Avatar size={92} uri={null} name={who} color={friend?.circleColor ?? "#2A2A2A"} ring={friend?.avatarRing} />
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
            {stats && streak && <RealContent who={who} stats={stats} streak={streak} />}
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

// ─── Innehåll när ni är vänner: riktig statistik och aktivitetslogg ──────────

function RealContent({ who, stats, streak }: { who: string; stats: FriendStats; streak: ReturnType<typeof computeStreak> }) {
  return (
    <>
      <View style={s.statsRow}>
        <StatTile icon={<Flame size={18} color={GOLD} strokeWidth={2} />} value={String(streak.current)} label={streak.current === 1 ? "Dags streak" : "Dagars streak"} />
        <StatTile value={String(streak.longest)} label="Längsta streak" />
      </View>
      <View style={s.statsRow}>
        <StatTile value={String(stats.visitsTotal)} label={stats.visitsTotal === 1 ? "Besökt plats" : "Besökta platser"} />
        <StatTile icon={<Ticket size={18} color={GOLD} strokeWidth={2} />} value={String(stats.stickersTotal)} label="Samlarobjekt" />
      </View>

      {stats.activity.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Senaste aktivitet</Text>
          <View style={s.card}>
            {stats.activity.map((a, i) => (
              <ActivityRow key={i} who={who} activity={a} bordered={i > 0} />
            ))}
          </View>
        </View>
      )}
    </>
  );
}

function ActivityRow({ who, activity, bordered }: { who: string; activity: FriendActivity; bordered: boolean }) {
  const date = format(new Date(activity.happenedAt), "d MMM", { locale: sv });
  const text =
    activity.kind === "visit" ? `${who} besökte ${activity.label}` :
    activity.kind === "favorite" ? `${who} lade till ${activity.label} i favoriter` :
    `${who} samlade in ${activity.label}`;

  return (
    <View style={[s.activityRow, bordered && s.activityRowBorder]}>
      {activity.kind === "sticker" && activity.imagePath ? (
        <Image source={{ uri: stickerImageUrl(activity.imagePath) }} style={s.activityThumb} resizeMode="contain" />
      ) : (
        <View style={s.activityIcon}>
          {activity.kind === "visit" ? <MapPin size={15} color={GOLD} strokeWidth={2} /> : activity.kind === "favorite" ? <Heart size={15} color={GOLD} strokeWidth={2} /> : <Sparkles size={15} color={GOLD} strokeWidth={2} />}
        </View>
      )}
      <Text style={s.activityText} numberOfLines={2}>{text}</Text>
      <Text style={s.activityDate}>{date}</Text>
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
      <View style={s.statsRow}>
        <View style={s.statTile}><SkelBar w={30} h={22} /><SkelBar w={60} h={10} /></View>
        <View style={s.statTile}><SkelBar w={30} h={22} /><SkelBar w={70} h={10} /></View>
      </View>
      <View style={[s.section, { marginTop: 20 }]}>
        <View style={s.card}>
          {SKELETON_WIDTHS.map((w, i) => (
            <View key={i} style={[s.activityRow, i > 0 && s.activityRowBorder]}>
              <View style={s.activityIcon} />
              <SkelBar w={w} h={12} />
            </View>
          ))}
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

  hero: { alignItems: "center", paddingTop: 118 },
  name: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 24, color: "#FFFFFF", marginTop: 14 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)" },
  since: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, marginTop: 8 },

  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, textAlign: "center", marginTop: 30, paddingHorizontal: 30 },

  statsRow: { flexDirection: "row", gap: 12, marginHorizontal: 16, marginTop: 22 },
  statTile: {
    flex: 1, alignItems: "center", gap: 4, paddingVertical: 18,
    borderRadius: 16, backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 22, color: FG, marginTop: 2 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED },

  section: { marginTop: 26, paddingHorizontal: 16 },
  sectionTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: FG, marginBottom: 12 },
  card: { borderRadius: 16, backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden" },

  activityRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  activityRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.08)" },
  activityIcon: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(197,160,89,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  activityThumb: { width: 30, height: 30 },
  activityText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 13.5, color: FG, lineHeight: 18 },
  activityDate: { fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED },

  lockedWrap: { marginTop: 6 },
  lockedCard: {
    position: "absolute", left: 16, right: 16, top: "50%", transform: [{ translateY: -60 }],
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
