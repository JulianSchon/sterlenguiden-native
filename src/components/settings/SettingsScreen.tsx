/**
 * Gemensam ram för alla inställningssidor: rubrik med tillbaka-knapp och en
 * scrollande yta. Färger kommer från temat. Med `morph` (0 = mörkt, 1 = ljust)
 * följer ramens färger det värdet i stället, för sidor där temat byts under
 * fingret (Utseende).
 */
import type { ReactNode, RefObject } from "react";
import { View, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, ChevronLeft } from "lucide-react-native";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { darkColors, lightColors, type ThemeColors } from "@/theme/colors";
import { useMorphStyle } from "@/theme/morph";

export function SettingsScreen({
  title, right, compact = false, morph, scrollRef, onScroll, overlay, footer, scrollEnabled = true, page = false, fixed = false, children,
}: {
  title: string; right?: ReactNode; compact?: boolean; morph?: SharedValue<number>;
  /** Rubriken i samma storlek som Profils övriga sidor (Mitt Österlen, Favoriter …) i stället för Inställningars */
  page?: boolean;
  /** Sidan har en egen scrollyta (t.ex. en lista man drar om) — då ligger innehållet utan ScrollView */
  fixed?: boolean;
  /** För sidor som själva behöver scrolla eller veta var i listan man är */
  scrollRef?: RefObject<ScrollView | null>; onScroll?: (y: number) => void;
  /** Lager ovanpå hela sidan, rubriken inräknad (t.ex. en panel som flyger in från en lista) */
  overlay?: ReactNode;
  /** Fast längst ner, ovanför hemknappen (t.ex. Ny story); innehållet scrollar bakom */
  footer?: ReactNode;
  /** Av medan man drar fingret i ett diagram (ScrubChart) */
  scrollEnabled?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);

  const fallback = useSharedValue(0);
  const p = morph ?? fallback;
  const rootMorph = useMorphStyle(p, "backgroundColor", "bg");
  const borderMorph = useMorphStyle(p, "borderBottomColor", "border");
  const backMorph = useMorphStyle(p, "backgroundColor", "fill");
  const titleMorph = useMorphStyle(p, "color", "text");
  const chevronDark = useAnimatedStyle(() => ({ opacity: 1 - p.value }));
  const chevronLight = useAnimatedStyle(() => ({ opacity: p.value }));

  return (
    <Animated.View style={[s.root, morph ? rootMorph : null]}>
      <Animated.View style={[s.header, page ? [s.headerPage, { paddingTop: insets.top, minHeight: insets.top + 64 }] : { paddingTop: Math.max(insets.top, 44) }, morph ? [rootMorph, borderMorph] : null]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Animated.View style={[s.backBtn, page && s.backBtnPage, morph ? backMorph : null]}>
            {morph ? (
              <>
                <Animated.View style={[StyleSheet.absoluteFill, s.center, chevronDark]}>
                  <ChevronLeft size={20} color={darkColors.text} strokeWidth={2} />
                </Animated.View>
                <Animated.View style={[StyleSheet.absoluteFill, s.center, chevronLight]}>
                  <ChevronLeft size={20} color={lightColors.text} strokeWidth={2} />
                </Animated.View>
              </>
            ) : page ? (
              <ArrowLeft size={24} color={colors.text} strokeWidth={2} />
            ) : (
              <ChevronLeft size={20} color={colors.text} strokeWidth={2} />
            )}
          </Animated.View>
        </TouchableOpacity>
        <Animated.Text style={[s.title, morph ? titleMorph : null]} numberOfLines={1}>{title}</Animated.Text>
        {right}
      </Animated.View>
      {fixed ? (
        <View style={s.fixed}>{children}</View>
      ) : (
        <ScrollView
          ref={scrollRef}
          onScroll={onScroll ? (e) => onScroll(e.nativeEvent.contentOffset.y) : undefined}
          scrollEventThrottle={16}
          scrollEnabled={scrollEnabled}
          showsVerticalScrollIndicator={false}
          // Sidor som ryms på skärmen ska stå stilla; bara längre sidor (eller små skärmar) gungar och scrollar
          alwaysBounceVertical={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.body, compact && s.bodyCompact, { paddingBottom: footer ? 24 : Math.max(insets.bottom, 16) + (compact ? 8 : 40) }]}
        >
          {children}
        </ScrollView>
      )}
      {footer ? <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>{footer}</View> : null}
      {overlay}
    </Animated.View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border,
    backgroundColor: c.bg,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: c.fill,
    alignItems: "center", justifyContent: "center",
  },
  // Sidrubriken: samma mått som Mitt Österlen, Favoriter, Historik … (64 hög rad, 48 rund pil)
  headerPage: { paddingBottom: 0, borderBottomWidth: 0 },
  backBtnPage: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: c.borderStrong },
  center: { alignItems: "center", justifyContent: "center" },
  // Samma rubrikstil som Mitt Österlen: versal Montserrat med luft mellan bokstäverna
  title: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5, textTransform: "uppercase", color: c.text },
  body: { paddingHorizontal: 16, paddingTop: 20, gap: 22 },
  // För sidor som ska rymmas utan att scrolla
  bodyCompact: { paddingTop: 10, gap: 14 },
  fixed: { flex: 1 },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: c.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
});
