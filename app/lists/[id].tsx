/**
 * En gemensam lista: platser (alla medlemmar kan lägga till, ta bort och dra om ordningen på),
 * medlemmar (bjuds in via vänlistan eller en kod), ägaren kan byta omslag/redigera/duplicera/radera.
 *
 * Stor Spotify-liknande omslagsbild (kvadrat, med luft runt om — INTE kant till kant, det gjorde
 * Lovable-versionen) i stället för den gamla lilla fyrkantiga ListCover-rutan mitt på sidan —
 * resten av sidans alternativ (byt omslag, dela, duplicera, radera/lämna) ligger i ⋮-menyn.
 *
 * Platslistan är en DraggableFlatList (inte en vanlig ScrollView) så håll-och-dra på greppikonen
 * funkar — sidans övriga innehåll (omslag, titel, medlemmar, "Platser"-rubriken) ligger i dess
 * ListHeaderComponent, annars går det inte att nästla en egen scrollyta i en ScrollView.
 * containerStyle={{ flex: 1 }} krävs på DraggableFlatList självt (annars ärver dess interna
 * FlatList ingen bestämd höjd av sin flex-förälder och man kan inte scrolla hela vägen ner).
 *
 * En väns lista (från vännens profilsida, ?view=friend&owner=…) visas på samma sida, så den ser
 * exakt likadan ut — men bara för att titta: ingen meny, inga medlemmar, ingen "Lägg till plats",
 * ingen dra-och-släpp och inga minus-knappar. Data från useFriendListDetail. I stället finns
 * "Spara en kopia", som gör en egen lista av den.
 */
import { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, Alert, ActionSheetIOS, Platform, Share, ActivityIndicator, StyleSheet,
  Linking, useWindowDimensions,
} from "react-native";
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from "react-native-draggable-flatlist";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, MoreHorizontal, Minus, Plus, Crown, GripVertical, LogOut, Copy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/hooks/useAuth";
import {
  useList, useRemovePlaceFromList, useRemoveMember, useDeleteList, useChangeListCover, useResetListCover,
  useDuplicateList, useReorderListPlaces, useMarkListOpened, useSetListVisibleToFriends, useFriendListDetail, useCopyFriendList, type ListPlace,
} from "@/hooks/useLists";
import { useOffers } from "@/hooks/useOffers";
import { isPlaceOpen } from "@/hooks/usePlaces";
import { Avatar } from "@/components/profile/Avatar";
import { Skeleton } from "@/components/Skeleton";
import { ListCover } from "@/components/lists/ListCover";
import { AddPlaceSheet } from "@/components/lists/AddPlaceSheet";
import { MembersSheet } from "@/components/lists/MembersSheet";
import { ListOptionsSheet } from "@/components/lists/ListOptionsSheet";
import { EditListSheet } from "@/components/lists/EditListSheet";
import { MemberAvatarStack } from "@/components/lists/MemberAvatarStack";
import i18n from "i18next";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/i18n/dates";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { isNetworkError } from "@/lib/network";
import { Image as ExpoImage } from "expo-image";

// Spotify-omslaget ligger INTE kant till kant (det gjorde Lovable-versionen, som Viktor
// uttryckligen inte ville ha) — en stor kvadrat med luft runt om i stället.
const HERO_MARGIN = 36;

