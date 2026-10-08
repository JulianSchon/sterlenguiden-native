/**
 * Ögonblicket direkt efter "Jag är här!": skärmen mörknar, platsens kort reser sig, och —
 *
 * FÖRSTA besöket på platsen: en passtämpel slår ner över kortet ("BESÖKT" + datum, Österlen-
 * appens logga) — Österlenpasset ska ha stämplar. I exakt samma ögonblick: kraftig vibration,
 * stämpelljudet, kortet skakar till och guldpartiklar sprids. Ljud, vibration och bild i samma
 * millisekund är det som gör att det känns "saftigt".
 *
 * ÅTERBESÖK: lugnare med flit, så glansen ligger kvar på första gången — ingen stämpel, inga
 * partiklar. Bara ett mjukt "Välkommen tillbaka · Ditt 3:e besök här".
 *
 * Kortet reser sig medan servern fortfarande bekräftar (status "pending"), stämpeln slår först
 * när besöket faktiskt är registrerat ("done"). Ett tryck var som helst spolar fram. Respekterar
 * Reduce Motion (inga rörelser, bara slutläget).
 */
import { useEffect, useMemo, useRef } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Reanimated, {
  Easing, interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withSequence, withTiming, type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { firstImageUrl, type Place } from "@/hooks/usePlaces";
import { playSound } from "@/lib/sounds";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.6)";
const INK = "#EBC870";
const STAMP = 150;
const PARTICLES = 16;
const FINISH_AFTER_MS = 1300;

