/**
 * Ett stegs ram i onboardingen: rubriken överst, innehållet under, och knapparna nertill. Med
 * `scroll` scrollar rubriken och innehållet (steg med mycket att välja bland); knapparna står kvar.
 *
 * Knapparna följer tangentbordet bildruta för bildruta (useAnimatedKeyboard, på UI-tråden) och
 * lägger sig strax ovanför det. Tidigare flyttades de av två saker samtidigt — en mjuk rörelse och
 * ett hopp i luften under dem — så knappen stannade till mitt i.
 */
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Reanimated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AUTH_GUTTER, StepTitle } from "@/components/auth/AuthParts";

/** Så här mycket luft mellan knappen och tangentbordet */
const ABOVE_KEYBOARD = 12;

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
  const bottom = Math.max(insets.bottom, 16);
  const keyboard = useAnimatedKeyboard();
  // Det tangentbordet täcker, minus luften som redan finns under knappen
  const lift = useAnimatedStyle(() => ({ height: Math.max(0, keyboard.height.value - bottom + ABOVE_KEYBOARD) }));
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
      {footer ? <View style={[s.footer, { paddingBottom: bottom }]}>{footer}</View> : null}
      <Reanimated.View style={lift} />
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