export default function ListDetailScreen() {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { id, view, owner } = useLocalSearchParams<{ id: string; view?: string; owner?: string }>();
  // En väns lista: bara titta
  const viewOnly = view === "friend";
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const { user } = useAuth();
  const ownList = useList(viewOnly ? undefined : id);
  const friendList = useFriendListDetail(viewOnly ? id : undefined, owner);
  const { data: list, isLoading } = viewOnly ? friendList : ownList;
  const { data: offers = [] } = useOffers();
  const removePlace = useRemovePlaceFromList();
  const removeMember = useRemoveMember();
  const deleteList = useDeleteList();
  const changeCover = useChangeListCover();
  const resetCover = useResetListCover();
  const duplicateList = useDuplicateList();
  const copyFriendList = useCopyFriendList();
  const reorderPlaces = useReorderListPlaces();
  const markOpened = useMarkListOpened();
  useTranslation(); // ritas om när språket byts

  // Styr bara ordningen i Mitt Österlens listrad (senast öppnad längst till vänster) — inget i
  // den här vyn beror på det.
  useEffect(() => {
    if (id && !viewOnly) markOpened.mutate(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const [addOpen, setAddOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const setVisibleToFriends = useSetListVisibleToFriends();
  const [editOpen, setEditOpen] = useState(false);

  const isOwner = !!list && list.ownerId === user?.id;
  const offerPlaceIds = new Set(offers.map((o) => o.place_id));

  // Egen meny i stället för delade usePhotoMenu — den har bara Välj bild/Ta foto, men en lista
  // behöver ett tredje alternativ ("Återställ") som inte betyder något för de andra ställena
  // usePhotoMenu används (konto-avatar, passkortet): det finns inget "automatiskt collage" att
  // gå tillbaka till där.
  async function runCoverPick(source: "library" | "camera") {
    if (!list) return;
    try {
      await changeCover.mutateAsync({ listId: list.id, source });
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (message === "camera_denied") {
        Alert.alert(i18n.t("lists.cameraOffTitle"), i18n.t("lists.cameraOffText"), [
          { text: i18n.t("lists.cancel"), style: "cancel" },
          { text: i18n.t("lists.openSettings"), onPress: () => Linking.openSettings() },
        ]);
      } else {
        const text = i18n.t("lists.coverFailed");
        Alert.alert(i18n.t("lists.errorTitle"), __DEV__ && message ? `${text}\n\n${message}` : text);
      }
    }
  }

  function openCoverMenu() {
    if (!list) return;
    const hasCustomCover = !!list.coverImageUrl;
    const pick = i18n.t("lists.pickImage");
    const photo = i18n.t("lists.takePhoto");
    const reset = i18n.t("lists.resetCollage");
    const cancel = i18n.t("lists.cancel");
    const options = hasCustomCover ? [pick, photo, reset, cancel] : [pick, photo, cancel];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1 }, (index) => {
        if (index === 0) runCoverPick("library");
        if (index === 1) runCoverPick("camera");
        if (hasCustomCover && index === 2) resetCover.mutate(list.id);
      });
    } else {
      Alert.alert(i18n.t("lists.changeCover"), undefined, [
        { text: pick, onPress: () => runCoverPick("library") },
        { text: photo, onPress: () => runCoverPick("camera") },
        ...(hasCustomCover ? [{ text: reset, onPress: () => resetCover.mutate(list.id) }] : []),
        { text: cancel, style: "cancel" as const },
      ]);
    }
  }

  // Stänga ⋮-menyn och i SAMMA anrop öppna nästa (ActionSheetIOS/Alert/Share, eller ett eget
  // Sheet) frös appen — två modaler som tävlar om att presenteras/stängas samtidigt är ett känt
  // sätt att låsa sig på både iOS och Android. Vänta tills stängningen (vår egen 200 ms
  // avtoningsanimation i Sheet.tsx) faktiskt hunnit klart innan nästa får öppna.
  function afterOptionsClose(action: () => void) {
    setOptionsOpen(false);
    setTimeout(action, 260);
  }

  function confirm(title: string, message: string, action: string, onConfirm: () => void) {
    Alert.alert(title, message, [
      { text: i18n.t("lists.cancel"), style: "cancel" },
      { text: action, style: "destructive", onPress: onConfirm },
    ]);
  }

  function shareList() {
    if (!list) return;
    Share.share({
      message: i18n.t("lists.shareMessage", { name: list.name, code: list.inviteCode }),
    });
  }

  async function handleCopyFriendList() {
    if (!list || copyFriendList.isPending) return;
    try {
      const newId = await copyFriendList.mutateAsync(list);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace(`/lists/${newId}`);
    } catch {
      Alert.alert(i18n.t("lists.errorTitle"), i18n.t("lists.copyFailed"));
    }
  }

  /** Utan nät har appen redan sagt det (OfflineNotice); annars ett kort "något gick fel" */
  function failed(e: unknown) {
    if (!isNetworkError(e)) Alert.alert(i18n.t("lists.errorTitle"));
  }

  async function handleDuplicate() {
    if (!list) return;
    try {
      const newId = await duplicateList.mutateAsync(list);
      router.replace(`/lists/${newId}`);
    } catch (e) {
      failed(e);
    }
  }

  function handleDeleteOrLeave() {
    if (!list) return;
    if (isOwner) {
      confirm(i18n.t("lists.deleteTitle"), i18n.t("lists.deleteText"), i18n.t("lists.deleteTitle"), async () => {
        try {
          await deleteList.mutateAsync(list.id);
          router.back();
        } catch (e) {
          failed(e);
        }
      });
    } else {
      confirm(i18n.t("lists.leave"), i18n.t("lists.leaveText"), i18n.t("lists.leaveAction"), async () => {
        try {
          await removeMember.mutateAsync({ listId: list.id, userId: user!.id });
          router.back();
        } catch (e) {
          failed(e);
        }
      });
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.bg }}>
        <View style={s.header}>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.back()} accessibilityLabel={i18n.t("lists.back")}>
            <ArrowLeft size={24} color={colors.text} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{list?.name ?? ""}</Text>
          {list && !viewOnly && (
            isOwner ? (
              <TouchableOpacity style={s.headerBtn} onPress={() => setOptionsOpen(true)} accessibilityLabel={i18n.t("lists.options")}>
                <MoreHorizontal size={22} color={colors.text} strokeWidth={2} />
              </TouchableOpacity>
            ) : (
              // Inbjuden medlem, inte ägare: ⋮-menyns enda alternativ som gällde dem var ändå
              // bara "Lämna listan" (Byt omslag/Redigera är redan ägar-låsta) — en direktknapp
              // i stället för att gömma den enda relevanta handlingen bakom en meny.
              <TouchableOpacity style={s.headerBtn} onPress={handleDeleteOrLeave} accessibilityLabel={i18n.t("lists.leave")}>
                <LogOut size={20} color={colors.text} strokeWidth={2} />
              </TouchableOpacity>
            )
          )}
        </View>
      </View>

      {isLoading ? (
        // Listan i grått medan den laddas: omslaget, namnet och platserna
        <View pointerEvents="none">
          <View style={{ alignItems: "center", paddingTop: 8 }}>
            <Skeleton width={winW - HERO_MARGIN * 2} height={winW - HERO_MARGIN * 2} radius={20} />
          </View>
          <View style={{ paddingHorizontal: 16 }}>
            <Skeleton width="60%" height={28} radius={8} style={{ marginTop: 20 }} />
            <Skeleton width={150} height={11} radius={4} style={{ marginTop: 14 }} />
          </View>
          <View style={s.sectionHead}>
            <Skeleton width={100} height={17} radius={5} />
          </View>
          {[0, 1].map((i) => (
            <View key={i} style={[s.placeRow, { shadowOpacity: 0 }]}>
              <Skeleton width={92} height={92} radius={16} />
              <View style={{ flex: 1, gap: 9, paddingTop: 4 }}>
                <Skeleton width="40%" height={11} radius={4} />
                <Skeleton width="75%" height={16} radius={5} />
                <Skeleton width="55%" height={11} radius={4} />
              </View>
            </View>
          ))}
        </View>
      ) : !list ? (
        <Text style={s.notFound}>{i18n.t("lists.notFound")}</Text>
      ) : (
        <DraggableFlatList
          containerStyle={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          data={list.places}
          keyExtractor={(lp) => lp.rowId}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 32 }}
          onDragEnd={({ data }) => !viewOnly && reorderPlaces.mutate({ listId: list.id, orderedRowIds: data.map((lp) => lp.rowId) })}
          ListHeaderComponent={
            <>
              {/* ── Omslag: stor kvadrat med luft runt om (som Spotifys spellista) ── */}
              <View style={{ alignItems: "center", paddingTop: 8 }}>
                <ListCover
                  coverImageUrl={list.coverImageUrl}
                  images={list.places.map((p) => p.place.image_url).filter((u): u is string => !!u).slice(0, 4)}
                  size={winW - HERO_MARGIN * 2}
                  radius={20}
                />
              </View>

              <View style={{ paddingHorizontal: 16 }}>
                <Text style={s.title}>{list.name}</Text>

                {!viewOnly && <View style={{ marginTop: 16 }}>
                  {/* Alla kan trycka på avatarerna och se medlemmarna; bara ägaren kan bjuda in (+) */}
                  <MemberAvatarStack
                    ringColor={colors.bg}
                    onPress={() => setMembersOpen(true)}
                    onAddPress={isOwner ? () => setMembersOpen(true) : undefined}
                    members={list.members.map((m) => ({
                      userId: m.userId,
                      name: m.name,
                      avatarPath: m.avatarPath,
                      circleColor: m.circleColor,
                      avatarRing: m.avatarRing,
                      pending: m.pending,
                    }))}
                  />
                </View>}

                {/* Beskrivning: en riktig text om listan, tydligt skild från statistikraden nedanför */}
                {list.description ? <Text style={s.description}>{list.description}</Text> : null}

                {/* En väns lista: gör en egen kopia att ändra i */}
                {viewOnly && (
                  <TouchableOpacity style={s.copyBtn} onPress={handleCopyFriendList} activeOpacity={0.8} disabled={copyFriendList.isPending}>
                    {copyFriendList.isPending
                      ? <ActivityIndicator color={colors.goldText} size="small" />
                      : <Copy size={16} color={colors.goldText} strokeWidth={2.2} />}
                    <Text style={s.copyText}>{i18n.t("lists.saveCopy")}</Text>
                  </TouchableOpacity>
                )}

                <Text style={s.meta}>
                  {i18n.t("lists.updated", { date: formatDate(list.lastUpdatedAt, "d MMMM") })} · {list.places.length === 1 ? i18n.t("lists.placesOne") : i18n.t("lists.placesOther", { count: list.places.length })}
                </Text>
              </View>

              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>{i18n.t("lists.placesTitle", { count: list.places.length })}</Text>
                {!viewOnly && (
                  <TouchableOpacity style={s.addBtn} onPress={() => setAddOpen(true)}>
                    <Plus size={16} color={colors.goldText} strokeWidth={2.5} />
                    <Text style={s.addText}>{i18n.t("lists.addPlace")}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          }
          ListEmptyComponent={<Text style={s.empty}>{i18n.t(viewOnly ? "lists.emptyView" : "lists.empty")}</Text>}
          renderItem={({ item, drag, isActive }: RenderItemParams<ListPlace>) => (
            <ScaleDecorator>
              <PlaceRow
                listPlace={item}
                hasOffer={offerPlaceIds.has(item.place.id)}
                isActive={isActive}
                viewOnly={viewOnly}
                onPress={() => router.push(`/place/${item.place.id}?from=lists`)}
                onDrag={drag}
                onRemove={() =>
                  confirm(i18n.t("lists.removePlaceTitle"), i18n.t("lists.removePlaceText", { name: item.place.name }), i18n.t("lists.remove"), () =>
                    removePlace.mutate(item.rowId)
                  )
                }
              />
            </ScaleDecorator>
          )}
        />
      )}

      {list && !viewOnly && (
        <>
          <AddPlaceSheet
            visible={addOpen}
            onClose={() => setAddOpen(false)}
            listId={list.id}
            listName={list.name}
            existingPlaceIds={list.places.map((p) => p.place.id)}
          />
          <MembersSheet
            visible={membersOpen}
            onClose={() => setMembersOpen(false)}
            listId={list.id}
            isOwner={isOwner}
            members={list.members}
          />
          <ListOptionsSheet
            visible={optionsOpen}
            onClose={() => setOptionsOpen(false)}
            visibleToFriends={list.visibleToFriends}
            onToggleVisibleToFriends={(visible) => setVisibleToFriends.mutate({ listId: list.id, visible })}
            onChangeCover={() => afterOptionsClose(openCoverMenu)}
            onEdit={() => afterOptionsClose(() => setEditOpen(true))}
            onShare={() => afterOptionsClose(shareList)}
            onDuplicate={() => afterOptionsClose(handleDuplicate)}
            onDelete={() => afterOptionsClose(handleDeleteOrLeave)}
          />
          <EditListSheet visible={editOpen} onClose={() => setEditOpen(false)} list={list} />
        </>
      )}
    </View>
  );
}

