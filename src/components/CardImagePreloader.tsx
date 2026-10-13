/**
 * Läser in och avkodar kortens bakgrundsbilder i bakgrunden, osynligt, så att korten redan har sin bild
 * när man kommer till Profil eller Utseende i stället för att först visas som en enfärgad yta.
 * Först det valda kortet i profilens storlek, sedan alla kort i Utseendes storlek och till sist alla i
 * profilens storlek. Belöningskort man äger (bilder från servern) räknas som vanliga kort. Bilderna
 * släpps efteråt men ligger kvar i bildminnet så länge telefonen har plats.
 *
 * När allt är avkodat (och appen inte längre har något annat på gång) räknas starten som klar —
 * se appSettled.ts.
 */
import { useEffect, useState } from "react";
import { Image, InteractionManager, View } from "react-native";
import { useProfile } from "@/hooks/useProfile";
import { CARD_VARIANTS } from "@/lib/cardVariants";
import { rewardCardVariant, useCardVariant, useMyCards, useRewardCards } from "@/hooks/useRewardCards";
import { CARD_W, CARD_H } from "@/components/MemberCard";
import { CAROUSEL_CARD_WIDTH } from "@/lib/cardImages";
import { markAppSettled } from "@/lib/appSettled";

export function CardImagePreloader() {
  const { data: profile } = useProfile();
  const ready = !!profile;
  const [stage, setStage] = useState(0);
  const chosen = useCardVariant(profile?.card_color);
  const { data: rewardCards = [] } = useRewardCards();
  const { data: mine = [] } = useMyCards();

  useEffect(() => {
    if (!ready) return;
    setStage(1);
    const timers = [setTimeout(() => setStage(2), 2000), setTimeout(() => setStage(3), 4000), setTimeout(() => setStage(4), 6000)];
    return () => timers.forEach(clearTimeout);
  }, [ready]);

  // Klart: starten räknas som lugn en stund efter att appen slutat jobba
  useEffect(() => {
    if (stage !== 4) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const task = InteractionManager.runAfterInteractions(() => { timer = setTimeout(markAppSettled, 1000); });
    return () => {
      task.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [stage]);

  if (stage === 0 || stage === 4) return null;

  const owned = rewardCards.filter((c) => mine.some((m) => m.cardId === c.id)).map(rewardCardVariant);
  const all = [...CARD_VARIANTS, ...owned];
  const jobs =
    stage === 1 ? [{ variant: chosen, width: CARD_W }]
    : stage === 2 ? all.map((variant) => ({ variant, width: CAROUSEL_CARD_WIDTH }))
    : all.map((variant) => ({ variant, width: CARD_W }));

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
