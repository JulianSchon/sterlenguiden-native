/**
 * Historik – gold timeline + milestone progress bar
 * Spec: native-subpages-spec.md §3
 */
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, MapPin, Award } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday } from "date-fns";
import { sv } from "date-fns/locale";

const BG    = "#121212";
const CARD  = "#1C1C1C";
const FG    = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD  = "#C5A059";
const BORDER= "rgba(255,255,255,0.06)";

// Milestone thresholds
const MILESTONES = [1, 5, 10, 25, 50, 100] as const;

interface VisitRow {
  id: number;
  visited_at: string;
  place: { id: number; name: string; image_url: string | null; sub_category: string | null } | null;
}

function useVisitHistory() {
  return useQuery<VisitRow[]>({
    queryKey: ["visits-detail"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("visits")
        .select("id, visited_at, places(id, name, image_url, sub_category)")
        .eq("user_id", user.id)
        .order("visited_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, place: r.places ?? null })) as VisitRow[];
    },
  });
}

function dateLabel(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return "Idag";
  if (isYesterday(d)) return "Igår";
  return format(d, "d MMMM yyyy", { locale: sv });
}

function MilestoneBar({ count }: { count: number }) {
  const next = MILESTONES.find((m) => m > count) ?? MILESTONES[MILESTONES.length - 1];
  const prev = [...MILESTONES].reverse().find((m) => m <= count) ?? 0;
  const pct  = prev === next ? 1 : (count - prev) / (next - prev);

  return (
    <View style={ms.wrap}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
        <Text style={ms.label}>Nästa milstolpe</Text>
        <Text style={ms.count}><Text style={ms.curr}>{count}</Text> / {next}</Text>
      </View>
      <View style={ms.track}>
        <View style={[ms.fill, { width: `${Math.min(pct * 100, 100)}%` }]} />
        <View style={[ms.dot, { left: `${Math.min(pct * 100, 100)}%` }]} />
      </View>
      <Text style={ms.nextLabel}>
        {count >= next ? `🏆 Milstolpe nådd!` : `Besök ${next - count} till för att nå ${next} platser`}
      </Text>
    </View>
  );
}

export default function VisitsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: visits = [], isLoading } = useVisitHistory();
  const safeTop = Math.max(insets.top, 44);

  // Group by date label
  const groups: { label: string; items: VisitRow[] }[] = [];
  let curLabel = "";
  visits.forEach((v) => {
    const lbl = dateLabel(v.visited_at);
    if (lbl !== curLabel) { curLabel = lbl; groups.push({ label: lbl, items: [] }); }
    groups[groups.length - 1].items.push(v);
  });

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[vi.header, { paddingTop: safeTop }]}>
        <TouchableOpacity style={vi.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={20} color={FG} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={vi.headerTitle}>Historik</Text>
        <View style={vi.badge}>
          <MapPin size={13} color={GOLD} strokeWidth={1.8} />
          <Text style={vi.badgeText}>{visits.length}</Text>
        </View>
      </View>

      {isLoading && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED }}>Laddar historik…</Text>
        </View>
      )}

      {!isLoading && visits.length === 0 && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 40 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(197,160,89,0.10)", borderWidth: 1, borderColor: "rgba(197,160,89,0.22)", alignItems: "center", justifyContent: "center" }}>
            <MapPin size={28} color={GOLD} strokeWidth={1.5} />
          </View>
          <Text style={{ fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: FG, textAlign: "center" }}>Inga besök ännu</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, textAlign: "center", lineHeight: 21 }}>
            Registrera besök på platser för att bygga din Österlen-historik.
          </Text>
        </View>
      )}

      {!isLoading && visits.length > 0 && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={vi.body}>
          {/* Milestone bar */}
          <MilestoneBar count={visits.length} />

          {/* Timeline */}
          <View style={{ gap: 24 }}>
            {groups.map((group) => (
              <View key={group.label} style={{ gap: 8 }}>
                <Text style={vi.dateLabel}>{group.label}</Text>
                <View style={{ gap: 0 }}>
                  {group.items.map((v, idx) => {
                    const isLast = idx === group.items.length - 1;
                    return (
                      <TouchableOpacity
                        key={v.id}
                        style={vi.timelineRow}
                        onPress={() => v.place && router.push(`/place/${v.place.id}` as any)}
                        activeOpacity={0.82}
                      >
                        {/* Timeline line + dot */}
                        <View style={vi.linePart}>
                          <View style={vi.dot} />
                          {!isLast && <View style={vi.line} />}
                        </View>
                        {/* Card */}
                        <View style={vi.rowCard}>
                          {v.place?.image_url ? (
                            <Image source={{ uri: v.place.image_url }} style={vi.thumb} />
                          ) : (
                            <View style={[vi.thumb, { backgroundColor: "rgba(197,160,89,0.08)", alignItems: "center", justifyContent: "center" }]}>
                              <MapPin size={16} color={GOLD} strokeWidth={1.5} />
                            </View>
                          )}
                          <View style={{ flex: 1, gap: 3 }}>
                            <Text style={vi.placeName} numberOfLines={1}>{v.place?.name ?? "Okänd plats"}</Text>
                            {v.place?.sub_category && (
                              <Text style={vi.placeCat} numberOfLines={1}>{v.place.sub_category}</Text>
                            )}
                            <Text style={vi.time}>{format(new Date(v.visited_at), "HH:mm", { locale: sv })}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const vi = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)",
    backgroundColor: BG,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  headerTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: FG, flex: 1 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(197,160,89,0.12)",
    borderWidth: 1, borderColor: "rgba(197,160,89,0.22)",
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: GOLD },
  body: { padding: 20, gap: 20, paddingBottom: 80 },
  dateLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "rgba(197,160,89,0.75)", letterSpacing: 1.5, textTransform: "uppercase" },
  timelineRow: { flexDirection: "row", gap: 14, paddingBottom: 10 },
  linePart: { width: 20, alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: GOLD, marginTop: 16 },
  line: { flex: 1, width: 1.5, backgroundColor: "rgba(197,160,89,0.25)", marginTop: 4 },
  rowCard: {
    flex: 1, flexDirection: "row", gap: 12,
    backgroundColor: CARD, borderRadius: 16,
    padding: 12, borderWidth: 1, borderColor: BORDER,
  },
  thumb: { width: 52, height: 52, borderRadius: 12 },
  placeName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: FG },
  placeCat: { fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED },
  time: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(197,160,89,0.65)", marginTop: 1 },
});

const ms = StyleSheet.create({
  wrap: { backgroundColor: CARD, borderRadius: 22, padding: 20, borderWidth: 1, borderColor: "rgba(197,160,89,0.18)" },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: MUTED, letterSpacing: 1.5, textTransform: "uppercase" },
  count: { fontFamily: "Inter_400Regular", fontSize: 13, color: MUTED },
  curr: { fontFamily: "Inter_700Bold", fontSize: 16, color: GOLD },
  track: { height: 6, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "visible" },
  fill: { height: 6, backgroundColor: GOLD, borderRadius: 3 },
  dot: {
    position: "absolute", top: -5, marginLeft: -8,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: GOLD, borderWidth: 3, borderColor: CARD,
  },
  nextLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED, marginTop: 10 },
});
