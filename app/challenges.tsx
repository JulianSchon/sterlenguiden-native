/**
 * Utmaningar – 3 tabs (Aktiva | Klara | Troféer) + challenge cards
 * Spec: native-subpages-spec.md §5
 */
import { useState, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Animated, Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Trophy, Star, Lock } from "lucide-react-native";
import { useAchievements } from "@/hooks/useAchievements";
import { useVisits } from "@/hooks/useVisits";

const BG    = "#121212";
const CARD  = "#1C1C1C";
const FG    = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.55)";
const GOLD  = "#C5A059";
const BORDER= "rgba(255,255,255,0.06)";

const SW = Dimensions.get("window").width;
const TAB_COUNT = 3;
const TAB_W = (SW - 32) / TAB_COUNT;
const IND_W = TAB_W * 0.55;

const TABS = ["Aktiva", "Klara", "Troféer"] as const;

// ─── Static challenge catalogue ───────────────────────────────────────────────
interface Challenge {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  requirement: number;  // visits needed
  reward: string;
}

const CHALLENGES: Challenge[] = [
  { id: "first_step",    emoji: "👣",  title: "Första steget",    desc: "Registrera ditt första besök på Österlen.",            requirement: 1,   reward: "Österlenvandrare" },
  { id: "explorer_5",    emoji: "🧭",  title: "Utforskare",       desc: "Besök 5 olika platser.",                               requirement: 5,   reward: "Skånsk Utforskare" },
  { id: "local_10",      emoji: "🌻",  title: "Lokalinvånare",    desc: "Besök 10 platser på Österlen.",                        requirement: 10,  reward: "Hedersösterlenbo" },
  { id: "devoted_25",    emoji: "🏔️", title: "Hängiven vandrare", desc: "Besök 25 platser på Österlen.",                        requirement: 25,  reward: "Backpacker" },
  { id: "century_100",   emoji: "🏆",  title: "Österlenlegend",   desc: "Besök 100 platser. Du är en legend.",                  requirement: 100, reward: "Österlenlegend" },
  { id: "secret_beach",  emoji: "🏖️", title: "Strandälskaren",   desc: "Besök en strand och en annan vattennära plats.",       requirement: 2,   reward: "Sandkorn" },
];

// ─── Trophies catalogue ───────────────────────────────────────────────────────
interface Trophy {
  id: string;
  emoji: string;
  name: string;
  rarity: "brons" | "silver" | "guld" | "platina";
}

const TROPHY_COLOURS = { brons: "#B87333", silver: "#A8A8A8", guld: GOLD, platina: "#D8D8FF" };

