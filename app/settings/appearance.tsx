/**
 * Inställningar › Utseende
 */
import { useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Switch, ImageBackground, Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Lock, Check } from "lucide-react-native";
import Svg, {
  Defs, LinearGradient as SvgGrad, RadialGradient as SvgRadial,
  Stop, Rect as SvgRect,
} from "react-native-svg";
import { useProfile } from "@/hooks/useProfile";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CARD_VARIANTS, cardColors } from "@/lib/cardVariants";

// PNG-require måste vara statisk, hanteras här
const MIDNIGHT_PNG = require("../../assets/card-bg.png");

const BG     = "#121212";
const CARD   = "#1C1C1C";
const FG     = "#F5F1E8";
const MUTED  = "rgba(245,241,232,0.55)";
const GOLD   = "#C5A059";
const BORDER = "rgba(255,255,255,0.06)";

const { width: SW } = Dimensions.get("window");
// Bredd på varje mini-kort: (skärm - body-padding*2 - card-padding*2 - gap) / 2
const MINI_W = Math.floor((SW - 40 - 40 - 12) / 2);
const MINI_H = Math.round(MINI_W * 0.54);

// Circle badge colors (member only)
const CIRCLE_COLORS = [
  { id: "gold",   hex: "#C5A059", label: "Guld"   },
  { id: "silver", hex: "#A8A8A8", label: "Silver" },
  { id: "copper", hex: "#B87333", label: "Koppar" },
  { id: "white",  hex: "#F5F1E8", label: "Vit"    },
  { id: "sage",   hex: "#78917C", label: "Salvia" },
] as const;

type Swatch = { id: string; hex: string; label: string };

