/**
 * En persons profil, öppnad från Vänner (sökträff, förfrågan eller vän).
 * Samma hårdkodat mörka stil som resten av Mitt Österlen.
 *
 * Ingen egen bakgrundsbild/toning längre (det höll aldrig, fyra försök) — i stället samma mönster
 * som troféerna på Utmaningar: en mjuk, suddig glöd (GlowCanvas) bakom profilringen, färgad efter
 * personens eget Österlenpass-kort. Enklare, och håller ihop med resten av appens formspråk.
 * Headern är sticky (som Mitt Österlen/Vänner), namnet står i den. Under den ligger profilbilden
 * ovanpå en identitetsbox (Streak/Besök/Favoriter) — samma mönster som en typisk profilsida.
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
import {
  ArrowLeft, MapPin, Heart, Sparkles, Ticket, Compass, UserMinus, UserPlus, Check, X,
} from "lucide-react-native";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Avatar } from "@/components/profile/Avatar";
import { StreakFlame } from "@/components/streak/StreakFlame";
import { PressableScale } from "@/components/PressableScale";
import {
  useFriendProfile, useFriendStats, useSendFriendRequest, useAcceptFriendRequest, useRemoveFriendship,
  type FriendActivity, type FriendResult, type FriendStats,
} from "@/hooks/useFriends";
import { stickerImageUrl } from "@/hooks/useCollectibles";
import { usePlaces, firstImageUrl } from "@/hooks/usePlaces";
import { computeCategoryStats } from "@/lib/categories";
import { GROUP_INFO } from "@/lib/achievements";
import { TrophyMedal, GlowCanvas } from "@/components/trophies/TrophyMedal";
import { getVariant } from "@/lib/cardVariants";
import { computeStreak, swedishDay } from "@/lib/streak";

const BG    = "#121212";
const FG    = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const CARD  = "#1A1A1D";
const GOLD  = "#C5A059";
const AVATAR_SIZE = 92;

/** Grå stapel i skelettet — aldrig text, bara form, så den aldrig kan tas för en riktig siffra */
function SkelBar({ w, h }: { w: number; h: number }) {
  return <View style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: "rgba(255,255,255,0.10)" }} />;
}

/** Besök/Favoriter-kolumnen i identitetsboxen — grå stapel i stället för siffra innan ni är vänner. */
function IdentityStat({ value, label }: { value: number | null; label: string }) {
  return (
    <View style={s.identityCol}>
      {value === null ? <SkelBar w={26} h={20} /> : <Text style={s.identityValue}>{value}</Text>}
      <Text style={s.identityLabel}>{label}</Text>
    </View>
  );
}

/** Streak-kolumnen — exakt samma eld (Skia, kompakt) som veckoraden och siffran på Mitt Österlen,
 * bara i miniatyr. Lågan själv är ren dekoration (ingen persondata) och animeras alltid; bara
 * siffran ovanpå döljs innan ni är vänner. */