const TROPHIES: Trophy[] = [
  { id: "first_step",   emoji: "👣",  name: "Österlenvandrare",  rarity: "brons"  },
  { id: "explorer_5",   emoji: "🧭",  name: "Skånsk Utforskare", rarity: "silver" },
  { id: "local_10",     emoji: "🌻",  name: "Hedersösterlenbo",  rarity: "silver" },
  { id: "devoted_25",   emoji: "🏔️", name: "Backpacker",        rarity: "guld"   },
  { id: "century_100",  emoji: "🏆",  name: "Österlenlegend",    rarity: "platina" },
  { id: "secret_beach", emoji: "🏖️", name: "Sandkorn",          rarity: "brons"  },
];

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function ChallengeTabBar({ active, onSelect }: { active: number; onSelect: (i: number) => void }) {
  const [indAnim] = useState(new Animated.Value(active * TAB_W + (TAB_W - IND_W) / 2));

  const goTo = (i: number) => {
    Animated.spring(indAnim, { toValue: i * TAB_W + (TAB_W - IND_W) / 2, useNativeDriver: false, speed: 16, bounciness: 3 }).start();
    onSelect(i);
  };

  return (
    <View style={ct.tabBar}>
      <Animated.View style={[ct.indicator, { left: indAnim, width: IND_W }]} />
      {TABS.map((label, i) => (
        <TouchableOpacity key={label} style={ct.tab} onPress={() => goTo(i)}>
          <Text style={[ct.tabLabel, active === i && ct.tabLabelActive]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Challenge card ───────────────────────────────────────────────────────────
function ChallengeCard({ ch, visitCount, unlocked }: { ch: Challenge; visitCount: number; unlocked: boolean }) {
  const pct = Math.min((visitCount / ch.requirement) * 100, 100);

  return (
    <View style={[cc.wrap, unlocked && { borderColor: "rgba(197,160,89,0.28)" }]}>
      <View style={cc.emojiWrap}>
        <Text style={{ fontSize: 28 }}>{ch.emoji}</Text>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={cc.title}>{ch.title}</Text>
          {unlocked && (
            <View style={cc.doneTag}>
              <Text style={cc.doneText}>KLAR</Text>
            </View>
          )}
        </View>
        <Text style={cc.desc} numberOfLines={2}>{ch.desc}</Text>
        {!unlocked && (
          <View style={{ gap: 4, marginTop: 2 }}>
            <View style={cc.progressTrack}>
              <View style={[cc.progressFill, { width: `${pct}%` }]} />
            </View>
            <Text style={cc.progressText}>{Math.min(visitCount, ch.requirement)} / {ch.requirement} besök</Text>
          </View>
        )}
        <Text style={cc.rewardLabel}>🎖 {ch.reward}</Text>
      </View>
    </View>
  );
}

// ─── Trophy card ──────────────────────────────────────────────────────────────
function TrophyCard({ trophy, unlocked }: { trophy: Trophy; unlocked: boolean }) {
  const col = TROPHY_COLOURS[trophy.rarity];
  return (
    <View style={[tc.wrap, !unlocked && tc.locked, { borderColor: unlocked ? `${col}44` : BORDER }]}>
      <View style={[tc.emojiWrap, { backgroundColor: unlocked ? `${col}18` : "rgba(255,255,255,0.04)" }]}>
        {!unlocked && <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 20, alignItems: "center", justifyContent: "center" }]}><Lock size={16} color="rgba(255,255,255,0.25)" strokeWidth={2} /></View>}
        <Text style={{ fontSize: 30, opacity: unlocked ? 1 : 0.25 }}>{trophy.emoji}</Text>
      </View>
      <Text style={[tc.name, { color: unlocked ? FG : MUTED }]} numberOfLines={2}>{trophy.name}</Text>
      <Text style={[tc.rarity, { color: unlocked ? col : "rgba(255,255,255,0.18)" }]}>{trophy.rarity.toUpperCase()}</Text>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(0);
  const { data: visits = [] }       = useVisits();
  const { data: achievements = [] } = useAchievements();
  const safeTop = Math.max(insets.top, 44);

  const unlockedIds = new Set(achievements.map((a) => a.challenge_id));
  const visitCount  = visits.length;

  const activeChalls  = CHALLENGES.filter((ch) => !unlockedIds.has(ch.id) && visitCount < ch.requirement);
  const doneChalls    = CHALLENGES.filter((ch) => unlockedIds.has(ch.id) || visitCount >= ch.requirement);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[ch.header, { paddingTop: safeTop }]}>
        <TouchableOpacity style={ch.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={20} color={FG} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={ch.headerTitle}>Utmaningar</Text>
        <View style={ch.badge}>
          <Trophy size={13} color={GOLD} strokeWidth={1.8} />
          <Text style={ch.badgeText}>{unlockedIds.size}</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
        <ChallengeTabBar active={activeTab} onSelect={setActiveTab} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ch.body}>
        {/* Tab 0: Aktiva */}
        {activeTab === 0 && (
          <View style={{ gap: 12 }}>
            {activeChalls.length === 0 ? (
              <View style={ch.emptyWrap}>
                <Text style={{ fontSize: 36 }}>🎉</Text>
                <Text style={ch.emptyTitle}>Alla utmaningar klara!</Text>
                <Text style={ch.emptySub}>Fler utmaningar kommer snart.</Text>
              </View>
            ) : (
              activeChalls.map((c) => (
                <ChallengeCard key={c.id} ch={c} visitCount={visitCount} unlocked={false} />
              ))
            )}
          </View>
        )}

        {/* Tab 1: Klara */}
        {activeTab === 1 && (
          <View style={{ gap: 12 }}>
            {doneChalls.length === 0 ? (
              <View style={ch.emptyWrap}>
                <Text style={{ fontSize: 36 }}>💪</Text>
                <Text style={ch.emptyTitle}>Inga klara ännu</Text>
                <Text style={ch.emptySub}>Börja utforska Österlen för att klara utmaningar.</Text>
              </View>
            ) : (
              doneChalls.map((c) => (
                <ChallengeCard key={c.id} ch={c} visitCount={visitCount} unlocked />
              ))
            )}
          </View>
        )}

        {/* Tab 2: Troféer */}
        {activeTab === 2 && (
          <View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {TROPHIES.map((t) => (
                <TrophyCard key={t.id} trophy={t} unlocked={unlockedIds.has(t.id) || visitCount >= (CHALLENGES.find((c) => c.id === t.id)?.requirement ?? 999)} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const ch = StyleSheet.create({
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
  body: { padding: 16, paddingBottom: 80 },
  emptyWrap: { alignItems: "center", gap: 10, paddingVertical: 60 },
  emptyTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: FG, textAlign: "center" },
  emptySub: { fontFamily: "Inter_400Regular", fontSize: 14, color: MUTED, textAlign: "center" },
});

const ct = StyleSheet.create({
  tabBar: {
    flexDirection: "row", height: 44,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14, position: "relative", overflow: "hidden",
  },
  indicator: {
    position: "absolute", bottom: 5, height: 3, borderRadius: 2, backgroundColor: GOLD,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: MUTED },
  tabLabelActive: { color: GOLD, fontFamily: "Inter_700Bold" },
});

const cc = StyleSheet.create({
  wrap: {
    flexDirection: "row", gap: 14,
    backgroundColor: CARD, borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: BORDER,
  },
  emojiWrap: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: "rgba(197,160,89,0.10)",
    borderWidth: 1, borderColor: "rgba(197,160,89,0.20)",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, color: FG },
  desc: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, lineHeight: 18 },
  progressTrack: { height: 5, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 3 },
  progressFill: { height: 5, backgroundColor: GOLD, borderRadius: 3 },
  progressText: { fontFamily: "Inter_400Regular", fontSize: 11, color: MUTED },
  rewardLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(197,160,89,0.80)" },
  doneTag: {
    backgroundColor: "rgba(197,160,89,0.18)", borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: "rgba(197,160,89,0.28)",
  },
  doneText: { fontFamily: "Inter_700Bold", fontSize: 9, color: GOLD, letterSpacing: 1 },
});

const TROPHY_COL_W = (SW - 32 - 12) / 2;
const tc = StyleSheet.create({
  wrap: {
    width: TROPHY_COL_W, backgroundColor: CARD, borderRadius: 20, padding: 18,
    borderWidth: 1, alignItems: "center", gap: 8,
  },
  locked: { opacity: 0.65 },
  emojiWrap: {
    width: 60, height: 60, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    position: "relative", overflow: "hidden",
  },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 13, textAlign: "center", lineHeight: 18 },
  rarity: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.5 },
});
