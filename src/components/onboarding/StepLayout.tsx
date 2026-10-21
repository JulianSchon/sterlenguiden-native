/**
 * Ett stegs ram i onboardingen: rubriken överst, innehållet under, och knapparna nertill — de
 * följer med upp ovanför tangentbordet. Med `scroll` scrollar rubriken och innehållet (steg med
 * mycket att välja bland); knapparna står kvar.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Keyboard, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AUTH_GUTTER, StepTitle } from "@/components/auth/AuthParts";

function useKeyboardShown(): boolean {
  // Nästa steg kan börja med tangentbordet redan uppe (e-post → kod)
  const [shown, setShown] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setShown(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setShown(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return shown;
}

export function StepLayout({
  title, subtitle, children, footer, scroll = false,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardShown();
  const top = (
    <View style={s.top}>
      <StepTitle title={title} subtitle={subtitle} />
    </View>
  );
  return (
    <View style={s.root}>
      {scroll ? (
        <ScrollView
          style={s.root}
          contentContainerStyle={s.scrollBody}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {top}
          <View style={s.content}>{children}</View>
        </ScrollView>
      ) : (
        <>
          {top}
          <View style={[s.content, s.root]}>{children}</View>
        </>
      )}
      {footer ? (
        <View style={[s.footer, { paddingBottom: keyboard ? 12 : Math.max(insets.bottom, 16) }]}>{footer}</View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  top: { paddingHorizontal: AUTH_GUTTER, paddingTop: 12, paddingBottom: 28 },
  content: { paddingHorizontal: AUTH_GUTTER, gap: 14 },
  scrollBody: { paddingBottom: 24 },
  footer: { paddingHorizontal: AUTH_GUTTER, paddingTop: 10, gap: 4 },
});
