/**
 * Steg 1 i incheckningens belöning: platsens kort och — vid FÖRSTA besöket — passtämpeln.
 *
 * Tempot är medvetet långsamt, i fyra takter (som en riktig belöning i ett spel):
 *  1. Ankomst (~1,5 s): kortet reser sig och vrider sig rätt, logga, namn och ort tonar in en i
 *     taget ovanpå bilden.
 *  2. Uppbyggnad (~0,8 s): stämpeln dyker upp högt ovanför kortet och lyfts ännu lite till, med
 *     två små vibrationer — man ser vad som ska hända och väntar på det.
 *  3. Smällen: stämpeln slår ner (accelererar mot kortet), och i SAMMA ögonblick: kraftig
 *     vibration, stämpelljud, kortet trycks ihop och skakar, en bläckring sprids, skärmen blixtrar
 *     till, konfetti skjuts ut och faller, glöden pulserar och strålkransen tänds bakom.
 *  4. Efterspel: "Första besöket!" och tiden tonar in. Sen kommer Fortsätt-knappen — användaren
 *     bestämmer själv när det är dags att gå vidare, inget stängs av sig självt.
 *
 * Stämpeln slår först när servern bekräftat besöket (`done`) — ankomsten spelas medan den väntar.
 * Återbesök: samma ankomst, men ingen stämpel, ingen konfetti — bara ett lugnt "Välkommen
 * tillbaka". `skip` (tryck under animationen) hoppar till slutläget.
 */
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View, useWindowDimensions } from "react-native";
import Reanimated, {
  Easing, interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withSequence, withTiming, type SharedValue,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { firstImageUrl, type Place } from "@/hooks/usePlaces";
import { formatClock } from "@/lib/checkin";
import { playSound } from "@/lib/sounds";
import { Confetti, INK, PassStamp } from "./CelebrationFx";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.72)";
const STAMP = 172;
const ARRIVAL_MS = 1500;

function ordinal(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  return `${n}:${(last === 1 || last === 2) && lastTwo !== 11 && lastTwo !== 12 ? "a" : "e"}`;
}

