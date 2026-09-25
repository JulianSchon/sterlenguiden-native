/**
 * En gemensam lista: platser (alla medlemmar kan lägga till och ta bort),
 * kod för att bjuda in fler, och medlemmar. Ägaren kan ta bort medlemmar och
 * hela listan; övriga kan lämna den.
 */
import { useState } from "react";
import {
  View, Text, Image, ScrollView, TouchableOpacity, Alert, Share, ActivityIndicator, StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, X, Share2, Plus } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import {
  useList, useRemovePlaceFromList, useRemoveMember, useDeleteList,
} from "@/hooks/useLists";
import { ListCover } from "@/components/lists/ListCover";
import { AddPlaceSheet } from "@/components/lists/AddPlaceSheet";

const BG = "#121212";
const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD = "#C5A059";
const CARD = "#1A1A1D";

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: list, isLoading } = useList(id);
  const removePlace = useRemovePlaceFromList();
  const removeMember = useRemoveMember();
  const deleteList = useDeleteList();
  const [addOpen, setAddOpen] = useState(false);

  const isOwner = !!list && list.ownerId === user?.id;

  function confirm(title: string, message: string, action: string, onConfirm: () => void) {
    Alert.alert(title, message, [
      { text: "Avbryt", style: "cancel" },
      { text: action, style: "destructive", onPress: onConfirm },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: insets.top, backgroundColor: BG }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={FG} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.title} numberOfLines={1}>{list?.name ?? ""}</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={GOLD} />
      ) : !list ? (
        <Text style={s.notFound}>Listan finns inte längre.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 32 }}>
          <View style={{ alignItems: "center", marginTop: 8 }}>
            <ListCover
              images={list.places.map((p) => p.place.image_url).filter((u): u is string => !!u).slice(0, 4)}
              size={180}
            />
            {list.description ? <Text style={s.description}>{list.description}</Text> : null}
          </View>

          {/* Bjud in */}
          <View style={s.inviteCard}>
            <View style={{ flex: 1 }}>
              <Text style={s.inviteLabel}>KOD FÖR ATT GÅ MED</Text>
              <Text style={s.inviteCode}>{list.inviteCode}</Text>
            </View>
            <TouchableOpacity
              style={s.shareBtn}
              onPress={() =>
                Share.share({
                  message: `Gå med i min lista "${list.name}" i Österlenappen. Öppna Mitt Österlen, tryck "Gå med" och skriv in koden ${list.inviteCode}`,
                })
              }
            >
              <Share2 size={18} color="#121212" strokeWidth={2.2} />
              <Text style={s.shareText}>Dela</Text>
            </TouchableOpacity>
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
            list.places.map(({ rowId, place }) => (
              <View key={rowId} style={s.placeRow}>
                <TouchableOpacity
                  style={s.placeMain}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/place/${place.id}` as any)}
                >
                  {place.image_url ? <Image source={{ uri: place.image_url }} style={s.thumb} /> : <View style={s.thumb} />}
                  <View style={{ flex: 1 }}>
                    <Text style={s.placeName} numberOfLines={1}>{place.name}</Text>
                    {place.nearest_town ? <Text style={s.placeSub} numberOfLines={1}>{place.nearest_town}</Text> : null}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  hitSlop={12}
                  onPress={() =>
                    confirm("Ta bort plats", `Ta bort ${place.name} från listan? Det gäller alla medlemmar.`, "Ta bort", () =>
                      removePlace.mutate(rowId)
                    )
                  }
                >
                  <X size={20} color={MUTED} strokeWidth={2} />
                </TouchableOpacity>
              </View>
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

          {/* Lämna / ta bort */}
          <TouchableOpacity
            style={s.dangerBtn}
            onPress={() =>
              isOwner
                ? confirm("Ta bort listan", "Listan och alla platser försvinner för alla medlemmar.", "Ta bort listan", async () => {
                    await deleteList.mutateAsync(list.id);
                    router.back();
                  })
                : confirm("Lämna listan", "Du kan gå med igen om du får koden.", "Lämna", async () => {
                    await removeMember.mutateAsync({ listId: list.id, userId: user!.id });
                    router.back();
                  })
            }
          >
            <Text style={s.dangerText}>{isOwner ? "Ta bort listan" : "Lämna listan"}</Text>
          </TouchableOpacity>

          <AddPlaceSheet
            visible={addOpen}
            onClose={() => setAddOpen(false)}
            listId={list.id}
            existingPlaceIds={list.places.map((p) => p.place.id)}
          />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  backBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  title: { flex: 1, fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: FG },
  notFound: { fontFamily: "Inter_400Regular", fontSize: 15, color: MUTED, textAlign: "center", marginTop: 40 },
  description: {
    fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, textAlign: "center",
    marginTop: 14, paddingHorizontal: 32, lineHeight: 21,
  },

  inviteCard: {
    flexDirection: "row", alignItems: "center", gap: 12, marginTop: 24, marginHorizontal: 16, padding: 16,
    borderRadius: 16, backgroundColor: CARD, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
  },
  inviteLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.2, color: MUTED },
  inviteCode: { fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: 3, color: FG, marginTop: 4 },
  shareBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: GOLD,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  shareText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#121212" },

  sectionHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 32, marginBottom: 8, paddingHorizontal: 16,
  },
  sectionTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 19, color: FG },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  addText: { fontFamily: "Inter_500Medium", fontSize: 13, color: GOLD },
  empty: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, paddingHorizontal: 16 },

  placeRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  placeMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)" },
  placeName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: FG },
  placeSub: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, marginTop: 1 },

  memberRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 10,
  },
  memberName: { fontFamily: "Inter_500Medium", fontSize: 15, color: FG },
  memberRole: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED },
  dangerSmall: { fontFamily: "Inter_500Medium", fontSize: 13, color: "#E57373" },

  dangerBtn: { alignItems: "center", marginTop: 40, paddingVertical: 14 },
  dangerText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#E57373" },
});
