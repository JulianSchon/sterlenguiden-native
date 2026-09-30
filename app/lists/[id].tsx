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
 */
import { useState } from "react";
import {
  View, Text, Image, TouchableOpacity, Alert, Share, ActivityIndicator, StyleSheet,
  useWindowDimensions,
} from "react-native";
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from "react-native-draggable-flatlist";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, MoreHorizontal, X, Plus, Ticket, GripVertical } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import {
  useList, useRemovePlaceFromList, useRemoveMember, useDeleteList, useChangeListCover, useDuplicateList,
  useReorderListPlaces, type ListPlace,
} from "@/hooks/useLists";
import { useOffers } from "@/hooks/useOffers";
import { isPlaceOpen } from "@/hooks/usePlaces";
import { useProfile } from "@/hooks/useProfile";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { usePhotoMenu } from "@/hooks/usePhotoMenu";
import { Avatar } from "@/components/profile/Avatar";
import { ListCover } from "@/components/lists/ListCover";
import { AddPlaceSheet } from "@/components/lists/AddPlaceSheet";
import { InviteMembersSheet } from "@/components/lists/InviteMembersSheet";
import { ListOptionsSheet } from "@/components/lists/ListOptionsSheet";
import { EditListSheet } from "@/components/lists/EditListSheet";
import { MemberAvatarStack } from "@/components/lists/MemberAvatarStack";

