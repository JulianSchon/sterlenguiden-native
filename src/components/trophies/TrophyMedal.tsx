/**
 * Ritningen av en trofé — delad mellan Utmaningar-sidan och incheckningens
 * belöningsskärm, så en trofé ser likadan ut överallt den visas.
 */
import { View, Text, Image, StyleSheet } from "react-native";
import {
  Canvas, Circle, SweepGradient, RadialGradient, BlurMask, vec,
} from "@shopify/react-native-skia";
import { TIER_PALETTE, type Tier } from "@/lib/achievements";

// Riktig trofékonst (ChatGPT-genererad, beskuren till transparent PNG per
// grupp+nivå, se assets/badges/). Grupper utan bild här faller tillbaka på
// den ritade Skia-medaljen längre ner.
export const BADGE_IMAGES: Partial<Record<string, any>> = {
  "utforskaren-bronze": require("../../../assets/badges/utforskaren-bronze.png"),
  "utforskaren-silver": require("../../../assets/badges/utforskaren-silver.png"),
  "utforskaren-gold": require("../../../assets/badges/utforskaren-gold.png"),
  "formansjagaren-bronze": require("../../../assets/badges/formansjagaren-bronze.png"),
  "formansjagaren-silver": require("../../../assets/badges/formansjagaren-silver.png"),
  "formansjagaren-gold": require("../../../assets/badges/formansjagaren-gold.png"),
  "samlaren-bronze": require("../../../assets/badges/samlaren-bronze.png"),
  "samlaren-silver": require("../../../assets/badges/samlaren-silver.png"),
  "samlaren-gold": require("../../../assets/badges/samlaren-gold.png"),
  "mangsidig-bronze": require("../../../assets/badges/mangsidig-bronze.png"),
  "mangsidig-silver": require("../../../assets/badges/mangsidig-silver.png"),
  "mangsidig-gold": require("../../../assets/badges/mangsidig-gold.png"),
  "bladdraren-bronze": require("../../../assets/badges/bladdraren-bronze.png"),
  "bladdraren-silver": require("../../../assets/badges/bladdraren-silver.png"),
  "bladdraren-gold": require("../../../assets/badges/bladdraren-gold.png"),
  "osterlenlegend-bronze": require("../../../assets/badges/osterlenlegend-bronze.png"),
  "osterlenlegend-silver": require("../../../assets/badges/osterlenlegend-silver.png"),
  "osterlenlegend-gold": require("../../../assets/badges/osterlenlegend-gold.png"),
  "kom-igang-bronze": require("../../../assets/badges/kom-igang-bronze.png"),
  "kom-igang-silver": require("../../../assets/badges/kom-igang-silver.png"),
  "kom-igang-gold": require("../../../assets/badges/kom-igang-gold.png"),
};

// GlowCanvas — en mjukt suddig cirkel bakom en medalj/troféart.
// Canvas-ytan var förut exakt lika stor som den synliga medaljen, så Skia
// klippte den suddiga kanten (BlurMask) rakt av vid kanten — resultatet blev
// en tydlig FYRKANT bakom den runda glöden istället för en mjuk avtoning.
// Fixen är att rita på en mycket större, osynlig duk centrerad bakom
// medaljen så oskärpan hinner tona bort helt innan den når kanten.
export function GlowCanvas({
  size, color, opacity = 0.5, radiusRatio = 0.34, blurRatio = 0.18,
}: { size: number; color: string; opacity?: number; radiusRatio?: number; blurRatio?: number }) {
  const neededHalf = size * radiusRatio + size * blurRatio * 3.5; // ~3.5 sigma = helt utfasad
  const pad = Math.max(neededHalf - size / 2, 0) + size * 0.1;
  const canvasSize = size + pad * 2;
  return (
    // pointerEvents="none" är kritiskt: duken kan bli mycket större än den
    // synliga medaljen och skulle annars fånga tryck som var menade för det
    // som ligger ovanför/bredvid — t.ex. en tillbaka-knapp — trots att den
    // är osynlig där.
    <Canvas
      style={{ position: "absolute", width: canvasSize, height: canvasSize, left: -pad, top: -pad }}
      pointerEvents="none"
    >
      <Circle cx={canvasSize / 2} cy={canvasSize / 2} r={size * radiusRatio} color={color} opacity={opacity}>
        <BlurMask blur={size * blurRatio} style="normal" />
      </Circle>
    </Canvas>
  );
}

export function TrophyMedal({
  size, tier, Icon, unlocked, groupId,
}: {
  size: number; tier: Tier; Icon: React.ComponentType<any>; unlocked: boolean; groupId: string;
}) {
  const artwork = BADGE_IMAGES[`${groupId}-${tier}`];
  const palette = TIER_PALETTE[tier];

  // Har vi riktig trofékonst för den här? Då ersätter illustrationen hela
  // den ritade myntmedaljen. Upplåst = fullfärg + mjuk glöd. Låst = en mörk
  // siluett av SAMMA form (tintColor följer bildens alfakanal) istället för
  // den generiska grå cirkeln med "?" — man ska ana formen utan att se den.
  if (artwork) {
    return (
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", opacity: unlocked ? 1 : 0.6 }}>
        {unlocked && <GlowCanvas size={size} color={palette.rim} opacity={0.55} radiusRatio={0.34} blurRatio={0.18} />}
        <Image
          source={artwork}
          style={{
            width: size * 1.06,
            height: size * 1.06,
            tintColor: unlocked ? undefined : "#3A3A3A",
          }}
          resizeMode="contain"
        />
      </View>
    );
  }
  const rim   = unlocked ? palette.rim : "#3A3A3A";
  const field = unlocked ? palette.field : (["#4A4A4A", "#333333", "#232323"] as const);
  const ink   = unlocked ? palette.ink : "rgba(255,255,255,0.28)";

  const c = size / 2;
  const rimR   = size / 2 - 1;
  const fieldR = size / 2 - size * 0.09;

  // Graverad kant — äkta konisk gradient (SweepGradient). Det här gick
  // inte i SVG, som bara har linjära/radiella gradienter — resultatet där
  // var en platt ensfärgad ring. Skia ger en riktig "borstat metall"-kant.
  const rimColors = unlocked
    ? [rim, "#1a1a1a", rim, "#0d0d0d", rim]
    : [rim, "#161616", rim, "#0a0a0a", rim];

  return (
    <View style={{ width: size, height: size, opacity: unlocked ? 1 : 0.6 }}>
      {unlocked && <GlowCanvas size={size} color={rim} opacity={0.5} radiusRatio={fieldR / size} blurRatio={0.16} />}
      <Canvas style={{ width: size, height: size }}>
        <Circle cx={c} cy={c} r={rimR} style="stroke" strokeWidth={Math.max(2, size * 0.07)}>
          <SweepGradient c={vec(c, c)} colors={rimColors} />
        </Circle>
        <Circle cx={c} cy={c} r={fieldR}>
          <RadialGradient c={vec(c * 0.75, c * 0.65)} r={size * 0.85} colors={field as unknown as string[]} />
        </Circle>
      </Canvas>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {unlocked ? (
            <Icon size={size * 0.38} color={ink} strokeWidth={1.6} />
          ) : (
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: size * 0.36, color: "rgba(255,255,255,0.30)" }}>?</Text>
          )}
        </View>
      </View>
    </View>
  );
}
