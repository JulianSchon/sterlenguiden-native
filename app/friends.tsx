/**
 * Vänner — sök på användarnamn, hantera förfrågningar och se sin vänlista.
 *
 * Samma hårdkodat mörka, osvenskaspråkiga stil som resten av Mitt Österlen (inte migrerad till
 * tema/i18n än — det görs tillsammans med resten av sidan i en senare polerings-omgång).
 *
 * Ingen pushnotis finns ännu: en ny förfrågan syns bara som en räknare (badge på Mitt Österlen)
 * tills mottagaren själv öppnar appen och kommer hit.
 */
import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowLeft, Search, UserPlus, Check, X, Users, ChevronRight } from "lucide-react-native";
import { Avatar } from "@/components/profile/Avatar";
import { PressableScale } from "@/components/PressableScale";
import { RadialGlow } from "@/components/trophies/TrophyMedal";
import { useProfile } from "@/hooks/useProfile";
import {
  useSearchUsers, useFriendships, useSendFriendRequest, useAcceptFriendRequest, useRemoveFriendship,
  type FriendResult,
} from "@/hooks/useFriends";

const BG     = "#121212";
const FG     = "#F5F1E8";
const MUTED  = "rgba(245,241,232,0.55)";
const CARD   = "#1A1A1D";
const GOLD   = "#C5A059";
const GOLD_LT = "#E8C674";

export default function FriendsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();

  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  // Litet dröjsmål innan sökningen skickas, så vi inte gör ett anrop per knapptryckning
  useEffect(() => {
    const id = setTimeout(() => setQuery(searchInput), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  const searching = query.trim().length >= 2;
  const { data: results = [], isFetching: searchLoading } = useSearchUsers(query);
  const { data: friendships = [] } = useFriendships();

  const incoming = friendships.filter((f) => f.friendStatus === "incoming");
  const accepted = friendships.filter((f) => f.friendStatus === "accepted");
  const outgoing = friendships.filter((f) => f.friendStatus === "outgoing");

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: insets.top, backgroundColor: BG }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.title} numberOfLines={1}>VÄNNER</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
      >
        <View style={s.searchBox}>
          <Search size={17} color={MUTED} strokeWidth={2} />
          <TextInput
            style={s.searchInput}
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Sök på användarnamn"
            placeholderTextColor={MUTED}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {!profile?.username && (
          <PressableScale style={s.usernameHint} scale={0.98} onPress={() => router.push("/settings/account")}>
            <Text style={s.usernameHintText}>
              Du har inget användarnamn än — andra kan inte hitta dig förrän du väljer ett i Konto.
            </Text>
          </PressableScale>
        )}

        {searching ? (
          <View style={s.section}>
            {searchLoading && results.length === 0 ? (
              <ActivityIndicator color={GOLD} style={{ marginTop: 20 }} />
            ) : results.length === 0 ? (
              <Text style={s.empty}>Ingen med det användarnamnet.</Text>
            ) : (
              <>
                <Text style={s.resultCount}>
                  {results.length === 1 ? "1 resultat" : `${results.length} resultat`}
                </Text>
                <View style={{ gap: 10, marginTop: 12 }}>
                  {results.map((r) => <FriendRow key={r.userId} friend={r} />)}
                </View>
              </>
            )}
          </View>
        ) : (
          <>
            {incoming.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Väntande förfrågningar</Text>
                <View style={{ gap: 10, marginTop: 14 }}>
                  {incoming.map((r) => <FriendRow key={r.userId} friend={r} />)}
                </View>
              </View>
            )}

            {outgoing.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Skickade förfrågningar</Text>
                <View style={{ gap: 10, marginTop: 14 }}>
                  {outgoing.map((r) => <FriendRow key={r.userId} friend={r} />)}
                </View>
              </View>
            )}

            <View style={s.section}>
              <Text style={s.sectionTitle}>
                {accepted.length === 1 ? "1 vän" : `${accepted.length} vänner`}
              </Text>
              {accepted.length === 0 ? (
                <View style={s.emptyState}>
                  <Users size={26} color={GOLD} strokeWidth={1.5} />
                  <Text style={s.empty}>
                    Sök på ett användarnamn för att lägga till din första vän. Ni ser sedan varandras
                    statistik och kan bjuda in varandra i listor.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 10, marginTop: 14 }}>
                  {accepted.map((r) => <FriendRow key={r.userId} friend={r} />)}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── En rad: sökträff, väntande förfrågan eller vän ──────────────────────────

function FriendRow({ friend }: { friend: FriendResult }) {
  const router = useRouter();
  const send = useSendFriendRequest();
  const accept = useAcceptFriendRequest();
  const remove = useRemoveFriendship();
  const busy = send.isPending || accept.isPending || remove.isPending;

  // Ingen fördröjning — lika snabb som Vänner-knappen på Mitt Österlen.
  const tap = () => router.push({ pathname: "/friend/[id]", params: { id: friend.userId } });

  return (
    <PressableScale style={s.row} scale={0.96} onPress={tap}>
      <Avatar size={50} uri={null} name={friend.displayName ?? friend.username ?? "?"} color={friend.circleColor ?? "#2A2A2A"} ring={friend.avatarRing} />
      <View style={{ flex: 1 }}>
        <Text style={s.rowName} numberOfLines={1}>{friend.displayName || friend.username}</Text>
        <Text style={s.rowSub} numberOfLines={1}>
          {friend.username ? `@${friend.username}` : ""}{friend.city ? `  ·  ${friend.city}` : ""}
        </Text>
      </View>

      {friend.friendStatus === "none" && (
        <RowButton
          icon={<UserPlus size={16} color={GOLD} strokeWidth={2.2} />}
          gold
          disabled={busy}
          onPress={(e) => {
            e.stopPropagation();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            send.mutate(friend.userId);
          }}
        />
      )}

      {friend.friendStatus === "outgoing" && friend.friendshipId && (
        <PressableScale
          style={s.cancelBtn}
          disabled={busy}
          onPress={(e) => { e.stopPropagation(); remove.mutate(friend.friendshipId!); }}
        >
          <Text style={s.cancelBtnText}>Avbryt</Text>
        </PressableScale>
      )}

      {friend.friendStatus === "incoming" && friend.friendshipId && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <RowButton
            icon={<X size={16} color={MUTED} strokeWidth={2.2} />}
            disabled={busy}
            onPress={(e) => { e.stopPropagation(); remove.mutate(friend.friendshipId!); }}
          />
          <RowButton
            icon={<Check size={16} color={GOLD} strokeWidth={2.4} />}
            gold
            disabled={busy}
            onPress={(e) => {
              e.stopPropagation();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              accept.mutate(friend.friendshipId!);
            }}
          />
        </View>
      )}

      {friend.friendStatus === "accepted" && (
        <View style={s.friendsLabelRow}>
          <Text style={s.friendsLabel}>Vänner</Text>
          <ChevronRight size={20} color={MUTED} strokeWidth={2} />
        </View>
      )}
    </PressableScale>
  );
}