const BG = "#121212";
const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";
const CARD = "#1A1A1D";
// Spotify-omslaget ligger INTE kant till kant (det gjorde Lovable-versionen, som Viktor
// uttryckligen inte ville ha) — en stor kvadrat med luft runt om i stället.
const HERO_MARGIN = 28;

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const { user } = useAuth();
  const { data: list, isLoading } = useList(id);
  const { data: offers = [] } = useOffers();
  const { data: profile } = useProfile();
  const avatarUrl = useAvatarUrl();
  const removePlace = useRemovePlaceFromList();
  const removeMember = useRemoveMember();
  const deleteList = useDeleteList();
  const changeCover = useChangeListCover();
  const duplicateList = useDuplicateList();
  const reorderPlaces = useReorderListPlaces();

  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const isOwner = !!list && list.ownerId === user?.id;
  const offerPlaceIds = new Set(offers.map((o) => o.place_id));
  const offersInListCount = list ? list.places.filter((p) => offerPlaceIds.has(p.place.id)).length : 0;

  const openCoverMenu = usePhotoMenu(
    (source) => list ? changeCover.mutateAsync({ listId: list.id, source }) : Promise.resolve(),
    "Byt omslagsbild"
  );

  function confirm(title: string, message: string, action: string, onConfirm: () => void) {
    Alert.alert(title, message, [
      { text: "Avbryt", style: "cancel" },
      { text: action, style: "destructive", onPress: onConfirm },
    ]);
  }

  function shareList() {
    if (!list) return;
    Share.share({
      message: `Gå med i min lista "${list.name}" i Österlenappen. Öppna Mitt Österlen, tryck "Gå med" och skriv in koden ${list.inviteCode}`,
    });
  }

  async function handleDuplicate() {
    if (!list) return;
    const newId = await duplicateList.mutateAsync(list);
    router.replace(`/lists/${newId}` as any);
  }

  function handleDeleteOrLeave() {
    if (!list) return;
    if (isOwner) {
      confirm("Ta bort listan", "Listan och alla platser försvinner för alla medlemmar.", "Ta bort listan", async () => {
        await deleteList.mutateAsync(list.id);
        router.back();
      });
    } else {
      confirm("Lämna listan", "Du kan gå med igen om du får koden.", "Lämna", async () => {
        await removeMember.mutateAsync({ listId: list.id, userId: user!.id });
        router.back();
      });
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: insets.top, backgroundColor: BG }}>
        <View style={s.header}>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{list?.name ?? ""}</Text>
          {list && (
            <TouchableOpacity style={s.headerBtn} onPress={() => setOptionsOpen(true)}>
              <MoreHorizontal size={22} color={FG} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={GOLD} />
      ) : !list ? (
        <Text style={s.notFound}>Listan finns inte längre.</Text>
      ) : (
        <DraggableFlatList
          data={list.places}
          keyExtractor={(lp) => lp.rowId}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 32 }}
          onDragEnd={({ data }) => reorderPlaces.mutate({ listId: list.id, orderedRowIds: data.map((lp) => lp.rowId) })}
          ListHeaderComponent={
            <>
              {/* ── Omslag: stor kvadrat med luft runt om (som Spotifys spellista) ── */}
              <View style={{ alignItems: "center", paddingTop: 8 }}>
                {list.coverImageUrl ? (
                  <Image
                    source={{ uri: list.coverImageUrl }}
                    style={{ width: winW - HERO_MARGIN * 2, height: winW - HERO_MARGIN * 2, borderRadius: 20 }}
                    resizeMode="cover"
                  />
                ) : (
                  <ListCover
                    images={list.places.map((p) => p.place.image_url).filter((u): u is string => !!u).slice(0, 4)}
                    size={winW - HERO_MARGIN * 2}
                    radius={20}
                  />
                )}
              </View>

              <View style={{ paddingHorizontal: 16 }}>
                <Text style={s.title}>{list.name}</Text>
                {list.description ? <Text style={s.description}>{list.description}</Text> : null}

                <View style={{ marginTop: 16 }}>
                  <MemberAvatarStack
                    ringColor={BG}
                    onAddPress={() => setInviteOpen(true)}
                    members={list.members.map((m) => ({
                      userId: m.userId,
                      name: m.name,
                      avatarUri: m.userId === user?.id ? avatarUrl : null,
                      circleColor: m.circleColor,
                      avatarRing: m.avatarRing,
                    }))}
                  />
                </View>

                <Text style={s.meta}>
                  Senast uppdaterad {formatShortDate(list.lastUpdatedAt)} · {list.places.length} {list.places.length === 1 ? "plats" : "platser"}
                  {offersInListCount > 0 ? ` · ${offersInListCount} med Österlenpass` : ""}
                </Text>
              </View>

              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>Platser · {list.places.length}</Text>
                <TouchableOpacity style={s.addBtn} onPress={() => setAddOpen(true)}>
                  <Plus size={16} color={GOLD} strokeWidth={2.5} />
                  <Text style={s.addText}>Lägg till plats</Text>
                </TouchableOpacity>
              </View>
            </>
          }
          ListEmptyComponent={<Text style={s.empty}>Inga platser än. Lägg till den första!</Text>}
          renderItem={({ item, drag, isActive }: RenderItemParams<ListPlace>) => (
            <ScaleDecorator>
              <PlaceRow
                listPlace={item}
                hasOffer={offerPlaceIds.has(item.place.id)}
                isActive={isActive}
                onPress={() => router.push(`/place/${item.place.id}` as any)}
                onDrag={drag}
                onRemove={() =>
                  confirm("Ta bort plats", `Ta bort ${item.place.name} från listan? Det gäller alla medlemmar.`, "Ta bort", () =>
                    removePlace.mutate(item.rowId)
                  )
                }
              />
            </ScaleDecorator>
          )}
        />
      )}

      {list && (
        <>
          <AddPlaceSheet
            visible={addOpen}
            onClose={() => setAddOpen(false)}
            listId={list.id}
            existingPlaceIds={list.places.map((p) => p.place.id)}
          />
          <InviteMembersSheet
            visible={inviteOpen}
            onClose={() => setInviteOpen(false)}
            listId={list.id}
            existingMemberIds={list.members.map((m) => m.userId)}
          />
          <ListOptionsSheet
            visible={optionsOpen}
            onClose={() => setOptionsOpen(false)}
            isOwner={isOwner}
            onChangeCover={() => { setOptionsOpen(false); openCoverMenu(); }}
            onEdit={() => { setOptionsOpen(false); setEditOpen(true); }}
            onShare={() => { setOptionsOpen(false); shareList(); }}
            onDuplicate={() => { setOptionsOpen(false); handleDuplicate(); }}
            onDeleteOrLeave={() => { setOptionsOpen(false); handleDeleteOrLeave(); }}
          />
          <EditListSheet visible={editOpen} onClose={() => setEditOpen(false)} list={list} />
        </>
      )}
    </View>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "long" });
}

