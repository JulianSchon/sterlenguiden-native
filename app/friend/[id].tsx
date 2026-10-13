/**
 * En persons profil, öppnad från Vänner (sökträff, förfrågan eller vän).
 * Samma hårdkodat mörka stil som resten av Mitt Österlen.
 *
 * Överst framsidan av personens medlemskort — designen (även vunna belöningskort), profilringen och
 * namnet, så att det man tjänat in syns för andra. Bara framsidan: baksidan är personalens
 * verifieringsyta. Headern är sticky (som Mitt Österlen/Vänner), namnet står i den. Under kortet
 * en identitetsbox (användarnamn, ort, Streak/Besök/Favoriter).
 *
 * Innan ni är vänner är statistiken och aktivitetsloggen en igenkännbar men blurrad förhandstitt
 * (expo-blur, redan inbyggt sedan tidigare bygge) — riktiga rader och rutor i rätt form, men med
 * grå platshållarstaplar i stället för siffror, aldrig påhittade tal. "Lägg till vän" ligger ovanpå.
 * Först när relationen är accepterad hämtas och visas den riktiga statistiken (rpc_friend_stats).
 *
 * Profilbilden på kortet syns bara för vänner (migration 032 öppnar exakt den bilden för dem);
 * alla andra ser initialerna.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, Image, ScrollView, TouchableOpacity, Pressable, Modal, StyleSheet, ActivityIndicator, Alert,
  Animated, Easing, useWindowDimensions, type StyleProp, type ViewStyle,
} from "react-native";
import Svg, { Circle as SvgCircle, Text as SvgText, Defs, LinearGradient as SvgGrad, Stop, Rect as SvgRect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import {
  ArrowLeft, MapPin, Heart, Compass, Trash2, UserPlus, Check, X,
} from "lucide-react-native";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { StreakFlame } from "@/components/streak/StreakFlame";
import { StickerArt } from "@/components/stickers/StickerArt";
import { useCollectibles } from "@/hooks/useCollectibles";
import Reanimated, { ZoomIn, Easing as REasing } from "react-native-reanimated";
import { PressableScale } from "@/components/PressableScale";
import {
  useFriendProfile, useFriendStats, useSendFriendRequest, useAcceptFriendRequest, useRemoveFriendship,
  type FriendActivity, type FriendResult, type FriendStats,
} from "@/hooks/useFriends";
import { usePlaces, firstImageUrl } from "@/hooks/usePlaces";
import { computeCategoryStats } from "@/lib/categories";
import { getTrophyMeta, TIER_PALETTE } from "@/lib/achievements";
import { CATEGORIES } from "@/theme/categories";
import { TrophyMedal, RadialGlow } from "@/components/trophies/TrophyMedal";
import { MemberCard, CARD_H, CARD_W } from "@/components/MemberCard";
import { PlacePin } from "@/components/PlacePin";
import { useOtherAvatarUrl } from "@/hooks/useAvatarUrl";
import { useFriendLists, type FriendList } from "@/hooks/useLists";
import { ListCover } from "@/components/lists/ListCover";
import { computeStreak, swedishDay } from "@/lib/streak";

const BG    = "#121212";
const FG    = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const CARD  = "#1A1A1D";
const GOLD  = "#C5A059";
const RED   = "#B83434"; // samma röd som hjärtat på platssidan när den är favoritmarkerad

const noop = () => {};

/** Grå stapel i skelettet — aldrig text, bara form, så den aldrig kan tas för en riktig siffra */
function SkelBar({ w, h }: { w: number; h: number }) {
  return <View style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: "rgba(255,255,255,0.10)" }} />;
}

/** Streak/Besök/Favoriter-kolumnen i identitetsboxen: etikett ovanför, ifylld symbol + siffra i en
 * rad under — samma mönster för alla tre (streak-lågan är bara en annan "ikon"). Grå stapel i
 * stället för siffra innan ni är vänner; symbolen är ren dekoration och visas alltid. */