export function StampScene({
  place, firstVisit, visitNumber, lastVisitAt, done, skip, rays, glow, onReady,
}: {
  place: Place;
  firstVisit: boolean;
  visitNumber: number;
  lastVisitAt: string | null;
  /** Servern har bekräftat besöket */
  done: boolean;
  skip: boolean;
  /** Bakgrundens strålkrans och glöd — ägs av föräldern (lever kvar in i nästa steg) */
  rays: SharedValue<number>;
  glow: SharedValue<number>;
  onReady: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const cardW = Math.min(width * 0.84, 360, (height * 0.56) / 1.32);
  const cardH = cardW * 1.32;
  const image = firstImageUrl(place.image_url);
  const logo = firstImageUrl(place.logo_url);
  const meta = [place.nearest_town, place.category?.split(",")[0]?.trim()].filter(Boolean).join("  ·  ");
  const [now] = useState(() => new Date());
  const stampDate = format(now, "d MMM yyyy", { locale: sv }).toUpperCase();

  // Ankomst
  const arrive = useSharedValue(0);
  const logoIn = useSharedValue(0);
  const nameIn = useSharedValue(0);
  const metaIn = useSharedValue(0);
  // Stämpeln
  const stampOpacity = useSharedValue(0);
  const stampScale = useSharedValue(2.1);
  const stampTilt = useSharedValue(-17);
  const press = useSharedValue(0);
  const shake = useSharedValue(0);
  const ring = useSharedValue(0);
  const flash = useSharedValue(0);
  const burst = useSharedValue(0);
  // Efterspel
  const headline = useSharedValue(0);
  const sub = useSharedValue(0);

  const mountedAt = useRef(Date.now());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const impacted = useRef(false);
  const readied = useRef(false);
  const started = useRef(false);

  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  const ready = () => {
    if (readied.current) return;
    readied.current = true;
    onReady();
  };

  // Smällen — vibration och ljud i exakt samma ögonblick som stämpeln når kortet
  const impactJS = () => {
    if (impacted.current) return;
    impacted.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    playSound("stamp");
    later(130, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}));
  };

  // 1. Ankomsten spelas direkt, oavsett om servern hunnit svara
  useEffect(() => {
    if (reduceMotion) {
      arrive.value = 1; logoIn.value = 1; nameIn.value = 1; metaIn.value = 1;
      glow.value = 0.6;
      return;
    }
    arrive.value = withDelay(150, withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }));
    logoIn.value = withDelay(900, withTiming(1, { duration: 380, easing: Easing.out(Easing.back(1.6)) }));
    nameIn.value = withDelay(1020, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    metaIn.value = withDelay(1150, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    glow.value = withTiming(0.6, { duration: 1100 });
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2–4. När besöket är bekräftat (och kortet hunnit landa)
  useEffect(() => {
    if (!done || skip || started.current) return;
    started.current = true;
    const base = reduceMotion ? 0 : Math.max(0, ARRIVAL_MS - (Date.now() - mountedAt.current));

    if (reduceMotion) {
      if (firstVisit) {
        stampOpacity.value = 1; stampScale.value = 1; stampTilt.value = -12;
        rays.value = 1; impactJS();
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
      }
      headline.value = 1; sub.value = 1;
      ready();
      return;
    }

    if (!firstVisit) {
      later(base + 150, () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
        playSound("welcomeBack");
      });
      headline.value = withDelay(base + 150, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
      sub.value = withDelay(base + 420, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
      later(base + 1200, ready);
      return;
    }

    // 2. Uppbyggnad: stämpeln dyker upp högt ovanför och lyfts lite till
    later(base, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {}));
    later(base + 420, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}));
    stampOpacity.value = withDelay(base, withTiming(0.85, { duration: 520 }));
    stampTilt.value = withDelay(base, withTiming(-12, { duration: 800, easing: Easing.out(Easing.quad) }));
    stampScale.value = withDelay(base, withSequence(
      withTiming(2.45, { duration: 620, easing: Easing.out(Easing.quad) }),
      // 3. Smällen — accelererar ner mot kortet (ease-in), trycks lite förbi och lägger sig
      withDelay(200, withTiming(0.94, { duration: 150, easing: Easing.in(Easing.cubic) }, (fin) => {
        if (fin) runOnJS(impactJS)();
      })),
      withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
    ));
    const impactAt = base + 620 + 200 + 150;
    stampOpacity.value = withDelay(impactAt, withTiming(1, { duration: 60 }));
    press.value = withDelay(impactAt, withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 260, easing: Easing.out(Easing.quad) })));
    shake.value = withDelay(impactAt, withSequence(
      withTiming(1, { duration: 45 }), withTiming(-0.8, { duration: 55 }), withTiming(0.5, { duration: 55 }),
      withTiming(-0.25, { duration: 55 }), withTiming(0, { duration: 70 }),
    ));
    ring.value = withDelay(impactAt, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
    flash.value = withDelay(impactAt, withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 340 })));
    burst.value = withDelay(impactAt, withTiming(1, { duration: 1400, easing: Easing.linear }));
    glow.value = withDelay(impactAt, withSequence(withTiming(1, { duration: 140 }), withTiming(0.7, { duration: 1000 })));
    rays.value = withDelay(impactAt, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));

    // 4. Efterspel
    headline.value = withDelay(impactAt + 420, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    sub.value = withDelay(impactAt + 640, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    later(impactAt + 1350, ready);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, skip]);

  // Tryck under animationen: hoppa till slutläget (men smällen ska ändå kännas en gång)
  useEffect(() => {
    if (!skip || !done) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    arrive.value = 1; logoIn.value = 1; nameIn.value = 1; metaIn.value = 1;
    headline.value = 1; sub.value = 1;
    shake.value = 0; press.value = 0; flash.value = 0;
    if (firstVisit) {
      stampOpacity.value = 1; stampScale.value = 1; stampTilt.value = -12;
      ring.value = 1; burst.value = 1; rays.value = 1; glow.value = 0.7;
      impactJS();
    }
    ready();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, done]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(arrive.value, [0, 0.4, 1], [0, 1, 1]),
    transform: [
      { translateY: interpolate(arrive.value, [0, 1], [130, 0]) },
      { translateX: shake.value * 7 },
      { rotate: `${interpolate(arrive.value, [0, 1], [6, 0])}deg` },
      { scale: interpolate(arrive.value, [0, 1], [0.82, 1]) * (1 - press.value * 0.035) },
    ],
  }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoIn.value,
    transform: [{ scale: interpolate(logoIn.value, [0, 1], [0.4, 1]) }],
  }));
  const nameStyle = useAnimatedStyle(() => ({
    opacity: nameIn.value,
    transform: [{ translateY: interpolate(nameIn.value, [0, 1], [16, 0]) }],
  }));
  const metaStyle = useAnimatedStyle(() => ({
    opacity: metaIn.value,
    transform: [{ translateY: interpolate(metaIn.value, [0, 1], [14, 0]) }],
  }));
  const stampStyle = useAnimatedStyle(() => ({
    opacity: stampOpacity.value,
    transform: [{ scale: stampScale.value }, { rotate: `${stampTilt.value}deg` }],
  }));
  // Skuggan under stämpeln — svag och utsmetad när den är högt uppe, skarp precis före smällen
  const stampShadowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(stampScale.value, [1, 2.45], [0, 0.45]) * stampOpacity.value,
    transform: [{ scale: interpolate(stampScale.value, [1, 2.45], [1, 0.7]) }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 0.05, 1], [0, 0.7, 0]),
    transform: [{ scale: interpolate(ring.value, [0, 1], [0.8, 1.9]) }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.16 }));
  const headlineStyle = useAnimatedStyle(() => ({
    opacity: headline.value,
    transform: [{ translateY: interpolate(headline.value, [0, 1], [16, 0]) }, { scale: interpolate(headline.value, [0, 1], [0.94, 1]) }],
  }));
  const subStyle = useAnimatedStyle(() => ({
    opacity: sub.value,
    transform: [{ translateY: interpolate(sub.value, [0, 1], [12, 0]) }],
  }));

  const lastVisitText = lastVisitAt ? `Senast här ${format(new Date(lastVisitAt), "d MMM", { locale: sv })}` : null;

  return (
    <View style={s.root} pointerEvents="none">
      <Reanimated.View style={[{ width: cardW, height: cardH }, cardStyle]}>
        <View style={s.cardClip}>
          {image ? (
            <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, s.noImage]} />
          )}
          {/* Mörk fade nedtill så all info går att läsa direkt på bilden */}
          <Svg style={StyleSheet.absoluteFill} width={cardW} height={cardH}>
            <Defs>
              <LinearGradient id="stampCardFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0.38" stopColor="#000" stopOpacity={0} />
                <Stop offset="0.7" stopColor="#000" stopOpacity={0.55} />
                <Stop offset="1" stopColor="#000" stopOpacity={0.92} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={cardW} height={cardH} fill="url(#stampCardFade)" />
          </Svg>
          <View style={s.info}>
            {logo && (
              <Reanimated.View style={[s.logoWrap, logoStyle]}>
                <Image source={{ uri: logo }} style={s.logo} resizeMode="contain" />
              </Reanimated.View>
            )}
            <View style={{ flex: 1 }}>
              <Reanimated.Text style={[s.place, nameStyle]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
                {place.name}
              </Reanimated.Text>
              {meta !== "" && <Reanimated.Text style={[s.meta, metaStyle]} numberOfLines={1}>{meta}</Reanimated.Text>}
            </View>
          </View>
          <View style={s.cardBorder} />
        </View>

        {firstVisit && (
          <View style={s.stampAnchor}>
            <Reanimated.View style={[s.stampShadow, stampShadowStyle]} />
            <Reanimated.View style={[s.inkRing, ringStyle]} />
            <Confetti progress={burst} count={34} />
            <Reanimated.View style={stampStyle}>
              <PassStamp size={STAMP} date={stampDate} />
            </Reanimated.View>
          </View>
        )}
      </Reanimated.View>

      <View style={s.texts}>
        <Reanimated.Text style={[s.headline, headlineStyle]}>
          {firstVisit ? "Första besöket!" : "Välkommen tillbaka"}
        </Reanimated.Text>
        <Reanimated.Text style={[s.sub, subStyle]}>
          {firstVisit
            ? `Stämplad idag kl ${formatClock(now)}`
            : [`Ditt ${ordinal(visitNumber)} besök här`, lastVisitText].filter(Boolean).join("  ·  ")}
        </Reanimated.Text>
      </View>

      <Reanimated.View style={[StyleSheet.absoluteFill, s.flash, flashStyle]} />
    </View>
  );
}