function PlaceRow({
  listPlace, hasOffer, isActive, viewOnly, onPress, onDrag, onRemove,
}: {
  listPlace: ListPlace;
  hasOffer: boolean;
  isActive: boolean;
  /** En väns lista: inga dra- eller ta bort-knappar */
  viewOnly: boolean;
  onPress: () => void;
  onDrag: () => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { place, addedBy } = listPlace;
  const open = isPlaceOpen(place.opening_hours);

  return (
    <TouchableOpacity
      style={[s.placeRow, isActive && s.placeRowActive]}
      activeOpacity={0.9}
      onPress={onPress}
      disabled={isActive}
    >
      {place.image_url ? <ExpoImage source={{ uri: place.image_url }} style={s.thumb} contentFit="cover" /> : <View style={s.thumb} />}
      {/* Tre våningar som fyller bildens höjd: vem + Österlenpasset överst, namnet i mitten,
          ort + öppet/stängt underst — i stället för fem rader staplade tätt på varandra */}
      <View style={s.placeBody}>
        <View style={s.topLine}>
          <View style={s.addedByRow}>
            <Avatar size={16} path={addedBy.avatarPath} name={addedBy.name} color={addedBy.circleColor ?? colors.fill} ring={addedBy.avatarRing} />
            <Text style={s.addedByText} numberOfLines={1}>{addedBy.name}</Text>
          </View>
          {hasOffer && (
            <View style={s.offerBadge}>
              <Crown size={11} color={colors.goldText} strokeWidth={2.2} />
              <Text style={s.offerText}>{i18n.t("pass.title")}</Text>
            </View>
          )}
        </View>
        <Text style={s.placeName} numberOfLines={2}>{place.name}</Text>
        <View style={s.bottomLine}>
          {place.nearest_town ? <Text style={s.townText} numberOfLines={1}>{place.nearest_town}</Text> : <View />}
          {place.opening_hours && (
            <View style={s.statusBadge}>
              <View style={[s.statusDot, { backgroundColor: open ? "#4ADE80" : "#E57373" }]} />
              <Text style={s.statusText}>{i18n.t(open ? "lists.open" : "lists.closed")}</Text>
            </View>
          )}
        </View>
      </View>
      {!viewOnly && (<>
        <TouchableOpacity hitSlop={12} onLongPress={onDrag} delayLongPress={150} style={s.dragHandle} accessibilityLabel={i18n.t("lists.move")}>
          <GripVertical size={20} color={colors.muted} strokeWidth={2} />
        </TouchableOpacity>

        <TouchableOpacity hitSlop={10} onPress={onRemove} style={s.removeBadge} accessibilityLabel={i18n.t("lists.removeA11y", { name: place.name })}>
          <Minus size={14} color="#fff" strokeWidth={3} />
        </TouchableOpacity>
      </>)}
    </TouchableOpacity>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  headerBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: c.fill, borderWidth: 1, borderColor: c.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  // Playfair bort, versaler in — samma mönster som Vänner/Mitt Österlen
  headerTitle: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, color: c.text, textTransform: "uppercase" },
  notFound: { fontFamily: "Inter_400Regular", fontSize: 15, color: c.muted, textAlign: "center", marginTop: 40 },

  title: { fontFamily: "Montserrat_700Bold", fontSize: 26, letterSpacing: -0.3, color: c.text, marginTop: 20 },
  // Klart större och ljusare än meta-raden nedanför — beskrivningen är text om listan,
  // meta-raden är bara statistik, de ska inte läsas som samma sorts information.
  description: { fontFamily: "Inter_500Medium", fontSize: 15.5, color: c.text, marginTop: 16, lineHeight: 22 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 12, color: c.muted, marginTop: 10 },
  // "Spara en kopia" på en väns lista — guldkant, samma guld som "Lägg till plats"
  copyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, alignSelf: "flex-start",
    marginTop: 16, height: 42, paddingHorizontal: 18, borderRadius: 21,
    borderWidth: 1.5, borderColor: c.gold, backgroundColor: c.goldSoft,
  },
  copyText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.goldText },

  sectionHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 32, marginBottom: 8, paddingHorizontal: 16,
  },
  sectionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 17, letterSpacing: -0.2, color: c.text },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  addText: { fontFamily: "Inter_500Medium", fontSize: 13, color: c.goldText },
  empty: { fontFamily: "Inter_400Regular", fontSize: 14, color: c.muted, paddingHorizontal: 16 },

  // Större, mer lyxig känsla: tydligare bild, mer luft, en guldton i kanten i stället för en
  // ren grå ram — samma sorts detalj som resten av appens "premium"-kort (Förmåner, Österlenpasset)
  // alignItems: flex-start (inte center) så namn/avatar hamnar högst upp i raden, i linje med bildens topp
  placeRow: {
    position: "relative",
    flexDirection: "row", alignItems: "flex-start", gap: 14, marginHorizontal: 16, marginBottom: 14,
    padding: 14, borderRadius: 20, backgroundColor: c.card, borderWidth: 0.5, borderColor: c.goldSoft,
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 3,
  },
  placeRowActive: { borderColor: c.goldBorder, shadowOpacity: 0.4 },
  thumb: { width: 92, height: 92, borderRadius: 16, backgroundColor: c.fill },
  placeBody: { flex: 1, minHeight: 92, justifyContent: "space-between", gap: 6 },
  topLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  bottomLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  addedByRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  addedByText: { flexShrink: 1, fontFamily: "Inter_400Regular", fontSize: 12.5, color: c.muted },
  placeName: { fontFamily: "Montserrat_700Bold", fontSize: 16, lineHeight: 20, letterSpacing: -0.2, color: c.text },
  townText: { flexShrink: 1, fontFamily: "Inter_400Regular", fontSize: 12.5, color: c.muted },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: "Inter_500Medium", fontSize: 11.5, color: c.muted },
  offerBadge: {
    flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
    backgroundColor: c.goldSoft, borderWidth: 1, borderColor: c.goldBorder,
  },
  offerText: { fontFamily: "Inter_600SemiBold", fontSize: 10.5, color: c.goldText },

  dragHandle: { alignSelf: "center", paddingLeft: 2 },
  // Röd "ta bort"-badge som hänger i övre högra hörnet av kortet, i stället för ett krysspar mitt i raden
  removeBadge: {
    position: "absolute", top: -8, right: -8, width: 24, height: 24, borderRadius: 12,
    backgroundColor: "#E5484D", alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: c.bg,
  },
});
