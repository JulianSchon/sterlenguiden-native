/**
 * Läser in och avkodar kortens bakgrundsbilder i bakgrunden, osynligt, så att korten redan har sin bild
 * när man kommer till Profil eller Utseende i stället för att först visas som en enfärgad yta.
 * Först det valda kortet i profilens storlek, sedan alla kort i Utseendes storlek och till sist alla i
 * profilens storlek. Bilderna släpps efteråt men ligger kvar i bildminnet så länge telefonen har plats.
 */
import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { useProfile } from "@/hooks/useProfile";
import { CARD_VARIANTS, getVariant } from "@/lib/cardVariants";
import { CARD_W, CARD_H } from "@/components/MemberCard";
import { CAROUSEL_CARD_WIDTH } from "@/lib/cardImages";

export function CardImagePreloader() {
  const { data: profile } = useProfile();
  const ready = !!profile;
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!ready) return;
    setStage(1);
    const timers = [setTimeout(() => setStage(2), 3000), setTimeout(() => setStage(3), 6000), setTimeout(() => setStage(4), 9000)];
    return () => timers.forEach(clearTimeout);
  }, [ready]);

  if (stage === 0 || stage === 4) return null;

  const chosen = getVariant(profile?.card_color);
  const jobs =
    stage === 1 ? [{ variant: chosen, width: CARD_W }]
    : stage === 2 ? CARD_VARIANTS.map((variant) => ({ variant, width: CAROUSEL_CARD_WIDTH }))
    : CARD_VARIANTS.map((variant) => ({ variant, width: CARD_W }));

  return (
    <View pointerEvents="none" style={{ position: "absolute", left: -10000, top: 0, opacity: 0.01 }}>
      {jobs.map(({ variant, width }) =>
        variant.bgImage ? (
          <Image key={`${variant.id}-${width}`} source={variant.bgImage} style={{ width, height: (width * CARD_H) / CARD_W }} resizeMode="cover" />
        ) : null
      )}
    </View>
  );
}
