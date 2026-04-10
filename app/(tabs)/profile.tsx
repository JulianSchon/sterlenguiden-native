import {
  View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Settings, Crown, ChevronRight, Bot, Trophy, BarChart2, ClipboardList,
} from "lucide-react-native";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { usePlaces } from "@/hooks/usePlaces";
import { colors } from "@/lib/colors";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const { data: favorites = [] } = useFavorites();
  const { data: places = [] } = usePlaces();

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "Gäst";
  const isMember = profile?.is_member ?? false;
  const memberSince = profile?.created_at
    ? format(new Date(profile.created_at), "MMMM yyyy", { locale: sv })
    : null;

  const favPlaces = places.filter((p) => favorites.some((f) => f.place_id === p.id));
  const favLogos = favPlaces.filter((p) => p.logo_url).slice(0, 4);
  const favCount = favPlaces.length;

  // Offer images — places with images that are NOT in favorites, as a placeholder for deals
  const offerImages = places.filter((p) => p.image_url && !favorites.some((f) => f.place_id === p.id)).slice(0, 3);

  const handleSignOut = () => {
    Alert.alert("Logga ut", "Är du säker?", [
      { text: "Avbryt", style: "cancel" },
      { text: "Logga ut", style: "destructive", onPress: signOut },
    ]);
  };

  return (
    <SafeAreaView style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>Mitt Österlen</Text>
            <Text style={s.headerSub}>Din personliga guide</Text>
          </View>
          <TouchableOpacity style={s.settingsBtn} onPress={() => router.push("/settings" as any)}>
            <Settings size={20} color={colors.foregroundMuted} />
          </TouchableOpacity>
        </View>

        {/* Member card — navy gradient simulation */}
        <View style={s.memberCard}>
          {/* Background layers for gradient effect */}
          <View style={s.cardBgLayer1} />
          <View style={s.cardBgLayer2} />

          {/* Crown top-right */}
          <View style={s.cardCrownCorner}>
            <Crown size={22} color={colors.gold} />
          </View>

          {/* Avatar */}
          <View style={s.avatarRing}>
            <View style={s.avatar}>
              <Text style={s.avatarInitial}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Name & info */}
          <Text style={s.memberName}>{displayName.toUpperCase()}</Text>
          {memberSince && (
            <Text style={s.memberSince}>Medlem sedan {memberSince}</Text>
          )}
          {isMember ? (
            <TouchableOpacity style={s.passRow}>
              <Crown size={14} color={colors.gold} />
              <Text style={s.passRowText}>Österlenpasset</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.passRow}>
              <Crown size={14} color={colors.gold} />
              <Text style={s.passRowText}>Skaffa Österlenpasset</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick tiles row */}
        <View style={s.tilesRow}>
          {/* Favoriter */}
          <TouchableOpacity style={s.tile} onPress={() => router.push("/favorites" as any)}>
            <Text style={s.tileTitle}>Favoriter</Text>
            <View style={s.tileLogos}>
              {favLogos.length > 0 ? (
                favLogos.map((p) => (
                  <Image key={p.id} source={{ uri: p.logo_url! }} style={s.tileLogo} />
                ))
              ) : (
                <Text style={s.tileEmpty}>Inga favoriter ännu</Text>
              )}
            </View>
          </TouchableOpacity>

          {/* Erbjudanden */}
          <TouchableOpacity style={s.tile}>
            <Text style={s.tileTitle}>Erbjudanden</Text>
            <View style={s.tileLogos}>
              {offerImages.length > 0 ? (
                offerImages.map((p) => (
                  <Image key={p.id} source={{ uri: p.image_url! }} style={s.tileThumb} />
                ))
              ) : (
                <Text style={s.tileEmpty}>Inga erbjudanden</Text>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Stats grid */}
        <View style={s.statsGrid}>
          {/* Left: 2 small icon tiles stacked */}
          <View style={s.statsIconCol}>
            <TouchableOpacity style={s.iconTile}>
              <Bot size={20} color={colors.foregroundMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={s.iconTile}>
              <Trophy size={20} color={colors.foregroundMuted} />
            </TouchableOpacity>
          </View>

          {/* Statistik */}
          <TouchableOpacity style={s.statTile}>
            <BarChart2 size={24} color={colors.foregroundMuted} />
            <Text style={s.statTileLabel}>Statistik</Text>
          </TouchableOpacity>

          {/* Besökshistorik */}
          <TouchableOpacity style={s.statTile}>
            <ClipboardList size={24} color={colors.foregroundMuted} />
            <Text style={s.statTileLabel}>Besökshistorik</Text>
          </TouchableOpacity>
        </View>

        {/* Österlenpasset banner */}
        <TouchableOpacity style={s.passBanner} activeOpacity={0.85}>
          <View style={s.passBannerIcon}>
            <Crown size={24} color={colors.gold} />
          </View>
          <View style={s.passBannerText}>
            <Text style={s.passBannerTitle}>Österlenpasset</Text>
            <Text style={s.passBannerSub}>Din säsongsresa genom Österlen</Text>
          </View>
          <ChevronRight size={20} color={colors.foregroundMuted} />
        </TouchableOpacity>

        {/* Sign out — subtle link at bottom */}
        <TouchableOpacity style={s.signOutRow} onPress={handleSignOut}>
          <Text style={s.signOutText}>Logga ut</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const NAVY = "#0F1D2E";
const NAVY2 = "#162436";

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 48 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 28, fontWeight: "800", color: colors.foreground },
  headerSub: { fontSize: 14, color: colors.foregroundMuted, marginTop: 2 },
  settingsBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.card, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },

  // Member card
  memberCard: {
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: "hidden",
    paddingHorizontal: 24,
    paddingVertical: 28,
    marginBottom: 16,
    alignItems: "flex-start",
    minHeight: 200,
    backgroundColor: NAVY,
  },
  cardBgLayer1: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: NAVY,
  },
  cardBgLayer2: {
    position: "absolute",
    top: -60, right: -60,
    width: 200, height: 200,
    borderRadius: 100,
    backgroundColor: NAVY2,
    opacity: 0.6,
  },
  cardCrownCorner: {
    position: "absolute",
    top: 20, right: 20,
  },
  avatarRing: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 2, borderColor: colors.gold,
    alignItems: "center", justifyContent: "center",
    marginBottom: 16,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#1E3A5A",
    alignItems: "center", justifyContent: "center",
  },
  avatarInitial: { fontSize: 22, fontWeight: "700", color: colors.foreground },
  memberName: {
    fontSize: 18, fontWeight: "800", color: colors.foreground,
    letterSpacing: 3, marginBottom: 6,
  },
  memberSince: { fontSize: 13, color: "rgba(245,240,232,0.55)", marginBottom: 12 },
  passRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  passRowText: { fontSize: 14, fontWeight: "600", color: colors.gold },

  // Quick tiles
  tilesRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    gap: 12,
    marginBottom: 12,
  },
  tile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 100,
  },
  tileTitle: { fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 10 },
  tileLogos: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tileLogo: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: colors.surface,
  },
  tileThumb: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: colors.surface,
  },
  tileEmpty: { fontSize: 11, color: colors.foregroundSubtle },

  // Stats grid
  statsGrid: {
    flexDirection: "row",
    marginHorizontal: 16,
    gap: 12,
    marginBottom: 12,
  },
  statsIconCol: {
    gap: 12,
  },
  iconTile: {
    width: 52, height: 52,
    backgroundColor: colors.card,
    borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  statTile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    alignItems: "center", justifyContent: "center",
    gap: 8,
    borderWidth: 1, borderColor: colors.border,
    minHeight: 116,
  },
  statTileLabel: { fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: "center" },

  // Österlenpasset banner
  passBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#3A2E10",
    gap: 14,
  },
  passBannerIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "#2A200A",
    alignItems: "center", justifyContent: "center",
  },
  passBannerText: { flex: 1 },
  passBannerTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground },
  passBannerSub: { fontSize: 13, color: colors.foregroundMuted, marginTop: 2 },

  signOutRow: { alignItems: "center", paddingVertical: 8 },
  signOutText: { fontSize: 14, color: colors.foregroundSubtle },
});