function StreakColumn({ value }: { value: number | null }) {
  return (
    <View style={s.identityCol}>
      <View style={s.streakFlame}>
        <StreakFlame compact size={32} />
        {value !== null && (
          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]} pointerEvents="none">
            <Text style={s.streakFlameNumber}>{value}</Text>
          </View>
        )}
      </View>
      <Text style={s.identityLabel}>Streak</Text>
    </View>
  );
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

  // Samma kortfärg som personens eget Österlenpass, fritt valt oavsett medlemskap, bara kosmetik —
  // används bara som glödens färg bakom profilringen nu.
  const variant = friend ? getVariant(friend.cardColor) : null;
  const glowColor = variant?.bg ?? GOLD;

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
      {/* Sticky igen — okomplicerat nu när det inte längre finns någon foto/toning-bakgrund att
          krocka med. Ligger utanför scrollytan med egen solid bakgrund, samma mönster som
          Mitt Österlen och Vänner. */}
      <View style={[s.header, { paddingTop: insets.top, backgroundColor: BG }]}>
        <TouchableOpacity style={s.headerBtn} onPress={() => router.back()}>
          <ArrowLeft size={24} color={FG} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{who}</Text>
        {isFriend ? (
          <TouchableOpacity style={s.headerBtn} onPress={confirmRemove} hitSlop={8}>
            <UserMinus size={24} color="#B33939" strokeWidth={2} />
          </TouchableOpacity>
        ) : (
          // Osynlig platshållare i samma storlek, så namnet ändå hamnar mitt i raden
          <View style={[s.headerBtn, { opacity: 0 }]} pointerEvents="none" />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingBottom: Math.max(insets.bottom, 16) + 24 }, !isFriend && friend && { flexGrow: 1 }]}
      >
        <View style={s.hero}>
          <View style={{ zIndex: 2 }}>
            {/* Samma mått som den framhävda troféns permanenta glöd på Utmaningar — stor, mjuk, diffus */}
            <GlowCanvas size={AVATAR_SIZE} color={glowColor} opacity={0.1} radiusRatio={0.95} blurRatio={0.4} />
            <Avatar size={AVATAR_SIZE} uri={null} name={who} color={friend?.circleColor ?? "#2A2A2A"} ring={friend?.avatarRing} />
          </View>

          {/* Profilbilden ligger ovanpå den här boxen (negativ marginal), som på referensbilden */}
          <View style={s.identityCard}>
            <Text style={s.name}>{who}</Text>
            <View style={s.metaRow}>
              {friend?.username && <Text style={s.meta}>@{friend.username}</Text>}
              {friend?.city && (
                <View style={s.metaItem}>
                  <MapPin size={12} color="rgba(255,255,255,0.6)" strokeWidth={2} />
                  <Text style={s.meta}>{friend.city}</Text>
                </View>
              )}
            </View>
            {friend?.memberSince && (
              <Text style={s.since}>Medlem sedan {format(new Date(friend.memberSince), "MMMM yyyy", { locale: sv })}</Text>
            )}

            <View style={s.identityDivider} />

            {/* Streak/besök/favoriter — bara riktiga siffror när ni är vänner, annars platshållare */}
            <View style={s.identityStats}>
              <StreakColumn value={isFriend && streak ? streak.current : null} />
              <View style={s.identityColDivider} />
              <IdentityStat value={isFriend && stats ? stats.visitsTotal : null} label="Besök" />
              <View style={s.identityColDivider} />
              <IdentityStat value={isFriend && stats ? stats.favoritesTotal : null} label="Favoriter" />
            </View>
          </View>
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
        <View style={[s.section, { marginTop: 32 }]}>
          <Text style={s.sectionTitle}>Senaste aktivitet</Text>
          <View style={s.card}>
            {stats.activity.map((a, i) => (
              <ActivityRow key={i} who={who} activity={a} bordered={i > 0} />
            ))}
          </View>
        </View>
      )}

      {stats.trophies.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Troféer</Text>
          <TrophyRow trophies={stats.trophies} />
        </View>
      )}

      <View style={s.section}>
        <Text style={s.sectionTitle}>Statistik</Text>
        <View style={s.card}>
          {topCategory && (
            <StatRow first icon={<topCategory.Icon size={15} color={GOLD} strokeWidth={2} />} label="Mest besökta kategori" value={topCategory.label} />
          )}
          <StatRow first={!topCategory} icon={<Ticket size={15} color={GOLD} strokeWidth={2} />} label="Samlarobjekt" value={String(stats.stickersTotal)} />
          {totalPlaces > 0 && (
            <StatRow icon={<Compass size={15} color={GOLD} strokeWidth={2} />} label="Utforskat av Österlen" value={`${stats.visitsTotal} av ${totalPlaces}`} />
          )}
        </View>
      </View>
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
  // Bara namnet ska vara fetstilt — resten av meningen vanlig text, så det inte ser ut som att
  // hela raden skriker. Byggd som två Text-delar (RN slår ihop dem till en rad ändå).
  const rest =
    activity.kind === "visit" ? ` besökte ${activity.label}` :
    activity.kind === "favorite" ? ` lade till ${activity.label} i favoriter` :
    ` samlade in ${activity.label}`;

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
        <Text style={s.activityText} numberOfLines={2}>
          <Text style={s.activityWho}>{who}</Text>
          {rest}
        </Text>
        <Text style={s.activityDate}>{date}</Text>
      </View>
    </View>
  );
}

