/**
 * Vänner — sök på användarnamn, hantera förfrågningar och se sin vänlista.
 *
 * Samma alltid mörka stil som resten av Mitt Österlen.
 *
 * Ingen pushnotis finns ännu: en ny förfrågan syns bara som en räknare (badge på Mitt Österlen)
 * tills mottagaren själv öppnar appen och kommer hit.
 */
import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowLeft, Search, UserPlus, Check, X, Users, ChevronRight } from "lucide-react-native";
import { Avatar } from "@/components/profile/Avatar";
import { PressableScale } from "@/components/PressableScale";
import { Skeleton } from "@/components/Skeleton";
import { RadialGlow } from "@/components/trophies/TrophyMedal";
import { useProfile } from "@/hooks/useProfile";
import {
  useSearchUsers, useFriendships, useSendFriendRequest, useAcceptFriendRequest, useRemoveFriendship,
  type FriendResult,
} from "@/hooks/useFriends";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { pushOnce } from "@/lib/navigateOnce";


export default function FriendsScreen() {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();
  const { t } = useTranslation();

  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  // Litet dröjsmål innan sökningen skickas, så vi inte gör ett anrop per knapptryckning
  useEffect(() => {
    const id = setTimeout(() => setQuery(searchInput), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  const searching = query.trim().length >= 2;
  const { data: results = [], isFetching: searchLoading } = useSearchUsers(query);
  const { data: friendships = [], isLoading: friendsLoading } = useFriendships();

  const incoming = friendships.filter((f) => f.friendStatus === "incoming");
  const accepted = friendships.filter((f) => f.friendStatus === "accepted");
  const outgoing = friendships.filter((f) => f.friendStatus === "outgoing");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.bg }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} accessibilityLabel={t("friends.back")}>
            <ArrowLeft size={24} color={colors.text} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.title} numberOfLines={1}>{t("friends.title")}</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
      >
        <View style={s.searchBox}>
          <Search size={17} color={colors.muted} strokeWidth={2} />
          <TextInput
            style={s.searchInput}
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder={t("friends.search")}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {!profile?.username && (
          <PressableScale style={s.usernameHint} scale={0.98} onPress={() => pushOnce(router, "/settings/account")}>
            <Text style={s.usernameHintText}>{t("friends.noUsername")}</Text>
          </PressableScale>
        )}

        {searching ? (
          <View style={s.section}>
            {searchLoading && results.length === 0 ? (
              <>
                <Skeleton width={70} height={11} radius={4} style={{ marginTop: 6 }} />
                <View style={{ gap: 10, marginTop: 14 }}>
                  {[0, 1, 2].map((i) => <FriendRowSkeleton key={i} />)}
                </View>
              </>
            ) : results.length === 0 ? (
              <Text style={s.empty}>{t("friends.noMatch")}</Text>
            ) : (
              <>
                <Text style={s.resultCount}>
                  {results.length === 1 ? t("friends.resultOne") : t("friends.resultOther", { count: results.length })}
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
                <Text style={s.sectionTitle}>{t("friends.incoming")}</Text>
                <View style={{ gap: 10, marginTop: 14 }}>
                  {incoming.map((r) => <FriendRow key={r.userId} friend={r} />)}
                </View>
              </View>
            )}

            {outgoing.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>{t("friends.outgoing")}</Text>
                <View style={{ gap: 10, marginTop: 14 }}>
                  {outgoing.map((r) => <FriendRow key={r.userId} friend={r} />)}
                </View>
              </View>
            )}

            {friendsLoading ? (
              // Vänlistan i grått medan den laddas (annars blinkar "0 vänner" förbi)
              <View style={s.section}>
                <Skeleton width={90} height={18} radius={6} />
                <View style={{ gap: 10, marginTop: 14 }}>
                  {[0, 1, 2].map((i) => <FriendRowSkeleton key={i} />)}
                </View>
              </View>
            ) : (
            <View style={s.section}>
              <Text style={s.sectionTitle}>
                {accepted.length === 1 ? t("friends.countOne") : t("friends.countOther", { count: accepted.length })}
              </Text>
              {accepted.length === 0 ? (
                <View style={s.emptyState}>
                  <Users size={26} color={colors.goldText} strokeWidth={1.5} />
                  <Text style={s.empty}>{t("friends.empty")}</Text>
                </View>
              ) : (
                <View style={{ gap: 10, marginTop: 14 }}>
                  {accepted.map((r) => <FriendRow key={r.userId} friend={r} />)}
                </View>
              )}
            </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** En personrad i grått medan sökträffar eller vänner laddas */
function FriendRowSkeleton() {
  const s = useThemedStyles(createStyles);
  return (
    <View style={s.row} pointerEvents="none">
      <Skeleton width={50} height={50} radius={25} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="55%" height={15} radius={5} />
        <Skeleton width="40%" height={11} radius={4} />
      </View>
    </View>
  );
}

// ─── En rad: sökträff, väntande förfrågan eller vän ──────────────────────────

function FriendRow({ friend }: { friend: FriendResult }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const router = useRouter();
  const send = useSendFriendRequest();
  const accept = useAcceptFriendRequest();
  const remove = useRemoveFriendship();
  const busy = send.isPending || accept.isPending || remove.isPending;

  // Ingen fördröjning — lika snabb som Vänner-knappen på Mitt Österlen.
  const tap = () => pushOnce(router, { pathname: "/friend/[id]", params: { id: friend.userId } });

  return (
    <PressableScale style={s.row} scale={0.96} onPress={tap}>
      <Avatar size={50} path={friend.avatarPath} name={friend.displayName ?? friend.username ?? "?"} color={friend.circleColor ?? colors.fill} ring={friend.avatarRing} />
      <View style={{ flex: 1 }}>
        <Text style={s.rowName} numberOfLines={1}>{friend.displayName || friend.username}</Text>
        <Text style={s.rowSub} numberOfLines={1}>
          {friend.username ? `@${friend.username}` : ""}{friend.city ? `  ·  ${friend.city}` : ""}
        </Text>
      </View>

      {friend.friendStatus === "none" && (
        <RowButton
          icon={<UserPlus size={16} color={colors.goldText} strokeWidth={2.2} />}
          label={i18n.t("friends.add")}
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
          <Text style={s.cancelBtnText}>{i18n.t("friends.cancel")}</Text>
        </PressableScale>
      )}

      {friend.friendStatus === "incoming" && friend.friendshipId && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <RowButton
            icon={<X size={16} color={colors.muted} strokeWidth={2.2} />}
            label={i18n.t("friends.decline")}
            disabled={busy}
            onPress={(e) => { e.stopPropagation(); remove.mutate(friend.friendshipId!); }}
          />
          <RowButton
            icon={<Check size={16} color={colors.goldText} strokeWidth={2.4} />}
            label={i18n.t("friends.accept")}
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
          <Text style={s.friendsLabel}>{i18n.t("friends.friends")}</Text>
          <ChevronRight size={20} color={colors.muted} strokeWidth={2} />
        </View>
      )}
    </PressableScale>
  );
}

function RowButton({ icon, label, gold, disabled, onPress }: { icon: React.ReactNode; label: string; gold?: boolean; disabled?: boolean; onPress: (e: any) => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <View style={{ width: 34, height: 34 }}>
      {gold && <RadialGlow size={34} color={colors.goldText} opacity={0.12} radiusRatio={1.1} />}
      <PressableScale
        style={[s.rowBtn, gold ? s.rowBtnGold : s.rowBtnGhost]}
        onPress={onPress}
        disabled={disabled}
        hitSlop={6}
        accessibilityLabel={label}
      >
        {icon}
      </PressableScale>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  backBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: c.fill,
    borderWidth: 1, borderColor: c.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  title: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, color: c.text },

  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginTop: 18, paddingHorizontal: 14, height: 46,
    borderRadius: 12, backgroundColor: c.card, borderWidth: 0.5, borderColor: c.border,
  },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 15, color: c.text },

  usernameHint: {
    marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 12,
    backgroundColor: c.goldSoft, borderWidth: 1, borderColor: c.goldBorder,
  },
  usernameHintText: { fontFamily: "Inter_400Regular", fontSize: 12.5, lineHeight: 18, color: c.goldText },

  // Mindre yta ner mot sökfältet ovanför (var 28, kändes för stort både för "X resultat" och
  // för "1 vän" när listan är kort)
  section: { marginTop: 22, paddingHorizontal: 16 },
  // Playfair bort — bara för personnamn i appen numera, sektionsrubriker delar Montserrat
  sectionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 18, letterSpacing: -0.2, color: c.text },
  resultCount: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: c.muted, marginTop: 4 },
  empty: { fontFamily: "Inter_400Regular", fontSize: 14, color: c.muted, lineHeight: 21, marginTop: 10 },
  emptyState: { alignItems: "center", gap: 10, marginTop: 24, paddingHorizontal: 10 },

  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 16, borderRadius: 16,
    backgroundColor: c.card, borderWidth: 0.5, borderColor: c.border,
    overflow: "hidden", // rymmer Lägg till vän-knappens glöd (RadialGlow) inom kortets rundade form
  },
  rowName: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: c.text },
  rowSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.muted, marginTop: 2 },

  rowBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  // Ytterkanten i guld i stället för en helt guldfylld knapp, plus en glöd bakom (se RowButton)
  rowBtnGold: { backgroundColor: c.goldSoft, borderWidth: 1.5, borderColor: c.gold },
  rowBtnGhost: { backgroundColor: c.fill, borderWidth: 1, borderColor: c.borderStrong },
  cancelBtn: {
    height: 34, paddingHorizontal: 14, borderRadius: 17,
    alignItems: "center", justifyContent: "center",
    backgroundColor: c.fill, borderWidth: 1, borderColor: c.borderStrong,
  },
  cancelBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, color: c.muted },
  // "Vänner" + en pil, så det syns att raden går att trycka på (i stället för text ensam mot högerkanten)
  friendsLabelRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  friendsLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: c.goldText },
});