const s = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  cardClip: {
    flex: 1, borderRadius: 26, overflow: "hidden", backgroundColor: "#1A1A1D",
  },
  noImage: { backgroundColor: "#24242A" },
  cardBorder: { ...StyleSheet.absoluteFillObject, borderRadius: 26, borderWidth: 1, borderColor: "rgba(233,196,106,0.35)" },
  info: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", alignItems: "center", gap: 12, padding: 18,
  },
  logoWrap: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: "#FFFFFF", overflow: "hidden",
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.9)",
  },
  logo: { width: "86%", height: "86%" },
  place: { fontFamily: "Montserrat_700Bold", fontSize: 24, lineHeight: 28, color: "#FFFFFF" },
  meta: { fontFamily: "Inter_500Medium", fontSize: 14, color: MUTED, marginTop: 4 },
  // Stämpeln landar i kortets övre högra hörn och hänger lite utanför kanten — som en riktig
  // stämpel slagen lite på sned, och utan att täcka namnet nedtill
  stampAnchor: {
    position: "absolute", right: -STAMP * 0.16, top: STAMP * 0.12,
    width: STAMP, height: STAMP, alignItems: "center", justifyContent: "center",
  },
  stampShadow: {
    position: "absolute", width: STAMP * 0.9, height: STAMP * 0.9, borderRadius: STAMP,
    backgroundColor: "#000",
  },
  inkRing: {
    position: "absolute", width: STAMP, height: STAMP, borderRadius: STAMP / 2,
    borderWidth: 3, borderColor: INK,
  },
  texts: { alignItems: "center", marginTop: 28, minHeight: 74 },
  headline: { fontFamily: "Montserrat_700Bold", fontSize: 30, color: FG, textAlign: "center" },
  sub: { fontFamily: "Inter_500Medium", fontSize: 15, color: INK, marginTop: 6, textAlign: "center" },
  flash: { backgroundColor: "#FFF6DE" },
});
