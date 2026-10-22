/**
 * Ramen för Mitt företags guider (nytt erbjudande, nytt evenemang, ta över en plats …): samma
 * framstegsbalk och samma mjuka steg som onboardingen. Varje steg är en StepLayout med rubrik,
 * innehåll och knappen nertill (som följer tangentbordet).
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigation } from "expo-router";
import { View } from "react-native";
import Reanimated, { FadeInLeft, FadeInRight, FadeOutLeft, FadeOutRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { StepBar } from "@/components/auth/AuthParts";
import { KeyboardTiming } from "@/components/onboarding/StepLayout";
import { useTheme } from "@/theme/ThemeProvider";

const FORWARD = { entering: FadeInRight.duration(300), exiting: FadeOutLeft.duration(220) };
const BACKWARD = { entering: FadeInLeft.duration(300), exiting: FadeOutRight.duration(220) };

export function useWizard<T extends string>(steps: T[]) {
  const [index, setIndex] = useState(0);
  const [forward, setForward] = useState(true);
  const safe = Math.min(index, steps.length - 1);
  const next = useCallback(() => { setForward(true); setIndex((i) => Math.min(i + 1, steps.length - 1)); }, [steps.length]);
  const back = useCallback(() => { setForward(false); setIndex((i) => Math.max(0, i - 1)); }, []);
  const goTo = useCallback((step: T) => {
    const target = steps.indexOf(step);
    if (target < 0) return;
    setForward(target > safe);
    setIndex(target);
  }, [steps, safe]);
  return { step: steps[safe], index: safe, count: steps.length, first: safe === 0, forward, next, back, goTo };
}

/**
 * Sidan har glidit in klart. Först då får första fältet fokus: kommer tangentbordet upp medan sidan
 * fortfarande glider följer knappen inte med (samma lösning som onboardingen).
 */
export function useScreenEntered(): boolean {
  const navigation = useNavigation();
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const unsub = navigation.addListener("transitionEnd" as never, (e: { data?: { closing?: boolean } }) => {
      if (!e?.data?.closing) setEntered(true);
    });
    const t = setTimeout(() => setEntered(true), 700);
    return () => { unsub(); clearTimeout(t); };
  }, [navigation]);
  return entered;
}

export function WizardFrame({ stepKey, progress, forward, onBack, hideBar = false, children }: {
  stepKey: string;
  /** 0–1 */
  progress: number;
  forward: boolean;
  /** Tillbaka (på första steget: stäng) */
  onBack: () => void;
  /** Klart-steget visar ingen balk */
  hideBar?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useTheme();
  const motion = forward ? FORWARD : BACKWARD;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      <View style={{ paddingTop: insets.top, opacity: hideBar ? 0 : 1 }} pointerEvents={hideBar ? "none" : "auto"}>
        <StepBar progress={progress} onBack={onBack} />
      </View>
      <View style={{ flex: 1 }}>
        <Reanimated.View key={stepKey} style={{ flex: 1 }} entering={motion.entering} exiting={motion.exiting}>
          <KeyboardTiming.Provider value="events">{children}</KeyboardTiming.Provider>
        </Reanimated.View>
      </View>
    </View>
  );
}
