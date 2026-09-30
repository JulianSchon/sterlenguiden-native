/**
 * En gemensam lista: platser (alla medlemmar kan lägga till och ta bort), medlemmar (bjuds in via
 * vänlistan eller en kod), ägaren kan byta omslag/redigera/duplicera/radera.
 *
 * Stor Spotify-liknande header (kant till kant, tonar ner mot bakgrunden) i stället för den gamla
 * lilla fyrkantiga ListCover-rutan mitt på sidan — resten av sidans alternativ (byt omslag, dela,
 * duplicera, radera/lämna) ligger nu i ⋮-menyn i stället för utspridda knappar på sidan.
 */
import { useState } from "react";
import {
  View, Text, Image, ScrollView, TouchableOpacity, Alert, Share, ActivityIndicator, StyleSheet,
  useWindowDimensions,
} from "react-native";
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect as SvgRect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, MoreHorizontal, X, Plus, Ticket } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import {
  useList, useRemovePlaceFromList, useRemoveMember, useDeleteList, useChangeListCover, useDuplicateList,
} from "@/hooks/useLists";
import { useOffers } from "@/hooks/useOffers";
import { isPlaceOpen } from "@/hooks/usePlaces";
import { useProfile } from "@/hooks/useProfile";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { usePhotoMenu } from "@/hooks/usePhotoMenu";
import { Avatar } from "@/components/profile/Avatar";
import { PressableScale } from "@/components/PressableScale";
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
const HERO_H = 280;

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
        <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 32 }}>
          {/* ── Header: stor bild kant till kant, tonar ner mot bakgrunden ── */}
          <View style={{ width: winW, height: HERO_H }}>
            {list.coverImageUrl ? (
              <Image source={{ uri: list.coverImageUrl }} style={{ width: winW, height: HERO_H }} resizeMode="cover" />
            ) : (
              <ListCover
                images={list.places.map((p) => p.place.image_url).filter((u): u is string => !!u).slice(0, 4)}
                width={winW}
                height={HERO_H}
                radius={0}
              />
            )}
            <Svg width={winW} height={HERO_H * 0.55} style={{ position: "absolute", left: 0, bottom: 0 }} pointerEvents="none">
              <Defs>
                <SvgGrad id="heroFade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={BG} stopOpacity={0} />
                  <Stop offset="100%" stopColor={BG} stopOpacity={1} />
                </SvgGrad>
              </Defs>
              <SvgRect x="0" y="0" width={winW} height={HERO_H * 0.55} fill="url(#heroFade)" />
            </Svg>
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

          {/* Platser */}
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Platser · {list.places.length}</Text>
            <TouchableOpacity style={s.addBtn} onPress={() => setAddOpen(true)}>
              <Plus size={16} color={GOLD} strokeWidth={2.5} />
              <Text style={s.addText}>Lägg till plats</Text>
            </TouchableOpacity>
          </View>

          {list.places.length === 0 ? (
            <Text style={s.empty}>Inga platser än. Lägg till den första!</Text>
          ) : (
            list.places.map((lp) => (
              <PlaceRow
                key={lp.rowId}
                listPlace={lp}
                hasOffer={offerPlaceIds.has(lp.place.id)}
                onPress={() => router.push(`/place/${lp.place.id}` as any)}
                onRemove={() =>
                  confirm("Ta bort plats", `Ta bort ${lp.place.name} från listan? Det gäller alla medlemmar.`, "Ta bort", () =>
                    removePlace.mutate(lp.rowId)
                  )
                }
              />
            ))
          )}

          {/* Medlemmar */}
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Medlemmar · {list.members.length}</Text>
          </View>
          {list.members.map((m) => (
            <View key={m.userId} style={s.memberRow}>
              <Text style={s.memberName}>
                {m.name}
                {m.userId === user?.id ? " (du)" : ""}
              </Text>
              {m.role === "owner" ? (
                <Text style={s.memberRole}>Ägare</Text>
              ) : isOwner ? (
                <TouchableOpacity
                  onPress={() =>
                    confirm("Ta bort medlem", `Ta bort ${m.name} från listan?`, "Ta bort", () =>
                      removeMember.mutate({ listId: list.id, userId: m.userId })
                    )
                  }
                >
                  <Text style={s.dangerSmall}>Ta bort</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}

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
        </ScrollView>
      )}
    </View>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "long" });
}

function PlaceRow({
  listPlace, hasOffer, onPress, onRemove,
}: {
  listPlace: { rowId: string; addedBy: { name: string; isMe: boolean; circleColor: string | null; avatarRing: string | null }; place: { id: number; name: string; image_url: string | null; opening_hours: Record<string, string> | null } };
  hasOffer: boolean;
  onPress: () => void;
  onRemove: () => void;
}) {
  const { place, addedBy } = listPlace;
  const avatarUrl = useAvatarUrl();
  const open = isPlaceOpen(place.opening_hours);

  return (
    <PressableScale style={s.placeRow} scale={0.985} onPress={onPress}>
      {place.image_url ? <Image source={{ uri: place.image_url }} style={s.thumb} /> : <View style={s.thumb} />}
      <View style={{ flex: 1, gap: 5 }}>
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
      <TouchableOpacity hitSlop={12} onPress={onRemove}>
        <X size={20} color={MUTED} strokeWidth={2} />
      </TouchableOpacity>
    </PressableScale>
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

  title: { fontFamily: "Montserrat_700Bold", fontSize: 26, letterSpacing: -0.3, color: FG, marginTop: 16 },
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

  placeRow: {
    flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginBottom: 10,
    padding: 10, borderRadius: 16, backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
  },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)" },
  addedByRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  addedByText: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: MUTED },
  placeName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: FG },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: "Inter_500Medium", fontSize: 11.5, color: MUTED },
  offerBadge: {
    flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
    backgroundColor: "rgba(197,160,89,0.12)", borderWidth: 1, borderColor: "rgba(197,160,89,0.3)",
  },
  offerText: { fontFamily: "Inter_600SemiBold", fontSize: 10.5, color: GOLD },

  memberRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 10,
  },
  memberName: { fontFamily: "Inter_500Medium", fontSize: 15, color: FG },
  memberRole: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED },
  dangerSmall: { fontFamily: "Inter_500Medium", fontSize: 13, color: "#E57373" },
});