function CircleRow({ selected, onSelect, locked }: {
  selected: string; onSelect: (id: string) => void; locked?: boolean;
}) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={a.eyebrow}>CIRKELNS FÄRG</Text>
        {locked && <Lock size={12} color={GOLD} strokeWidth={2} />}
      </View>
      <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap", opacity: locked ? 0.45 : 1 }}>
        {CIRCLE_COLORS.map((sw) => (
          <TouchableOpacity
            key={sw.id}
            style={{ alignItems: "center", gap: 6 }}
            onPress={() => !locked && onSelect(sw.id)}
          >
            <View style={[a.swatch, { backgroundColor: sw.hex }, selected === sw.id && a.swatchActive]} />
            <Text style={[a.swatchLabel, selected === sw.id && { color: GOLD }]}>{sw.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {locked && (
        <Text style={a.lockedNote}>Kräver Österlenpasset</Text>
      )}
    </View>
  );
}

/** Mini-förhandsgranskning av ett kort — SVG-gradient eller PNG */
function MiniCard({ variantId, isSelected }: { variantId: string; isSelected: boolean }) {
  const v = CARD_VARIANTS.find((x) => x.id === variantId)!;
  const c = cardColors(v);
  const hasPng = v.id === "midnight";

  return (
    <View style={[
      a.miniCard,
      isSelected && { borderColor: GOLD, borderWidth: 2 },
    ]}>
      {/* Bakgrund */}
      {hasPng ? (
        <ImageBackground
          source={MIDNIGHT_PNG}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <Svg style={StyleSheet.absoluteFill} width={MINI_W} height={MINI_H}>
          <Defs>
            <SvgGrad id={`g_${v.id}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={v.bg} />
              <Stop offset="100%" stopColor={v.bg2} />
            </SvgGrad>
            {v.glow ? (
              <SvgRadial id={`r_${v.id}`} cx="70%" cy="30%" rx="60%" ry="60%">
                <Stop offset="0%" stopColor={v.glow} stopOpacity={1} />
                <Stop offset="100%" stopColor={v.glow} stopOpacity={0} />
              </SvgRadial>
            ) : null}
          </Defs>
          <SvgRect x={0} y={0} width={MINI_W} height={MINI_H} fill={`url(#g_${v.id})`} />
          {v.glow ? <SvgRect x={0} y={0} width={MINI_W} height={MINI_H} fill={`url(#r_${v.id})`} /> : null}
        </Svg>
      )}

      {/* Variant-namn */}
      <View style={{ position: "absolute", bottom: 7, left: 10 }}>
        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: c.text, letterSpacing: 1.4 }}>
          {v.name.toUpperCase()}
        </Text>
      </View>

      {/* Bock vid valt */}
      {isSelected && (
        <View style={a.miniCheck}>
          <Check size={9} color="#000" strokeWidth={3} />
        </View>
      )}
    </View>
  );
}

export default function AppearanceSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: profile } = useProfile();

  const isMember = !!(profile as any)?.is_member;

  const [darkMode,    setDarkMode]    = useState(true);
  const [cardColor,   setCardColor]   = useState<string>(profile?.card_color ?? "midnight");
  const [circleColor, setCircleColor] = useState<string>(profile?.circle_color ?? "gold");

  const savePrefs = useMutation({
    mutationFn: async (update: Record<string, string>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("profiles").update(update).eq("user_id", user.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });

  const safeTop = Math.max(insets.top, 44);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[a.header, { paddingTop: safeTop }]}>
        <TouchableOpacity style={a.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={20} color={FG} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={a.headerTitle}>Utseende</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={a.body}>
        {/* Tema */}
        <View style={a.card}>
          <Text style={a.eyebrow}>TEMA</Text>
          <View style={a.row}>
            <Text style={a.rowLabel}>Mörkt läge</Text>
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              trackColor={{ false: "rgba(255,255,255,0.12)", true: "rgba(197,160,89,0.55)" }}
              thumbColor={darkMode ? GOLD : "rgba(255,255,255,0.5)"}
            />
          </View>
          <Text style={a.noteText}>Ljust tema lanseras i en kommande uppdatering.</Text>
        </View>

        {/* Kortdesign – 10 varianter */}
        <View style={[a.card, { opacity: isMember ? 1 : 0.55 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={a.eyebrow}>KORTDESIGN</Text>
            {!isMember && <Lock size={12} color={GOLD} strokeWidth={2} />}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {CARD_VARIANTS.map((v) => (
              <TouchableOpacity
                key={v.id}
                activeOpacity={0.85}
                onPress={() => {
                  if (!isMember) return;
                  setCardColor(v.id);
                  savePrefs.mutate({ card_color: v.id });
                }}
              >
                <MiniCard variantId={v.id} isSelected={cardColor === v.id} />
              </TouchableOpacity>
            ))}
          </View>
          {!isMember && (
            <Text style={a.lockedNote}>Kräver Österlenpasset</Text>
          )}
        </View>

        {/* Cirkelns färg */}
        <View style={a.card}>
          <CircleRow
            selected={circleColor}
            locked={!isMember}
            onSelect={(id) => {
              setCircleColor(id);
              savePrefs.mutate({ circle_color: id });
            }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const a = StyleSheet.create({
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
  body: { padding: 20, gap: 16, paddingBottom: 60 },
  card: { backgroundColor: CARD, borderRadius: 22, padding: 20, borderWidth: 1, borderColor: BORDER, gap: 16 },
  eyebrow: {
    fontFamily: "Inter_600SemiBold", fontSize: 10,
    color: "rgba(197,160,89,0.75)", letterSpacing: 2, textTransform: "uppercase",
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowLabel: { fontFamily: "Inter_500Medium", fontSize: 14.5, color: FG },
  noteText: { fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED, lineHeight: 18 },
  lockedNote: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(197,160,89,0.65)" },

  // Mini-kort
  miniCard: {
    width: MINI_W,
    height: MINI_H,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  miniCheck: {
    position: "absolute", top: 6, right: 6,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: GOLD,
    alignItems: "center", justifyContent: "center",
  },

  // Cirkel-swatches
  swatch: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  swatchActive: { borderWidth: 2, borderColor: GOLD },
  swatchLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: MUTED },
});
