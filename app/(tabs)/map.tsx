import { useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Dimensions,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker, Callout, Region, PROVIDER_DEFAULT } from "react-native-maps";
import { useRouter } from "expo-router";
import { MapPin, Navigation, X, SlidersHorizontal } from "lucide-react-native";
import { usePlaces, isPlaceOpen, type Place } from "@/hooks/usePlaces";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Österlen center
const INITIAL_REGION: Region = {
  latitude: 55.6,
  longitude: 14.15,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

const CATEGORIES = [
  { id: "all", label: "Alla" },
  { id: "restaurang", label: "Restaurang" },
  { id: "butiker", label: "Butiker" },
  { id: "natur", label: "Natur" },
  { id: "boende", label: "Boende" },
  { id: "aktiviteter", label: "Aktiviteter" },
];

function markerColor(place: Place): string {
  if (place.business_tier === "premium") return "#C9A84C";
  if (place.business_tier === "partner") return "#2D6A4F";
  return "#6B7280";
}

export default function MapScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [showOpenOnly, setShowOpenOnly] = useState(false);

  const { data: places = [], isLoading } = usePlaces();

  const filtered = useMemo(() => {
    return places.filter((p) => {
      if (!p.lat || !p.lng) return false;
      if (activeCategory !== "all") {
        const cat = p.category?.toLowerCase() ?? "";
        if (!cat.includes(activeCategory.toLowerCase())) return false;
      }
      if (showOpenOnly && !isPlaceOpen(p.opening_hours as Record<string, string> | null)) {
        return false;
      }
      return true;
    });
  }, [places, activeCategory, showOpenOnly]);

  const handleMarkerPress = (place: Place) => {
    setSelectedPlace(place);
    if (place.lat && place.lng) {
      mapRef.current?.animateToRegion(
        {
          latitude: place.lat - 0.01,
          longitude: place.lng,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        },
        400
      );
    }
  };

  const handleNavigate = (place: Place) => {
    if (place.lat && place.lng) {
      const url =
        Platform.OS === "ios"
          ? `maps://?ll=${place.lat},${place.lng}&q=${encodeURIComponent(place.name)}`
          : `geo:${place.lat},${place.lng}?q=${encodeURIComponent(place.name)}`;
      import("react-native").then(({ Linking }) => Linking.openURL(url));
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={INITIAL_REGION}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {filtered.map((place) => (
          <Marker
            key={place.id}
            coordinate={{ latitude: place.lat!, longitude: place.lng! }}
            onPress={() => handleMarkerPress(place)}
            pinColor={markerColor(place)}
          />
        ))}
      </MapView>

      {/* Category filter chips — top */}
      <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
        <FlatList
          data={CATEGORIES}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.chip, activeCategory === item.id && styles.chipActive]}
              onPress={() => setActiveCategory(item.id)}
            >
              <Text style={[styles.chipText, activeCategory === item.id && styles.chipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />

        {/* Open now toggle */}
        <TouchableOpacity
          style={[styles.openToggle, showOpenOnly && styles.openToggleActive]}
          onPress={() => setShowOpenOnly(!showOpenOnly)}
        >
          <SlidersHorizontal size={14} color={showOpenOnly ? "#fff" : "#374151"} />
          <Text style={[styles.openToggleText, showOpenOnly && styles.openToggleTextActive]}>
            Öppet nu
          </Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* Loading */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#2D6A4F" />
        </View>
      )}

      {/* Place card bottom sheet */}
      {selectedPlace && (
        <View style={styles.placeCard}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setSelectedPlace(null)}
          >
            <X size={16} color="#6B7280" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.placeCardInner}
            activeOpacity={0.85}
            onPress={() => router.push(`/place/${selectedPlace.id}` as any)}
          >
            {selectedPlace.image_url ? (
              <Image source={{ uri: selectedPlace.image_url }} style={styles.placeImage} />
            ) : (
              <View style={[styles.placeImage, styles.placeImagePlaceholder]} />
            )}
            <View style={styles.placeInfo}>
              <Text style={styles.placeName} numberOfLines={1}>{selectedPlace.name}</Text>
              {selectedPlace.nearest_town && (
                <View style={styles.locationRow}>
                  <MapPin size={12} color="#6B7280" />
                  <Text style={styles.locationText}>{selectedPlace.nearest_town}</Text>
                </View>
              )}
              {selectedPlace.category && (
                <Text style={styles.placeCategory} numberOfLines={1}>
                  {selectedPlace.category}
                </Text>
              )}
              {selectedPlace.opening_hours && (
                <View style={[
                  styles.openBadge,
                  isPlaceOpen(selectedPlace.opening_hours as Record<string, string>)
                    ? styles.openBadgeOpen
                    : styles.openBadgeClosed,
                ]}>
                  <Text style={[
                    styles.openBadgeText,
                    isPlaceOpen(selectedPlace.opening_hours as Record<string, string>)
                      ? styles.openTextOpen
                      : styles.openTextClosed,
                  ]}>
                    {isPlaceOpen(selectedPlace.opening_hours as Record<string, string>)
                      ? "Öppet"
                      : "Stängt"}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* Navigate button */}
          <TouchableOpacity
            style={styles.navigateButton}
            onPress={() => handleNavigate(selectedPlace)}
          >
            <Navigation size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  topOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 8,
  },
  chips: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  chipActive: { backgroundColor: "#2D6A4F" },
  chipText: { fontSize: 13, color: "#374151", fontWeight: "600" },
  chipTextActive: { color: "#fff" },

  openToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginLeft: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  openToggleActive: { backgroundColor: "#2D6A4F" },
  openToggleText: { fontSize: 13, fontWeight: "600", color: "#374151" },
  openToggleTextActive: { color: "#fff" },

  loadingOverlay: {
    position: "absolute",
    top: "50%",
    alignSelf: "center",
  },

  // Place card
  placeCard: {
    position: "absolute",
    bottom: 32,
    left: 16,
    right: 16,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  closeButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  placeCardInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  placeImage: { width: 72, height: 72, borderRadius: 12 },
  placeImagePlaceholder: { backgroundColor: "#E5E7EB" },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 15, fontWeight: "700", color: "#1B1B1B", marginBottom: 3 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 3 },
  locationText: { fontSize: 12, color: "#6B7280" },
  placeCategory: { fontSize: 12, color: "#9CA3AF", marginBottom: 4 },
  openBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  openBadgeOpen: { backgroundColor: "#D1FAE5" },
  openBadgeClosed: { backgroundColor: "#FEE2E2" },
  openBadgeText: { fontSize: 11, fontWeight: "700" },
  openTextOpen: { color: "#065F46" },
  openTextClosed: { color: "#991B1B" },

  navigateButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2D6A4F",
    alignItems: "center",
    justifyContent: "center",
  },
});
