/**
 * Aktiv erbjudande-vy — personalens verifieringsskärm.
 *
 * Helskärm som låser appen i 60 sekunder. Inget går att göra utom att visa
 * skärmen för kassören: rörlig timerring, företagets namn och erbjudandet,
 * samt medlemskortets baksida med live-klocka som äkthetsbevis.
 *
 * Nedräkningen utgår ALLTID från activatedAt, aldrig från en lokal räknare —
 * annars skulle tiden pausas när appen läggs i bakgrunden och erbjudandet
 * kunna hållas aktivt hur länge som helst.
 */
import { useEffect, useRef, useState } from "react";
import { View, Text, Image, StyleSheet, Animated, Easing } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Defs,
  LinearGradient as SvgGrad,
  RadialGradient as SvgRadial,
  Stop,
  Circle as SvgCircle,
  Rect as SvgRect,
  Text as SvgText,
} from "react-native-svg";
import { MemberCard } from "@/components/MemberCard";
import { useProfile } from "@/hooks/useProfile";
import { useAvatarUrl, useCardPhotoUrl } from "@/hooks/useAvatarUrl";
import { useAuth } from "@/hooks/useAuth";
import { ACTIVE_SECS } from "@/lib/offers";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const GOLD    = "#C5A059";
const GOLD_LT = "#E8C674";
const GOLD_HI = "#F2D88A";
const FG      = "#F5F1E8";

const RING     = 200;
const STROKE   = 6;
const RADIUS   = (RING - STROKE) / 2;
const CIRC     = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

function secsLeft(activatedAt: number): number {
  const elapsed = (Date.now() - activatedAt) / 1000;
  return Math.max(0, Math.ceil(ACTIVE_SECS - elapsed));
}