function IdentityStat({ icon, value, label }: { icon: React.ReactNode; value: number | string | null; label: string }) {
  return (
    <View style={s.identityCol}>
      <Text style={s.identityLabel}>{label}</Text>
      <View style={s.identityRow}>
        {icon}
        {value === null ? <SkelBar w={20} h={14} /> : <Text style={s.identityValue}>{value}</Text>}
      </View>
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
  const { data: friendLists = [] } = useFriendLists(isFriend ? id ?? null : null);
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

  // Profilbilden bara för vänner — andra får ingen sökväg från servern och ser initialerna
  const avatarUrl = useOtherAvatarUrl(isFriend ? friend?.avatarPath ?? null : null);
  const { width } = useWindowDimensions();

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
          Mitt Österlen och Vänner — namnet vänsterställt och i versaler precis som "VÄNNER"/
          "MITT ÖSTERLEN", i stället för centrerat. */}
      <View style={{ paddingTop: insets.top, backgroundColor: BG }}>
        <View style={s.header}>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{who}</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingBottom: Math.max(insets.bottom, 16) + 24 }, !isFriend && friend && { flexGrow: 1 }]}
      >
        <View style={s.hero}>
          {/* Framsidan av personens kort (bara titta). Ritas när profilen hämtats, annars en tom yta i
              kortets storlek så att sidan inte hoppar. */}
          {friend ? (
            <MemberCard
              width={width - 32}
              readOnly
              disableFlip
              displayName={who}
              isMember={friend.isMember}
              memberSince={friend.memberSince ? format(new Date(friend.memberSince), "MMMM yyyy", { locale: sv }) : null}
              cardColor={friend.cardColor}
              avatarUrl={avatarUrl}
              circleColor={friend.circleColor}
              avatarRing={friend.avatarRing}
              onBuyPress={noop}
            />
          ) : (
            <View style={{ height: (width - 32) * (CARD_H / CARD_W) }} />
          )}

          <View style={s.identityCard}>
            {friend?.username && <Text style={s.meta}>@{friend.username}</Text>}
            {friend?.city && (
              <View style={[s.metaItem, !friend?.username && { marginTop: 0 }]}>
                <MapPin size={12} color="rgba(255,255,255,0.6)" strokeWidth={2} />
                <Text style={s.meta}>{friend.city}</Text>
              </View>
            )}
            {(friend?.username || friend?.city) && <View style={s.identityDivider} />}

            {/* Streak/besök/favoriter — bara riktiga siffror när ni är vänner, annars platshållare.
                Etikett ovanför, ifylld symbol + siffra i en rad under, precis som referensbilden. */}
            <View style={s.identityStats}>
              <IdentityStat
                icon={<StreakFlame compact size={19} />}
                value={isFriend && streak ? (streak.current > 0 ? streak.current : "–") : null}
                label="Streak"
              />
              <View style={s.identityColDivider} />
              <IdentityStat
                icon={<PlacePin height={21} />}
                value={isFriend && stats ? stats.visitsTotal : null}
                label="Besök"
              />
              <View style={s.identityColDivider} />
              <IdentityStat
                icon={<Heart size={19} color={RED} fill={RED} strokeWidth={1.5} />}
                value={isFriend && stats ? stats.favoritesTotal : null}
                label="Favoriter"
              />
            </View>
          </View>
        </View>

        {profileLoading && <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />}

        {isFriend ? (
          <>
            {statsLoading && <ActivityIndicator color={GOLD} style={{ marginTop: 30 }} />}
            {isError && <Text style={s.errorText}>Kunde inte hämta statistik just nu.</Text>}
            {stats && streak && (
              <RealContent
                who={who} stats={stats} streak={streak} topCategory={topCategory} totalPlaces={places.length}
                lists={friendLists} friendId={id!}
              />
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

        {/* Flyttad hit från under namnet — offentlig info oavsett vänskapsstatus */}
        {/* Bara innan ni är vänner är det här okänt terräng — inget skäl att visa det datumet förrän ni faktiskt är vänner */}
        {isFriend && friend?.memberSince && (
          <Text style={s.memberSince}>
            Medlem sedan {format(new Date(friend.memberSince), "MMMM yyyy", { locale: sv })}
          </Text>
        )}
        {/* Bara satt när ni faktiskt är vänner (rpc_get_profile), se friendsSince i useFriends.ts */}
        {isFriend && friend?.friendsSince && (
          <Text style={[s.memberSince, { marginTop: 4 }]}>
            Vänner sedan {format(new Date(friend.friendsSince), "MMMM yyyy", { locale: sv })}
          </Text>
        )}

        {/* Längst ner som en textlänk i stället för en ikonknapp i headern — samma mönster som
            "Ta bort minnet" (app/memories/[id].tsx). Bekräftelsen är fortfarande native Alert,
            precis som resten av appens destruktiva bekräftelser (lists/memories/settings). */}
        {isFriend && (
          <TouchableOpacity style={s.deleteBtn} onPress={confirmRemove} hitSlop={8}>
            <Trash2 size={16} color="#E57373" strokeWidth={2} />
            <Text style={s.deleteText}>Ta bort vän</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Innehåll när ni är vänner: aktivitet, listor, troféer, skatter, statistik ─
// En sektion utan innehåll (inga listor, troféer, skatter …) visas inte alls.

function RealContent({
  who, stats, streak, topCategory, totalPlaces, lists, friendId,
}: {
  who: string; stats: FriendStats; streak: ReturnType<typeof computeStreak>;
  topCategory: ReturnType<typeof computeCategoryStats>[number] | null; totalPlaces: number;
  lists: FriendList[]; friendId: string;
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

      {lists.length > 0 && <ListsRow lists={lists} friendId={friendId} />}
      {stats.trophies.length > 0 && <TrophySection trophies={stats.trophies} />}
      {stats.collectibles.length > 0 && <CollectiblesSection collectibles={stats.collectibles} />}

      <View style={s.section}>
        <Text style={s.sectionTitle}>Statistik</Text>
        <View style={s.statBoxRow}>
          <TopCategoryBox topCategory={topCategory} />
          <VisitedRingBox visitsTotal={stats.visitsTotal} totalPlaces={totalPlaces} />
        </View>
      </View>
    </>
  );
}

// Vännens listor som hen valt att visa för vänner — öppnas på den vanliga listsidan i läget där man
// bara kan titta (app/lists/[id].tsx, view=friend). Samma kort som Mitt Österlens listrad.
function ListsRow({ lists, friendId }: { lists: FriendList[]; friendId: string }) {
  const router = useRouter();
  const { data: places = [] } = usePlaces();
  const imageOf = useMemo(() => {
    const byId = new Map(places.map((p) => [p.id, firstImageUrl(p.image_url)]));
    return (placeIds: number[]) => placeIds.map((pid) => byId.get(pid)).filter((u): u is string => !!u).slice(0, 4);
  }, [places]);

  return (
    <View style={[s.section, { paddingHorizontal: 0 }]}>
      <Text style={[s.sectionTitle, { paddingHorizontal: 16 }]}>Listor</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
        {lists.map((l) => (
          <TouchableOpacity
            key={l.id}
            style={{ width: 140 }}
            activeOpacity={0.8}
            onPress={() => router.push(`/lists/${l.id}?view=friend&owner=${friendId}` as any)}
          >
            <ListCover coverImageUrl={l.coverImageUrl} images={imageOf(l.placeIds)} size={140} />
            <Text style={s.listName} numberOfLines={1}>{l.name}</Text>
            <Text style={s.listSub}>{l.placeIds.length} {l.placeIds.length === 1 ? "plats" : "platser"}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// Horisontell rad med exakt 3 synliga medaljer (samma bredd-räkning som rastret på Utmaningar),
// senast upplåsta först — rpc_friend_stats levererar redan i upplåsningsordning (unlocked_at
// stigande), så vi behöver bara vända listan i stället för att ta med ett eget datumfält.
// Klick öppnar samma sortens beskrivningskort som på den egna Utmaningar-sidan.
function TrophySection({ trophies }: { trophies: FriendStats["trophies"] }) {
  const { width: winW } = useWindowDimensions();
  const [selected, setSelected] = useState<FriendStats["trophies"][number] | null>(null);

  const ordered = useMemo(() => [...trophies].reverse(), [trophies]);

  const pageW = winW - 32; // 16px sidmarginal, samma mönster som s.section/Utmaningar
  const gap = 16;
  const itemWidth = (pageW - gap * 2) / 3;
  const medalSize = Math.round(itemWidth * 0.86);

  const meta = selected ? getTrophyMeta(selected.achievementType, selected.level) : null;

  // Varje medaljs egen glöd (TrophyMedal, inbyggd) bleder ~0.57×medalSize uppåt — utan marginal där
  // klipper den horisontella ScrollViewen av den rakt vid sin egen kant (samma sorts problem som
  // avatarens glöd hade mot headern). Negativ marginTop + lika stor paddingTop tar ut varandra
  // visuellt (medaljerna hamnar exakt där de låg) men ger klippkanten gott om plats att fasa ut i.
  const glowPad = Math.ceil(medalSize * 0.6);

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>Troféer</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={itemWidth + gap}
        style={{ marginTop: -glowPad }}
        contentContainerStyle={{ gap, paddingTop: glowPad }}
      >
        {ordered.map((t, i) => {
          const info = getTrophyMeta(t.achievementType, t.level);
          if (!info) return null;
          return (
            <PressableScale key={i} style={{ width: itemWidth, alignItems: "center" }} scale={0.94} onPress={() => setSelected(t)}>
              <TrophyMedal size={medalSize} tier={t.level} Icon={info.Icon} unlocked groupId={t.achievementType} />
              <Text style={s.trophyLabel} numberOfLines={1}>{info.identity}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setSelected(null)}>
          <Pressable style={s.modalCard} onPress={(e) => e.stopPropagation()}>
            {selected && meta && (
              <>
                <TouchableOpacity style={s.modalClose} onPress={() => setSelected(null)}>
                  <X size={22} color={MUTED} strokeWidth={2} />
                </TouchableOpacity>
                <TrophyMedal size={140} tier={selected.level} Icon={meta.Icon} unlocked groupId={selected.achievementType} />
                <View style={[s.modalRibbon, { backgroundColor: TIER_PALETTE[selected.level].rim }]}>
                  <Text style={s.modalRibbonText}>{meta.levelLabel.toUpperCase()}</Text>
                </View>
                <Text style={s.modalIdentity}>{meta.identity}</Text>
                <Text style={s.modalLevelName}>{meta.levelName}</Text>
                <Text style={s.modalTagline}>{meta.tagline}</Text>
                <View style={s.modalDivider} />
                <Text style={s.modalReq}>{meta.requirementText}</Text>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// Samma sorts horisontella rad som troféerna, fast i en box i stället för direkt på bakgrunden.
// Senast insamlad först (rpc_friend_stats sorterar redan så). Ett tryck visar skatten stort mitt på
// en mörk skärm, med namn, ort och kuriosa — inte kartan (den har ingen tillbaka-pil hit).
function CollectiblesSection({ collectibles }: { collectibles: FriendStats["collectibles"] }) {
  const { width: winW } = useWindowDimensions();
  const { data: all = [] } = useCollectibles();
  const [selected, setSelected] = useState<FriendStats["collectibles"][number] | null>(null);
  const info = selected ? all.find((c) => c.id === selected.id) : null;
  const pageW = winW - 32 - 32; // s.section-marginal (16+16) + boxens egen padding (16+16)
  const gap = 16;
  const itemWidth = (pageW - gap * 2) / 3;
  const artSize = Math.round(itemWidth * 0.6);

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>Skatter</Text>
      <View style={[s.card, { padding: 16 }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={itemWidth + gap}
          contentContainerStyle={{ gap }}
        >
          {collectibles.map((c) => (
            <PressableScale key={c.id} style={{ width: itemWidth, alignItems: "center" }} scale={0.94} onPress={() => setSelected(c)}>
              <StickerArt imagePath={c.imagePath} size={artSize} silhouette={false} />
              <Text style={s.trophyLabel} numberOfLines={2}>{c.name}</Text>
            </PressableScale>
          ))}
        </ScrollView>
      </View>

      <Modal visible={!!selected} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSelected(null)}>
        <Pressable style={s.treasureOverlay} onPress={() => setSelected(null)}>
          {selected && (
            <Reanimated.View entering={ZoomIn.duration(260).easing(REasing.out(REasing.back(1.2)))} style={{ alignItems: "center" }}>
              <StickerArt imagePath={selected.imagePath} size={Math.round(Math.min(winW * 0.72, 300))} silhouette={false} />
              <Text style={s.treasureName}>{selected.name}</Text>
              {info?.town ? <Text style={s.treasureTown}>{info.town}</Text> : null}
              {info?.description ? <Text style={s.treasureText}>{info.description}</Text> : null}
            </Reanimated.View>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Statistik: två boxar bredvid varandra ───────────────────────────────────

function TopCategoryBox({ topCategory }: { topCategory: ReturnType<typeof computeCategoryStats>[number] | null }) {
  const color = topCategory ? CATEGORIES.find((c) => c.id === topCategory.id)?.screen : null;
  return (
    <View style={s.statBox}>
      <View style={{ width: 84, height: 84, alignItems: "center", justifyContent: "center" }}>
        {topCategory && color && <RadialGlow size={84} color={color} opacity={0.35} radiusRatio={1.3} />}
        <View style={[s.categoryCircle, { backgroundColor: color ?? "rgba(255,255,255,0.06)" }]}>
          {topCategory ? (
            <topCategory.Icon size={30} color="#FFFFFF" strokeWidth={2} />
          ) : (
            <Compass size={28} color={MUTED} strokeWidth={2} />
          )}
        </View>
      </View>
      <Text style={s.statBoxLabel} numberOfLines={1}>{topCategory ? topCategory.label : "Inga besök än"}</Text>
      <Text style={s.statBoxCaption}>Mest besökta kategori</Text>
    </View>
  );
}

function VisitedRingBox({ visitsTotal, totalPlaces }: { visitsTotal: number; totalPlaces: number }) {
  const percent = totalPlaces > 0 ? Math.round((visitsTotal / totalPlaces) * 100) : 0;
  return (
    <View style={s.statBox}>
      <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" }}>
        <RadialGlow size={RING_SIZE} color={GOLD} opacity={0.3} radiusRatio={1.3} />
        <ProgressRing percent={percent} centerValue={visitsTotal} />
      </View>
      <Text style={s.statBoxLabel}>{visitsTotal} av {totalPlaces}</Text>
      <Text style={s.statBoxCaption}>Besökta platser</Text>
    </View>
  );
}

// Samma ringdiagram som Statistik-sidans Översikt (app/stats.tsx), fast mindre och med Montserrat
// i stället för Playfair på siffran (Playfair är bara för personnamn i den här filen).
const RING_SIZE = 84, RING_CENTER = 42, RING_R = 35, RING_STROKE = 6;
const RING_CIRC = 2 * Math.PI * RING_R;
const AnimatedSvgCircle = Animated.createAnimatedComponent(SvgCircle);

function ProgressRing({ percent, centerValue }: { percent: number; centerValue: number }) {
  const anim = useRef(new Animated.Value(RING_CIRC)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: RING_CIRC * (1 - percent / 100),
      duration: 1000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [percent]);

  return (
    <Svg width={RING_SIZE} height={RING_SIZE}>
      <SvgCircle cx={RING_CENTER} cy={RING_CENTER} r={RING_R} stroke="rgba(197,160,89,0.12)" strokeWidth={RING_STROKE} fill="none" />
      <AnimatedSvgCircle
        cx={RING_CENTER} cy={RING_CENTER} r={RING_R}
        stroke={GOLD} strokeWidth={RING_STROKE} fill="none" strokeLinecap="round"
        strokeDasharray={RING_CIRC} strokeDashoffset={anim}
        transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
      />
      <SvgText x={RING_CENTER} y={RING_CENTER + 7} textAnchor="middle" fontSize={20} fontFamily="Montserrat_700Bold" fill={FG}>
        {centerValue}
      </SvgText>
    </Svg>
  );
}

function ActivityRow({ who, activity, bordered }: { who: string; activity: FriendActivity; bordered: boolean }) {
  const router = useRouter();
  const date = format(new Date(activity.happenedAt), "HH:mm, d MMM", { locale: sv });
  // Platsen/saken är fetstilt, inte namnet — det är den man faktiskt bryr sig om i en aktivitetslogg
  // (vilken plats, inte vem). Byggd som flera Text-delar (RN slår ihop dem till en rad ändå).
  const verb =
    activity.kind === "visit" ? "besökte" :
    activity.kind === "favorite" ? "lade till" :
    "samlade in";
  const suffix = activity.kind === "favorite" ? " i favoriter" : "";

  // Platsens/eventets image_url är redan en öppen adress och används som den är. Saknas en bild
  // visas kategorins egen ikon. Stickers använder alltid StickerArt — samma lila/guldstjärna-
  // platshållare som resten av appen (Utmaningar, kartan) tills konstfilen finns i Supabase.
  const photoUri = activity.kind === "sticker" ? null : firstImageUrl(activity.imagePath);

  // Besök/favoriter leder till platsens/eventets egen sida (med en riktig tillbaka-pil hit igen).
  // Stickers leder ingenstans — de hör hemma på kartan, som inte har en tillbaka-pil att ta sig
  // därifrån igen.
  const target =
    activity.placeId ? `/place/${activity.placeId}` :
    activity.eventId ? `/event/${activity.eventId}` :
    null;

  const content = (
    <>
      {activity.kind === "sticker" ? (
        // Ingen fyrkantig CARD-platta bakom — StickerArt är redan en egen cirkel, precis som
        // i Samlarobjekt-rutnätet och på kartan.
        <StickerArt imagePath={activity.imagePath} size={44} silhouette={false} />
      ) : photoUri ? (
        <Image source={{ uri: photoUri }} style={s.activityThumb} resizeMode="cover" />
      ) : (
        <View style={s.activityIcon}>
          {activity.kind === "visit" ? <MapPin size={18} color={GOLD} strokeWidth={2} /> : <Heart size={18} color={GOLD} strokeWidth={2} />}
        </View>
      )}
      <View style={s.activityBody}>
        <Text style={s.activityText} numberOfLines={2}>
          {who} {verb} <Text style={s.activityStrong}>{activity.label}</Text>{suffix}
        </Text>
        <Text style={s.activityDate}>{date}</Text>
      </View>
    </>
  );

  // Bara besök/favoriter (har ett mål) får tryckåterkoppling — stickers är inte klickbara alls,
  // se target ovan.
  if (!target) {
    return <View style={[s.activityRow, bordered && s.activityRowBorder]}>{content}</View>;
  }
  // Ingen fördröjning — navigerar direkt (samma känsla som Vänner-knappen på Mitt Österlen), och
  // PressableScales egen ihoptryckning hinner redan synas under själva trycket/hållet.
  return (
    <PressableScale
      style={[s.activityRow, bordered && s.activityRowBorder]}
      scale={0.94}
      onPress={() => router.push(target as any)}
    >
      {content}
    </PressableScale>
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
      {/* Det frostade glaset har inget kvar att sudda ut längst ner (bara tom bakgrund under
          skelettet), så det såg ut att sluta tvärt i en tydlig kant där. Tonar i stället ner mot
          samma bakgrundsfärg där, så övergången aldrig syns som en gräns. */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <SvgGrad id="lockedFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={BG} stopOpacity={0} />
            <Stop offset="65%" stopColor={BG} stopOpacity={0} />
            <Stop offset="100%" stopColor={BG} stopOpacity={1} />
          </SvgGrad>
        </Defs>
        <SvgRect x="0" y="0" width="100%" height="100%" fill="url(#lockedFade)" />
      </Svg>

      <View style={s.lockedCard}>
        {friend.friendStatus === "none" && (
          <GoldButton
            icon={<UserPlus size={17} color={GOLD} strokeWidth={2.2} />}
            label="Lägg till vän"
            disabled={busy}
            onPress={onAdd}
          />
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
              <GoldButton
                style={{ flex: 1 }}
                icon={<Check size={16} color={GOLD} strokeWidth={2.4} />}
                label="Acceptera"
                disabled={busy}
                onPress={onAccept}
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

// Primärknappen (Lägg till vän / Acceptera) — samma mönster som Lägg till vän-knappen i vänlistan
// (app/friends.tsx): ytterkant i guld i stället för helt guldfylld, plus en liten glöd bakom.
// Glödens 48×48-ankare centreras via flexbox i stället för RadialGlows egna -pad-matte (som
// förutsätter en kvadratisk förälder) — knappen är olika bred beroende på läge (ensam eller
// bredvid Neka), aldrig kvadratisk.
function GoldButton({
  icon, label, disabled, onPress, style,
}: { icon: React.ReactNode; label: string; disabled?: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <View style={s.goldGlowAnchor} pointerEvents="none">
        <RadialGlow size={48} color={GOLD} opacity={0.18} radiusRatio={1.4} />
      </View>
      <PressableScale style={s.primaryBtn} disabled={disabled} onPress={onPress}>
        {icon}
        <Text style={s.primaryBtnText}>{label}</Text>
      </PressableScale>
    </View>
  );
}

const s = StyleSheet.create({
  // Samma mönster som Vänner/Mitt Österlen: fast höjd, vänsterställd rubrik i versaler
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  // Samma storlek, form och färg som tillbaka-knappen på Vänner-sidan och resten av appen
  headerBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: {
    flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, color: FG,
    textTransform: "uppercase",
  },

  hero: { alignItems: "center", paddingTop: 16 },

  // Kortet identitetsboxen ligger på — profilbilden (92px, zIndex 2) sticker upp genom det övre
  // hålet (negativ marginTop = halva avatarstorleken), samma överlapp som referensbilden.
  identityCard: {
    alignSelf: "stretch", marginHorizontal: 16, marginTop: 14,
    paddingTop: 18, paddingBottom: 20, paddingHorizontal: 20,
    alignItems: "center", borderRadius: 20,
    backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
  },
  // Användarnamn och ort på var sin rad överst i boxen (namnet står på kortet)
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)" },

  identityDivider: { alignSelf: "stretch", height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.10)", marginTop: 18 },
  identityStats: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", marginTop: 16 },
  identityCol: { flex: 1, alignItems: "center", gap: 6 },
  identityColDivider: { width: StyleSheet.hairlineWidth, height: 34, backgroundColor: "rgba(255,255,255,0.12)" },
  identityLabel: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED },
  // Ifylld symbol till vänster, siffra till höger — samma rad för Streak (lågan), Besök och Favoriter
  identityRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  identityValue: { fontFamily: "Inter_700Bold", fontSize: 17, color: FG },

  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, textAlign: "center", marginTop: 30, paddingHorizontal: 30 },
  // "Medlem sedan ..." längst ner på sidan, efter allt annat innehåll
  memberSince: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, textAlign: "center", marginTop: 32, paddingHorizontal: 30 },
  // Samma mönster som "Ta bort minnet" (app/memories/[id].tsx) — textlänk längst ner, inte en ikonknapp i headern
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8, paddingVertical: 14 },
  deleteText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#E57373" },

  section: { marginTop: 26, paddingHorizontal: 16 },
  // Playfair är bara för namn (personnamn) — sidans/hub-rubriker (Mitt Österlen, Vänner, Förmåner)
  // och sektionsrubriker som den här delar alla samma Montserrat i stället.
  sectionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 16, letterSpacing: -0.2, color: FG, marginBottom: 12 },
  listName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: FG, marginTop: 8 },
  listSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED, marginTop: 1 },
  card: { borderRadius: 16, backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden" },

  activityRow: { flexDirection: "row", alignItems: "flex-start", gap: 13, paddingHorizontal: 16, paddingVertical: 14 },
  activityBody: { flex: 1, minHeight: 44, justifyContent: "space-between" },
  activityRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.08)" },
  activityIcon: {
    width: 44, height: 44, borderRadius: 11, backgroundColor: "rgba(197,160,89,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  // Ett riktigt foto (plats/event) fyller rutan; stickers ritar sin egen cirkel (StickerArt) utan denna platta
  activityThumb: { width: 44, height: 44, borderRadius: 11, backgroundColor: CARD },
  activityText: { fontFamily: "Inter_400Regular", fontSize: 14, color: FG, lineHeight: 19 },
  activityStrong: { fontFamily: "Inter_700Bold" },
  activityDate: { alignSelf: "flex-end", fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED },

  trophyLabel: { fontFamily: "Inter_500Medium", fontSize: 10.5, color: MUTED, textAlign: "center", marginTop: 6 },

  // Beskrivningskortet som öppnas vid klick — samma mönster som troféernas detaljmodal på
  // Utmaningar (app/challenges.tsx), men Montserrat i stället för Playfair på rubriken (Playfair
  // är bara för personnamn i den här appen, se vänprofilens övriga typsnittsbeslut).
  // Skatten i stort: mörk bakgrund, tryck var som helst för att stänga
  treasureOverlay: { flex: 1, backgroundColor: "rgba(8,8,8,0.88)", alignItems: "center", justifyContent: "center", padding: 28 },
  treasureName: { fontFamily: "Montserrat_700Bold", fontSize: 24, color: FG, textAlign: "center", marginTop: 18 },
  treasureTown: { fontFamily: "Inter_500Medium", fontSize: 14, color: MUTED, textAlign: "center", marginTop: 4 },
  treasureText: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22, color: "rgba(245,241,232,0.8)", textAlign: "center", marginTop: 14, maxWidth: 340 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: {
    width: "100%", maxWidth: 340, borderRadius: 24,
    backgroundColor: "#1A1A1A", padding: 24, paddingTop: 32, alignItems: "center",
    borderWidth: 0.5, borderColor: "rgba(197,160,89,0.25)",
  },
  modalClose: {
    position: "absolute", top: 14, right: 14, width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center",
  },
  modalRibbon: { marginTop: 20, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.15)" },
  modalRibbonText: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: "#fdf6e3", letterSpacing: 1.8, textTransform: "uppercase" },
  modalIdentity: { fontFamily: "Montserrat_700Bold", fontSize: 20, letterSpacing: -0.2, color: FG, marginTop: 12, textAlign: "center" },
  modalLevelName: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: GOLD, letterSpacing: 2.2, textTransform: "uppercase", marginTop: 4 },
  modalTagline: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.65)", textAlign: "center", maxWidth: 260, marginTop: 12 },
  modalDivider: { width: 64, height: 1, backgroundColor: "rgba(197,160,89,0.35)", marginVertical: 20 },
  modalReq: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.55)", textAlign: "center" },

  // Statistik: två boxar sida vid sida (mest besökta kategori / besökta platser)
  statBoxRow: { flexDirection: "row", gap: 12 },
  statBox: {
    flex: 1, alignItems: "center", gap: 4, paddingVertical: 20, paddingHorizontal: 12,
    borderRadius: 16, backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden", // rymmer glöden (RadialGlow) snyggt inom kortets rundade form
  },
  // Samma synliga diameter som progressringen bredvid (RING_R 35 + halva RING_STROKE 6 = 38 radie)
  // — annars ser kategori-cirkeln större ut trots att båda ligger i en lika stor 84×84-yta.
  categoryCircle: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  statBoxLabel: { fontFamily: "Inter_700Bold", fontSize: 14, color: FG, marginTop: 10, textAlign: "center" },
  statBoxCaption: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: MUTED, textAlign: "center" },

  lockedWrap: { flex: 1, marginTop: 6 },
  lockedCard: {
    position: "absolute", left: 16, right: 16, top: "45%", transform: [{ translateY: -60 }],
    padding: 16, borderRadius: 18, gap: 12, alignItems: "stretch", overflow: "hidden", // rymmer GoldButtons glöd
    backgroundColor: "rgba(26,26,29,0.75)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
  },
  actionHint: { fontFamily: "Inter_500Medium", fontSize: 13, color: FG, textAlign: "center" },
  // Ytterkant i guld i stället för helt guldfylld — samma mönster som Lägg till vän-knappen i
  // vänlistan (app/friends.tsx). Glöden bakom ligger i GoldButton, se dess goldGlowAnchor.
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 48, borderRadius: 12,
    backgroundColor: "rgba(197,160,89,0.12)", borderWidth: 1.5, borderColor: GOLD,
  },
  primaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: GOLD },
  goldGlowAnchor: { position: "absolute", left: "50%", top: "50%", marginLeft: -24, marginTop: -24, width: 48, height: 48 },
  ghostBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 48, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.20)",
  },
  ghostBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: FG },
});