function RowButton({ icon, gold, disabled, onPress }: { icon: React.ReactNode; gold?: boolean; disabled?: boolean; onPress: (e: any) => void }) {
  return (
    <View style={{ width: 34, height: 34 }}>
      {gold && <RadialGlow size={34} color={GOLD} opacity={0.12} radiusRatio={1.1} />}
      <PressableScale
        style={[s.rowBtn, gold ? s.rowBtnGold : s.rowBtnGhost]}
        onPress={onPress}
        disabled={disabled}
        hitSlop={6}
      >
        {icon}
      </PressableScale>
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
  title: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, color: FG },

  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginTop: 18, paddingHorizontal: 14, height: 46,
    borderRadius: 12, backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 15, color: FG },

  usernameHint: {
    marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 12,
    backgroundColor: "rgba(197,160,89,0.10)", borderWidth: 1, borderColor: "rgba(197,160,89,0.30)",
  },
  usernameHintText: { fontFamily: "Inter_400Regular", fontSize: 12.5, lineHeight: 18, color: GOLD_LT },

  // Mindre yta ner mot sökfältet ovanför (var 28, kändes för stort både för "X resultat" och
  // för "1 vän" när listan är kort)
  section: { marginTop: 22, paddingHorizontal: 16 },
  // Playfair bort — bara för personnamn i appen numera, sektionsrubriker delar Montserrat
  sectionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 18, letterSpacing: -0.2, color: FG },
  resultCount: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: MUTED, marginTop: 4 },
  empty: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, lineHeight: 21, marginTop: 10 },
  emptyState: { alignItems: "center", gap: 10, marginTop: 24, paddingHorizontal: 10 },

  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 16, borderRadius: 16,
    backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden", // rymmer Lägg till vän-knappens glöd (RadialGlow) inom kortets rundade form
  },
  rowName: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: FG },
  rowSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED, marginTop: 2 },

  rowBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  // Ytterkanten i guld i stället för en helt guldfylld knapp, plus en glöd bakom (se RowButton)
  rowBtnGold: { backgroundColor: "rgba(197,160,89,0.12)", borderWidth: 1.5, borderColor: GOLD },
  rowBtnGhost: { backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  cancelBtn: {
    height: 34, paddingHorizontal: 14, borderRadius: 17,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
  },
  cancelBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, color: MUTED },
  // "Vänner" + en pil, så det syns att raden går att trycka på (i stället för text ensam mot högerkanten)
  friendsLabelRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  friendsLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: GOLD_LT },
});
