/**
 * Inställningar – hub
 * Spec: native-subpages-spec.md §1
 */
import { useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, Animated, Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ChevronLeft, ChevronRight, User, Crown, Palette,
  Bell, Info, LogOut, Trash2, MessageSquarePlus,
} from "lucide-react-native";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const BG      = "#121212";
const CARD    = "#1C1C1C";
const FG      = "#F5F1E8";
const MUTED   = "rgba(245,241,232,0.55)";
const GOLD    = "#C5A059";
const BORDER  = "rgba(255,255,255,0.06)";
const BORDER_GOLD = "rgba(197,160,89,0.22)";
const DESTR   = "#E86A5E";

// Language picker
const LANGUAGES = [
  { code: "sv", flag: "🇸🇪", label: "Svenska"  },
  { code: "en", flag: "🇬🇧", label: "English"  },
  { code: "de", flag: "🇩🇪", label: "Deutsch"  },
] as const;

const SECTIONS = [
  { route: "/settings/account",       icon: User,           label: "Konto"           },
  { route: "/settings/pass",          icon: Crown,          label: "Österlenpasset"  },
  { route: "/settings/appearance",    icon: Palette,        label: "Utseende"        },
  { route: "/settings/notifications", icon: Bell,           label: "Notiser"         },
  { route: "/settings/about",         icon: Info,           label: "Om appen"        },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { data: profile }  = useProfile();
  const qc = useQueryClient();

  const [langOpen,  setLangOpen]  = useState(false);
  const [langAnim]                = useState(new Animated.Value(0));

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "Gäst";
  const curLang     = profile?.preferred_language ?? "sv";
  const flagLabel   = LANGUAGES.find((l) => l.code === curLang)?.flag ?? "🇸🇪";

  const openLang = () => {
    setLangOpen(true);
    Animated.spring(langAnim, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 4 }).start();
  };
  const closeLang = () => {
    Animated.timing(langAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setLangOpen(false));
  };
  const langScale = langAnim.interpolate({ inputRange: [0,1], outputRange: [0.9, 1] });
  const langOpacity = langAnim;

  const updateLang = useMutation({
    mutationFn: async (code: string) => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      await supabase.from("profiles").update({ preferred_language: code }).eq("user_id", u.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });

  const handleSignOut = () => {
    Alert.alert("Logga ut", "Är du säker?", [
      { text: "Avbryt", style: "cancel" },
      { text: "Logga ut", style: "destructive", onPress: signOut },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Radera konto",
      "All din data raderas permanent. Detta kan inte ångras.",
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Radera permanent", style: "destructive",
          onPress: async () => {
            try {
              const { data: { user: u } } = await supabase.auth.getUser();
              if (!u) return;
              await supabase.from("favorites").delete().eq("user_id", u.id);
              await supabase.from("visits").delete().eq("user_id", u.id);
              await supabase.from("achievements").delete().eq("user_id", u.id);
              await supabase.from("profiles").delete().eq("user_id", u.id);
            } finally {
              signOut();
            }
          },
        },
      ]
    );
  };

  const safeTop = Math.max(insets.top, 44);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: safeTop }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={20} color={FG} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Inställningar</Text>
        {/* Language picker button */}
        <TouchableOpacity style={s.flagBtn} onPress={langOpen ? closeLang : openLang}>
          <Text style={{ fontSize: 20 }}>{flagLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* Language dropdown */}
      {langOpen && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeLang} />
          <Animated.View style={[s.langDropdown, { top: safeTop + 56, opacity: langOpacity, transform: [{ scale: langScale }] }]}>
            {LANGUAGES.map((lang, i) => (
              <TouchableOpacity
                key={lang.code}
                style={[s.langRow, i > 0 && { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" }, curLang === lang.code && { backgroundColor: "rgba(197,160,89,0.10)" }]}
                onPress={() => { updateLang.mutate(lang.code); closeLang(); }}
              >
                <Text style={{ fontSize: 18 }}>{lang.flag}</Text>
                <Text style={[s.langLabel, curLang === lang.code && { color: GOLD, fontFamily: "Inter_600SemiBold" }]}>{lang.label}</Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        </>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
        {/* Profile card */}
        <View style={s.profileCard}>
          <View style={s.profileCornerGlow} />
          <View style={s.profileAvatar}>
            <Text style={s.profileInitials}>{displayName.slice(0,2).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.profileEyebrow}>INLOGGAD SOM</Text>
            <Text style={s.profileName} numberOfLines={1}>{displayName}</Text>
          </View>
        </View>

        {/* Section list */}
        <View style={s.sectionCard}>
          {SECTIONS.map(({ route, icon: Icon, label }, i) => (
            <TouchableOpacity
              key={route}
              style={[s.sectionRow, i > 0 && { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)" }]}
              onPress={() => router.push(route as any)}
            >
              <View style={s.iconTile}><Icon size={17} color={GOLD} strokeWidth={1.6} /></View>
              <Text style={s.sectionLabel}>{label}</Text>
              <ChevronRight size={16} color="rgba(255,255,255,0.30)" strokeWidth={2} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Tips card */}
        <TouchableOpacity style={s.tipsCard} activeOpacity={0.85}>
          <View style={s.iconTile}><MessageSquarePlus size={17} color={GOLD} strokeWidth={1.6} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.tipsTitle}>Saknas ditt smultronställe?</Text>
            <Text style={s.tipsSub} numberOfLines={2}>Tipsa oss om platser och upplevelser på Österlen.</Text>
          </View>
          <ChevronRight size={16} color="rgba(255,255,255,0.30)" strokeWidth={2} />
        </TouchableOpacity>

        {/* Sign out */}
        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
          <LogOut size={16} color={MUTED} strokeWidth={1.75} />
          <Text style={s.signOutText}>Logga ut</Text>
        </TouchableOpacity>

        {/* Delete account */}
        <TouchableOpacity style={s.deleteBtn} onPress={handleDeleteAccount}>
          <Trash2 size={14} color={DESTR} strokeWidth={1.75} />
          <Text style={s.deleteText}>Radera konto</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)",
    backgroundColor: BG, zIndex: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  headerTitle: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 18, color: FG, flex: 1 },
  flagBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },

  langDropdown: {
    position: "absolute", right: 16, zIndex: 200,
    backgroundColor: "#1E1E1E", borderRadius: 16, minWidth: 180,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.7, shadowRadius: 24, elevation: 20,
    overflow: "hidden",
  },
  langRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  langLabel: { fontFamily: "Inter_400Regular", fontSize: 14, color: FG },

  body: { padding: 20, gap: 16, paddingBottom: 60 },

  profileCard: {
    flexDirection: "row", alignItems: "center", gap: 16,
    backgroundColor: CARD, borderRadius: 22,
    padding: 16, borderWidth: 1, borderColor: BORDER_GOLD,
    overflow: "hidden",
  },
  profileCornerGlow: {
    position: "absolute", top: -20, right: -20,
    width: 100, height: 80, borderRadius: 999,
    backgroundColor: "rgba(197,160,89,0.07)",
  },
  profileAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "rgba(197,160,89,0.15)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: BORDER_GOLD,
  },
  profileInitials: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 20, color: GOLD },
  profileEyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: "rgba(197,160,89,0.70)", letterSpacing: 2.2, textTransform: "uppercase", marginBottom: 4 },
  profileName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 17, color: FG },

  sectionCard: { backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: BORDER, overflow: "hidden" },
  sectionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 16, paddingHorizontal: 20, gap: 14 },
  iconTile: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(197,160,89,0.10)",
    borderWidth: 1, borderColor: "rgba(197,160,89,0.20)",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  sectionLabel: { fontFamily: "Inter_500Medium", fontSize: 14.5, color: FG, flex: 1 },

  tipsCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: CARD, borderRadius: 20,
    padding: 16, borderWidth: 1, borderColor: BORDER,
  },
  tipsTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: FG, marginBottom: 3 },
  tipsSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: MUTED, lineHeight: 17 },

  signOutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14,
    backgroundColor: CARD, borderRadius: 20, borderWidth: 1, borderColor: BORDER,
  },
  signOutText: { fontFamily: "Inter_500Medium", fontSize: 14, color: MUTED },

  deleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 8,
  },
  deleteText: { fontFamily: "Inter_400Regular", fontSize: 13, color: DESTR },
});
