/**
 * Ett stegs ram i onboardingen: rubriken överst, innehållet under, och knapparna nertill. Med
 * `scroll` scrollar rubriken och innehållet (steg med mycket att välja bland); knapparna står kvar.
 *
 * Knapparna följer tangentbordet bildruta för bildruta (useAnimatedKeyboard, på UI-tråden) och
 * lägger sig strax ovanför det. Tidigare flyttades de av två saker samtidigt — en mjuk rörelse och
 * ett hopp i luften under dem — så knappen stannade till mitt i.
 *
 * Mitt företags guider (KeyboardTiming.Provider value="events") följer i stället tangentbordets egna
 * besked (keyboardWillShow/Hide med tangentbordets tid och kurva): där fick useAnimatedKeyboard bara
 * slutläget, så knappen hoppade upp efter tangentbordet.
 */
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Keyboard, Platform, ScrollView, StyleSheet, View } from "react-native";
import Reanimated, { Easing, useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AUTH_GUTTER, StepTitle } from "@/components/auth/AuthParts";

/** Så här mycket luft mellan knappen och tangentbordet */
const ABOVE_KEYBOARD = 12;
/** iOS-tangentbordets egen kurva */
const KEYBOARD_CURVE = Easing.bezier(0.38, 0.7, 0.125, 1);

/** "frames" = useAnimatedKeyboard (onboardingen), "events" = tangentbordets besked (Mitt företag) */
export const KeyboardTiming = createContext<"frames" | "events">("frames");

export function StepLayout(props: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
}) {
  const mode = useContext(KeyboardTiming);
  return mode === "events" ? <EventsLayout {...props} /> : <FramesLayout {...props} />;
}

type Props = Parameters<typeof StepLayout>[0];

function FramesLayout(props: Props) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 16);
  const keyboard = useAnimatedKeyboard();
  // Det tangentbordet täcker, minus luften som redan finns under knappen
  const lift = useAnimatedStyle(() => ({ height: Math.max(0, keyboard.height.value - bottom + ABOVE_KEYBOARD) }));
  return <Frame {...props} bottom={bottom} lift={lift} />;
}

function EventsLayout(props: Props) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 16);
  const height = useSharedValue(0);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    // Steget byttes medan tangentbordet redan var uppe: knappen ligger ovanför det direkt
    const open = Keyboard.metrics();
    if (Keyboard.isVisible() && open) height.value = Math.max(0, open.height - bottom + ABOVE_KEYBOARD);
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e) => {
      height.value = withTiming(Math.max(0, e.endCoordinates.height - bottom + ABOVE_KEYBOARD), { duration: e.duration || 250, easing: KEYBOARD_CURVE });
    });
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", (e) => {
      height.value = withTiming(0, { duration: e.duration || 250, easing: KEYBOARD_CURVE });
    });
    return () => { show.remove(); hide.remove(); };
  }, [bottom, height]);
  const lift = useAnimatedStyle(() => ({ height: height.value }));
  return <Frame {...props} bottom={bottom} lift={lift} />;
}

function Frame({ title, subtitle, children, footer, scroll = false, bottom, lift }: Props & { bottom: number; lift: object }) {
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