export function ActiveOfferView({
  visible,
  activatedAt,
  placeName,
  placeLogoUrl,
  dealText,
  onClose,
}: {
  visible: boolean;
  /** Tidsstämpel (ms) när erbjudandet aktiverades */
  activatedAt: number;
  placeName: string;
  placeLogoUrl: string | null;
  dealText: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const avatarUrl = useAvatarUrl();
  const cardPhotoUrl = useCardPhotoUrl();

  const [remaining, setRemaining] = useState(() => secsLeft(activatedAt));
  const ringAnim  = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  // Nedräkning — läser klockan, räknar inte själv
  useEffect(() => {
    if (!visible) return;
    setRemaining(secsLeft(activatedAt));
    const id = setInterval(() => {
      const left = secsLeft(activatedAt);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        onClose();
      }
    }, 250);
    return () => clearInterval(id);
  }, [visible, activatedAt]);

  // Ringen animeras i ett svep över den tid som faktiskt återstår, så den
  // rör sig mjukt istället för att hoppa var 250:e millisekund
  useEffect(() => {
    if (!visible) return;
    const leftMs = Math.max(0, activatedAt + ACTIVE_SECS * 1000 - Date.now());
    ringAnim.setValue(leftMs / (ACTIVE_SECS * 1000));
    Animated.timing(ringAnim, {
      toValue: 0,
      duration: leftMs,
      easing: Easing.linear,
      useNativeDriver: false, // strokeDashoffset går inte via native driver
    }).start();
    return () => ringAnim.stopAnimation();
  }, [visible, activatedAt]);

  // Pulserande guldprick + "AKTIVT"
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible]);

  const dashOffset = ringAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRC, 0],
  });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });

  const mmss = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "Medlem";
  const memberSince = profile?.created_at
    ? format(new Date(profile.created_at), "MMMM yyyy", { locale: sv })
    : null;

  if (!visible) return null;

  return (
    <View style={[a.screen, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        {/* Diskret guldglöd bakom allt */}
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgRadial id="activeGlow" cx="50%" cy="45%" rx="65%" ry="40%">
              <Stop offset="0%"   stopColor={GOLD} stopOpacity={0.10} />
              <Stop offset="45%"  stopColor={GOLD} stopOpacity={0.04} />
              <Stop offset="100%" stopColor={GOLD} stopOpacity={0}    />
            </SvgRadial>
          </Defs>
          <SvgRect width="100%" height="100%" fill="url(#activeGlow)" />
        </Svg>

        {/* ── Företagsidentitet ── */}
        <View style={a.identity}>
          <View style={a.logoWrap}>
            {placeLogoUrl ? (
              <Image source={{ uri: placeLogoUrl }} style={a.logo} resizeMode="cover" />
            ) : (
              <Text style={a.logoFallback}>{placeName.charAt(0).toUpperCase()}</Text>
            )}
          </View>

          <Text style={a.placeName} numberOfLines={1}>{placeName}</Text>

          <View style={a.statusRow}>
            <Animated.View style={[a.pulseDot, { opacity: pulseOpacity }]} />
            <Text style={a.statusLabel}>AKTIVT ERBJUDANDE</Text>
          </View>

          <Text style={a.dealText} numberOfLines={2}>{dealText}</Text>
        </View>

        {/* ── Timerring ── */}
        <View style={a.ringWrap}>
          <Svg width={RING} height={RING}>
            <Defs>
              <SvgGrad id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%"   stopColor={GOLD_HI} />
                <Stop offset="100%" stopColor={GOLD} />
              </SvgGrad>
              <SvgGrad id="activeTextGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%"   stopColor="#F6E7BC" />
                <Stop offset="45%"  stopColor={GOLD_LT} />
                <Stop offset="100%" stopColor="#B8934A" />
              </SvgGrad>
            </Defs>

            {/* Spår */}
            <SvgCircle
              cx={RING / 2} cy={RING / 2} r={RADIUS}
              stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE} fill="none"
            />
            {/* Progress — roterad så den startar högst upp */}
            <AnimatedCircle
              cx={RING / 2} cy={RING / 2} r={RADIUS}
              stroke="url(#ringGrad)" strokeWidth={STROKE} fill="none"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />

            {/* Guldgradient-text kräver SVG — vanlig color går inte */}
            <SvgText
              x={RING / 2} y={RING / 2 + 2}
              textAnchor="middle"
              fontSize={30}
              fontFamily="PlayfairDisplay_700Bold"
              fill="url(#activeTextGrad)"
            >
              AKTIVT
            </SvgText>
          </Svg>

          <Text style={a.countdown}>{mmss}</Text>
        </View>

        <Text style={a.instruction}>VISA DENNA SKÄRM FÖR PERSONALEN</Text>

        {/* ── Medlemskortets baksida = äkthetsbeviset ── */}
        <View style={a.cardWrap}>
          <MemberCard
            showBackOnly
            displayName={displayName}
            isMember
            memberSince={memberSince}
            cardColor={profile?.card_color}
            avatarUrl={avatarUrl}
            profileImageUrl={cardPhotoUrl}
            onBuyPress={() => {}}
          />
        </View>
    </View>
  );
}

const a = StyleSheet.create({
  // Överlägg, inte egen Modal — ligger inuti drawerns modal och måste
  // täcka allt, inklusive drawern själv
  screen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    backgroundColor: "#000",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  identity: { alignItems: "center", gap: 6 },
  logoWrap: {
    width: 64, height: 64, borderRadius: 32,
    overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(230,199,122,0.45)",
    backgroundColor: "#141416",
    alignItems: "center", justifyContent: "center",
    shadowColor: GOLD, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 6,
    marginBottom: 6,
  },
  logo: { width: "100%", height: "100%" },
  logoFallback: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 24, color: GOLD_LT },
  placeName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 17, color: FG },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD_LT },
  statusLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 10, color: GOLD_LT,
    letterSpacing: 2.8,
  },
  dealText: {
    fontFamily: "PlayfairDisplay_700Bold", fontSize: 19, color: FG,
    textAlign: "center", marginTop: 4,
  },

  ringWrap: { alignItems: "center", marginTop: 32 },
  countdown: {
    fontFamily: "Inter_400Regular", fontSize: 13,
    color: "rgba(255,255,255,0.55)",
    marginTop: -28,
    fontVariant: ["tabular-nums"],
  },

  instruction: {
    fontFamily: "Inter_400Regular", fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 2.64,
    textAlign: "center",
    marginTop: 24,
  },

  cardWrap: { marginTop: "auto" as any, width: "100%", alignItems: "center" },
});