function PlaceRow({
  listPlace, hasOffer, isActive, onPress, onDrag, onRemove,
}: {
  listPlace: ListPlace;
  hasOffer: boolean;
  isActive: boolean;
  onPress: () => void;
  onDrag: () => void;
  onRemove: () => void;
}) {
  const { place, addedBy } = listPlace;
  const avatarUrl = useAvatarUrl();
  const open = isPlaceOpen(place.opening_hours);

  return (
    <TouchableOpacity
      style={[s.placeRow, isActive && s.placeRowActive]}
      activeOpacity={0.9}
      onPress={onPress}
      disabled={isActive}
    >
      {place.image_url ? <Image source={{ uri: place.image_url }} style={s.thumb} /> : <View style={s.thumb} />}
      <View style={{ flex: 1, gap: 6 }}>
        <View style={s.addedByRow}>
          <Avatar size={16} uri={addedBy.isMe ? avatarUrl : null} name={addedBy.name} color={addedBy.circleColor ?? "#2A2A2A"} ring={addedBy.avatarRing} />
          <Text style={s.addedByText} numberOfLines={1}>{addedBy.name}</Text>
        </View>
        <Text style={s.placeName} numberOfLines={1}>{place.name}</Text>
        <View style={s.badgeRow}>
          {place.opening_hours && (
            <View style={s.statusBadge}>
              <View style={[s.statusDot, { backgroundColor: open ? "#4ADE80" : "#E57373" }]} />
              <Text style={s.statusText}>{open ? "Öppet" : "Stängt"}</Text>
            </View>
          )}
          {hasOffer && (
            <View style={s.offerBadge}>
              <Ticket size={11} color={GOLD} strokeWidth={2.2} />
              <Text style={s.offerText}>Österlenpass</Text>
            </View>
          )}
        </View>
      </View>
      <View style={{ alignItems: "center", gap: 14 }}>
        <TouchableOpacity hitSlop={12} onPress={onRemove}>
          <X size={20} color={MUTED} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity hitSlop={12} onLongPress={onDrag} delayLongPress={150}>
          <GripVertical size={20} color={MUTED} strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  headerBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  // Playfair bort, versaler in — samma mönster som Vänner/Mitt Österlen
  headerTitle: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, color: FG, textTransform: "uppercase" },
  notFound: { fontFamily: "Inter_400Regular", fontSize: 15, color: MUTED, textAlign: "center", marginTop: 40 },

  title: { fontFamily: "Montserrat_700Bold", fontSize: 26, letterSpacing: -0.3, color: FG, marginTop: 20 },
  description: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, marginTop: 8, lineHeight: 21 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, marginTop: 12 },

  sectionHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 32, marginBottom: 8, paddingHorizontal: 16,
  },
  sectionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 17, letterSpacing: -0.2, color: FG },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  addText: { fontFamily: "Inter_500Medium", fontSize: 13, color: GOLD },
  empty: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, paddingHorizontal: 16 },

  // Större, mer lyxig känsla: tydligare bild, mer luft, en guldton i kanten i stället för en
  // ren grå ram — samma sorts detalj som resten av appens "premium"-kort (Förmåner, Österlenpasset)
  placeRow: {
    flexDirection: "row", alignItems: "center", gap: 14, marginHorizontal: 16, marginBottom: 12,
    padding: 14, borderRadius: 20, backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(197,160,89,0.16)",
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 3,
  },
  placeRowActive: { borderColor: "rgba(197,160,89,0.5)", shadowOpacity: 0.4 },
  thumb: { width: 92, height: 92, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.06)" },
  addedByRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  addedByText: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED },
  placeName: { fontFamily: "Montserrat_700Bold", fontSize: 17, letterSpacing: -0.2, color: FG },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: "Inter_500Medium", fontSize: 11.5, color: MUTED },
  offerBadge: {
    flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
    backgroundColor: "rgba(197,160,89,0.12)", borderWidth: 1, borderColor: "rgba(197,160,89,0.3)",
  },
  offerText: { fontFamily: "Inter_600SemiBold", fontSize: 10.5, color: GOLD },
});
