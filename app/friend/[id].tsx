/**
 * En persons profil, öppnad från Vänner (sökträff, förfrågan eller vän).
 * Samma hårdkodat mörka stil som resten av Mitt Österlen.
 *
 * Ingen profilbild visas, bara initialring — medvetet, se friends-grundens
 * integritetsbeslut: en topplista/vänprofil ska aldrig läcka ett foto.
 *
 * Innan ni är vänner visas bara namn, ort och "medlem sedan" plus rätt knapp för läget
 * (lägg till / skickad / acceptera). Statistiken (rpc_friend_stats) hämtas och visas
 * först när relationen faktiskt är accepterad.
 */
import { useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowLeft, MapPin, Flame, Ticket, UserMinus, UserPlus, Check, X } from "lucide-react-native";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Avatar } from "@/components/profile/Avatar";
import { PressableScale } from "@/components/PressableScale";
import {
  useFriendProfile, useFriendStats, useSendFriendRequest, useAcceptFriendRequest, useRemoveFriendship,
} from "@/hooks/useFriends";
import { computeStreak, swedishDay } from "@/lib/streak";

const BG    = "#121212";
const FG    = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const CARD  = "#1A1A1D";
const GOLD  = "#C5A059";

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

  const streak = useMemo(
    () => (stats ? computeStreak(stats.appDays, swedishDay()) : null),
    [stats],
  );

  const confirmRemove = () => {
    if (!friend?.friendshipId) return;
    Alert.alert(
      "Ta bort vän?",
      `Du och ${friend.displayName ?? friend.username} kommer inte längre se varandras statistik.`,
      [
        { text: "Avbryt", style: "cancel" },
        { text: "Ta bort", style: "destructive", onPress: () => { remove.mutate(friend.friendshipId!); router.back(); } },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: insets.top, backgroundColor: BG }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.title} numberOfLines={1}>{(friend?.displayName ?? friend?.username ?? "PROFIL").toUpperCase()}</Text>
          {isFriend && (
            <TouchableOpacity style={s.removeBtn} onPress={confirmRemove} hitSlop={8}>
              <UserMinus size={19} color={MUTED} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}>
        <View style={s.hero}>
          <Avatar size={84} uri={null} name={friend?.displayName ?? friend?.username ?? "?"} color={friend?.circleColor ?? "#2A2A2A"} ring={friend?.avatarRing} />
          <Text style={s.name}>{friend?.displayName || friend?.username}</Text>
          {friend?.username && <Text style={s.username}>@{friend.username}</Text>}
          <View style={s.metaRow}>
            {friend?.city && (
              <View style={s.metaItem}>
                <MapPin size={13} color={MUTED} strokeWidth={2} />
                <Text style={s.meta}>{friend.city}</Text>
              </View>
            )}
            {friend?.memberSince && (
              <Text style={s.meta}>Medlem sedan {format(new Date(friend.memberSince), "MMMM yyyy", { locale: sv })}</Text>
            )}
          </View>
        </View>

        {profileLoading && <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />}

        {/* Inte vänner än: bara ett kort med rätt knapp för läget */}
        {friend && !isFriend && (
          <View style={s.actionCard}>
            {friend.friendStatus === "none" && (
              <PressableScale
                style={s.primaryBtn}
                disabled={busy}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  send.mutate(friend.userId);
                }}
              >
                <UserPlus size={17} color="#0B0B0D" strokeWidth={2.2} />
                <Text style={s.primaryBtnText}>Lägg till vän</Text>
              </PressableScale>
            )}

            {friend.friendStatus === "outgoing" && friend.friendshipId && (
              <>
                <Text style={s.actionHint}>Vänförfrågan skickad</Text>
                <PressableScale style={s.ghostBtn} disabled={busy} onPress={() => remove.mutate(friend.friendshipId!)}>
                  <Text style={s.ghostBtnText}>Avbryt förfrågan</Text>
                </PressableScale>
              </>
            )}

            {friend.friendStatus === "incoming" && friend.friendshipId && (
              <>
                <Text style={s.actionHint}>Vill bli vän med dig</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <PressableScale style={[s.ghostBtn, { flex: 1 }]} disabled={busy} onPress={() => remove.mutate(friend.friendshipId!)}>
                    <X size={16} color={MUTED} strokeWidth={2.2} />
                    <Text style={s.ghostBtnText}>Neka</Text>
                  </PressableScale>
                  <PressableScale
                    style={[s.primaryBtn, { flex: 1 }]}
                    disabled={busy}
                    onPress={() => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                      accept.mutate(friend.friendshipId!);
                    }}
                  >
                    <Check size={16} color="#0B0B0D" strokeWidth={2.4} />
                    <Text style={s.primaryBtnText}>Acceptera</Text>
                  </PressableScale>
                </View>
              </>
            )}
          </View>
        )}

        {isFriend && statsLoading && <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />}
        {isFriend && isError && <Text style={s.errorText}>Kunde inte hämta statistik just nu.</Text>}

        {isFriend && stats && streak && (
          <>
            <View style={s.statsRow}>
              <StatTile icon={<Flame size={18} color={GOLD} strokeWidth={2} />} value={String(streak.current)} label={streak.current === 1 ? "Dags streak" : "Dagars streak"} />
              <StatTile value={String(streak.longest)} label="Längsta streak" />
            </View>
            <View style={s.statsRow}>
              <StatTile value={String(stats.visitsTotal)} label={stats.visitsTotal === 1 ? "Besökt plats" : "Besökta platser"} />
              <StatTile icon={<Ticket size={18} color={GOLD} strokeWidth={2} />} value={String(stats.stickersTotal)} label="Samlarobjekt" />
            </View>

            {stats.recentVisits.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Senaste besök</Text>
                <View style={s.card}>
                  {stats.recentVisits.map((v, i) => (
                    <View key={i} style={[s.visitRow, i > 0 && s.visitRowBorder]}>
                      <Text style={s.visitName} numberOfLines={1}>{v.placeName}</Text>
                      <Text style={s.visitDate}>{format(new Date(v.visitedAt), "d MMM", { locale: sv })}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
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

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  backBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  removeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, color: FG },

  hero: { alignItems: "center", marginTop: 12, gap: 4 },
  name: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 22, color: FG, marginTop: 12 },
  username: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED },

  actionCard: {
    marginTop: 22, marginHorizontal: 16, padding: 16, borderRadius: 18, gap: 12,
    backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", alignItems: "stretch",
  },
  actionHint: { fontFamily: "Inter_500Medium", fontSize: 13, color: MUTED, textAlign: "center" },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 48, borderRadius: 12, backgroundColor: GOLD,
  },
  primaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#0B0B0D" },
  ghostBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 48, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
  },
  ghostBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: FG },

  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, textAlign: "center", marginTop: 40, paddingHorizontal: 30 },

  statsRow: { flexDirection: "row", gap: 12, marginHorizontal: 16, marginTop: 16 },
  statTile: {
    flex: 1, alignItems: "center", gap: 4, paddingVertical: 18,
    borderRadius: 16, backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 22, color: FG, marginTop: 2 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED },

  section: { marginTop: 26, paddingHorizontal: 16 },
  sectionTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: FG, marginBottom: 12 },
  card: { borderRadius: 16, backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  visitRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13 },
  visitRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.08)" },
  visitName: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, color: FG, marginRight: 10 },
  visitDate: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED },
});