function StatRow({ icon, label, value, first }: { icon: React.ReactNode; label: string; value: string; first?: boolean }) {
  return (
    <View style={[s.statRow, first && { borderTopWidth: 0 }]}>
      <View style={s.statRowIcon}>{icon}</View>
      <Text style={s.statRowLabel}>{label}</Text>
      <Text style={s.statRowValue} numberOfLines={1}>{value}</Text>
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
      {/* Skelettet: samma form som den riktiga aktivitetsloggen, men aldrig påhittade siffror.
          Streak/besök/favoriter har redan sin egen platshållare uppe i identitetsboxen. */}
      <View style={{ flex: 1 }}>
        <View style={[s.section, { marginTop: 32 }]}>
          <View style={s.card}>
            {SKELETON_WIDTHS.map((w, i) => (
              <View key={i} style={[s.activityRow, i > 0 && s.activityRowBorder]}>
                <View style={s.activityIcon} />
                <SkelBar w={w} h={12} />
              </View>
            ))}
          </View>
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
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12,
  },
  // Samma storlek, form och färg som tillbaka-knappen på Vänner-sidan och resten av appen
  headerBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, marginHorizontal: 8, textAlign: "center", fontFamily: "Montserrat_700Bold", fontSize: 17, color: FG },

  hero: { alignItems: "center", paddingTop: 24 },

  // Kortet identitetsboxen ligger på — profilbilden (92px, zIndex 2) sticker upp genom det övre
  // hålet (negativ marginTop = halva avatarstorleken), samma överlapp som referensbilden.
  identityCard: {
    alignSelf: "stretch", marginHorizontal: 16, marginTop: -(AVATAR_SIZE / 2),
    paddingTop: AVATAR_SIZE / 2 + 14, paddingBottom: 20, paddingHorizontal: 20,
    alignItems: "center", borderRadius: 20,
    backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
  },
  // Playfair bort härifrån också — samma sans-serif (Inter) som resten av sidan, bara större och
  // fetare, som en riktig rubrik i stället för en bruten skrivstil.
  // Samma typsnitt som "Senaste aktivitet" och de andra sektionsrubrikerna (s.sectionTitle),
  // fast utan versaler/spårning — det är ett namn, inte en rubrik.
  name: { fontFamily: "Montserrat_700Bold", fontSize: 22, letterSpacing: -0.2, color: "#FFFFFF" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)" },
  since: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, marginTop: 8 },

  identityDivider: { alignSelf: "stretch", height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.10)", marginTop: 18 },
  identityStats: { flexDirection: "row", alignItems: "flex-end", alignSelf: "stretch", marginTop: 16 },
  identityCol: { flex: 1, alignItems: "center", gap: 4 },
  identityColDivider: { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: "rgba(255,255,255,0.12)" },
  identityValue: { fontFamily: "Inter_700Bold", fontSize: 20, color: FG },
  identityLabel: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: MUTED },
  streakFlame: { width: 32, height: 43, alignItems: "center", justifyContent: "center" },
  streakFlameNumber: {
    fontFamily: "Inter_700Bold", fontSize: 13, color: "#FFFFFF", textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },

  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, textAlign: "center", marginTop: 30, paddingHorizontal: 30 },

  section: { marginTop: 26, paddingHorizontal: 16 },
  // Playfair är bara för namn (personnamn) — sidans/hub-rubriker (Mitt Österlen, Vänner, Förmåner)
  // och sektionsrubriker som den här delar alla samma Montserrat i stället.
  sectionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 16, letterSpacing: -0.2, color: FG, marginBottom: 12 },
  card: { borderRadius: 16, backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden" },

  activityRow: { flexDirection: "row", alignItems: "flex-start", gap: 13, paddingHorizontal: 16, paddingVertical: 14 },
  activityBody: { flex: 1, minHeight: 44, justifyContent: "space-between" },
  activityRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.08)" },
  activityIcon: {
    width: 44, height: 44, borderRadius: 11, backgroundColor: "rgba(197,160,89,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  // Ett riktigt foto (plats/event) fyller rutan; en sticker ligger fri (contain) på samma mörka platta
  activityThumb: { width: 44, height: 44, borderRadius: 11, backgroundColor: CARD },
  activityText: { fontFamily: "Inter_400Regular", fontSize: 14, color: FG, lineHeight: 19 },
  activityWho: { fontFamily: "Inter_700Bold" },
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