export function CheckInStamp({
  place, status, firstVisit, visitNumber, onFinished,
}: {
  place: Place;
  status: "pending" | "done";
  firstVisit: boolean;
  /** Vilket besök i ordningen det här är på platsen (1 = första) */
  visitNumber: number;
  onFinished: () => void;
}) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const cardW = Math.min(width * 0.72, 300);
  const image = firstImageUrl(place.image_url);
  const date = format(new Date(), "d MMM yyyy", { locale: sv }).toUpperCase();

  const backdrop = useSharedValue(0);
  const rise = useSharedValue(0);
  const stamp = useSharedValue(0);
  const shake = useSharedValue(0);
  const burst = useSharedValue(0);
  const welcome = useSharedValue(0);
  const finished = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onFinished();
  };

  const impact = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    playSound("stamp");
  };

  // Kortet reser sig direkt, oavsett om servern hunnit svara
  useEffect(() => {
    if (reduceMotion) {
      backdrop.value = 1;
      rise.value = 1;
      return;
    }
    backdrop.value = withTiming(1, { duration: 220 });
    rise.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) });
  }, [backdrop, rise, reduceMotion]);

  // ...och stämpeln (eller välkommen-tillbaka) först när besöket är bekräftat
  useEffect(() => {
    if (status !== "done") return;
    const timer = setTimeout(finish, FINISH_AFTER_MS + (reduceMotion ? 0 : 500));
    if (!firstVisit) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
      playSound("welcomeBack");
      welcome.value = reduceMotion ? 1 : withDelay(350, withTiming(1, { duration: 420 }));
      return () => clearTimeout(timer);
    }
    if (reduceMotion) {
      stamp.value = 1;
      impact();
      return () => clearTimeout(timer);
    }
    // Vänta tills kortet rest sig klart, slå sedan ner hårt (ease-IN = accelererar mot kortet)
    stamp.value = withDelay(450, withTiming(1, { duration: 170, easing: Easing.in(Easing.quad) }, (done) => {
      if (!done) return;
      runOnJS(impact)();
    }));
    shake.value = withDelay(620, withSequence(
      withTiming(1, { duration: 40 }), withTiming(-1, { duration: 50 }),
      withTiming(0.6, { duration: 45 }), withTiming(0, { duration: 60 }),
    ));
    burst.value = withDelay(620, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [
      { translateY: interpolate(rise.value, [0, 1], [70, 0]) },
      { translateX: shake.value * 5 },
      { scale: interpolate(rise.value, [0, 1], [0.9, 1]) },
    ],
  }));
  const stampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(stamp.value, [0, 0.3, 1], [0, 1, 1]),
    transform: [{ scale: interpolate(stamp.value, [0, 1], [2.4, 1]) }, { rotate: "-11deg" }],
  }));
  const welcomeStyle = useAnimatedStyle(() => ({
    opacity: welcome.value,
    transform: [{ translateY: interpolate(welcome.value, [0, 1], [10, 0]) }],
  }));

  // Partiklarnas riktningar räknas ut en gång — jämnt runt om, med lite slump i längd
  const particles = useMemo(
    () => Array.from({ length: PARTICLES }, (_, i) => {
      const angle = (i / PARTICLES) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 70 + Math.random() * 70;
      return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, size: 4 + Math.random() * 5 };
    }),
    [],
  );

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => status === "done" && finish()}>
        <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]} />
        <View style={s.center}>
          <Reanimated.View style={[s.card, { width: cardW }, cardStyle]}>
            {image ? (
              <Image source={{ uri: image }} style={[s.image, { height: cardW * 1.1 }]} resizeMode="cover" />
            ) : (
              <View style={[s.image, s.noImage, { height: cardW * 1.1 }]} />
            )}
            <View style={s.cardFooter}>
              <Text style={s.place} numberOfLines={2}>{place.name}</Text>
              {place.nearest_town ? <Text style={s.town}>{place.nearest_town}</Text> : null}
            </View>

            {firstVisit && (
              <View style={s.stampAnchor} pointerEvents="none">
                {particles.map((p, i) => <Particle key={i} {...p} burst={burst} />)}
                <Reanimated.View style={stampStyle}>
                  <Stamp date={date} />
                </Reanimated.View>
              </View>
            )}
          </Reanimated.View>

          {!firstVisit && (
            <Reanimated.View style={[s.welcome, welcomeStyle]}>
              <Text style={s.welcomeTitle}>Välkommen tillbaka</Text>
              <Text style={s.welcomeSub}>Ditt {ordinal(visitNumber)} besök här</Text>
            </Reanimated.View>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

/** Svenskt ordningstal: 1:a, 2:a, 3:e … 11:e, 12:e … 21:a, 22:a. */
function ordinal(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  return `${n}:${(last === 1 || last === 2) && lastTwo !== 11 && lastTwo !== 12 ? "a" : "e"}`;
}

/** Passtämpeln: dubbel ring i guldbläck, loggan, BESÖKT och datumet. */
function Stamp({ date }: { date: string }) {
  return (
    <View style={{ width: STAMP, height: STAMP }}>
      <Svg width={STAMP} height={STAMP} style={StyleSheet.absoluteFill}>
        <Circle cx={STAMP / 2} cy={STAMP / 2} r={STAMP / 2 - 4} stroke={INK} strokeWidth={4} fill="rgba(18,18,18,0.35)" />
        <Circle cx={STAMP / 2} cy={STAMP / 2} r={STAMP / 2 - 13} stroke={INK} strokeWidth={1.5} fill="none" />
      </Svg>
      <View style={[StyleSheet.absoluteFill, s.stampInner]}>
        <Image source={require("../../../assets/Osterlenappen-logo.png")} style={s.stampLogo} resizeMode="contain" />
        <Text style={s.stampTitle}>BESÖKT</Text>
        <Text style={s.stampDate}>{date}</Text>
      </View>
    </View>
  );
}

function Particle({ dx, dy, size, burst }: { dx: number; dy: number; size: number; burst: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(burst.value, [0, 0.05, 1], [0, 1, 0]),
    transform: [
      { translateX: dx * burst.value },
      { translateY: dy * burst.value },
      { scale: interpolate(burst.value, [0, 1], [1, 0.3]) },
    ],
  }));
  return <Reanimated.View style={[s.particle, { width: size, height: size, borderRadius: size / 2 }, style]} />;
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(8,8,10,0.86)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  card: {
    borderRadius: 22, backgroundColor: "#1A1A1D", overflow: "visible",
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12,
  },
  image: { width: "100%", borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  noImage: { backgroundColor: "rgba(255,255,255,0.06)" },
  cardFooter: { paddingHorizontal: 16, paddingVertical: 14 },
  place: { fontFamily: "Montserrat_700Bold", fontSize: 19, color: FG },
  town: { fontFamily: "Inter_500Medium", fontSize: 13, color: MUTED, marginTop: 3 },
  // Stämpeln landar över kortets nedre högra del, som en riktig stämpel som inte sitter mitt i
  stampAnchor: {
    position: "absolute", right: -STAMP * 0.18, bottom: STAMP * 0.15,
    width: STAMP, height: STAMP, alignItems: "center", justifyContent: "center",
  },
  stampInner: { alignItems: "center", justifyContent: "center" },
  stampLogo: { width: 30, height: 34, tintColor: INK, marginBottom: 2 },
  stampTitle: { fontFamily: "Montserrat_700Bold", fontSize: 20, letterSpacing: 3, color: INK },
  stampDate: { fontFamily: "Montserrat_600SemiBold", fontSize: 11, letterSpacing: 1.2, color: INK, marginTop: 2 },
  particle: { position: "absolute", backgroundColor: INK },
  welcome: { alignItems: "center", marginTop: 26 },
  welcomeTitle: { fontFamily: "Montserrat_700Bold", fontSize: 22, color: FG },
  welcomeSub: { fontFamily: "Inter_500Medium", fontSize: 14, color: INK, marginTop: 4 },
});
