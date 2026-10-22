/**
 * Belöningskort: kortdesigner man vinner i stället för väljer fritt (migration 031) —
 * Skattjägare (alla skatter) och topplistekorten (flest besök en månad / ett år, ett eget kort
 * för varje period). Korten och deras bilder ligger på servern (reward_cards, lagringsmappen
 * "cards"), så ett nytt kort kräver ingen ny version av appen. Vilka man äger står i user_cards;
 * dit skriver bara servern.
 */
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { CARD_VARIANTS, type CardVariant } from "@/lib/cardVariants";
import { formatDate } from "@/i18n/dates";

const BUCKET = "cards";

export type RewardCardKind = "treasures" | "visits_month" | "visits_year";

export interface RewardCard {
  id: string;
  name: string;
  kind: RewardCardKind;
  /** "2026-10" för månadskort, "2026" för årskort, null för Skattjägare */
  period: string | null;
  imageUrl: string | null;
  bg: string;
  bg2: string;
  light: boolean;
}

interface OwnedCard {
  cardId: string;
  awardedAt: string;
  /** När presenten öppnades; null = presenten väntar */
  seenAt: string | null;
}

interface RewardCardRow {
  id: string; name: string; kind: RewardCardKind; period: string | null;
  image_path: string | null; bg: string; bg2: string; light: boolean;
}

/** Alla belöningskort som finns. */
export function useRewardCards() {
  return useQuery({
    queryKey: ["reward-cards"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<RewardCard[]> => {
      const { data, error } = await supabase.from("reward_cards").select("*").order("created_at");
      if (error) throw error;
      return ((data ?? []) as RewardCardRow[]).map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        period: c.period,
        imageUrl: c.image_path ? supabase.storage.from(BUCKET).getPublicUrl(c.image_path).data.publicUrl : null,
        bg: c.bg,
        bg2: c.bg2,
        light: c.light,
      }));
    },
  });
}

/** Belöningskorten jag äger. */
export function useMyCards() {
  return useQuery({
    queryKey: ["my-cards"],
    queryFn: async (): Promise<OwnedCard[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_cards")
        .select("card_id, awarded_at, seen_at")
        .eq("user_id", user.id)
        .order("awarded_at");
      if (error) throw error;
      return ((data ?? []) as { card_id: string; awarded_at: string; seen_at: string | null }[])
        .map((r) => ({ cardId: r.card_id, awardedAt: r.awarded_at, seenAt: r.seen_at }));
    },
  });
}

/**
 * Presenten för kortet har öppnats — visas inte igen. Mina kort hämtas INTE om direkt: svaret kom
 * mitt i presenten och ritade om (TrophyHost håller själv reda på öppnade presenter till dess).
 */
export function markCardSeen(cardId: string) {
  supabase.rpc("mark_card_seen", { p_card_id: cardId }).then(noop, noop);
}

const noop = () => {};

/** Belöningskortet som en kortvariant, så medlemskortet kan ritas med det. */
export function rewardCardVariant(card: RewardCard): CardVariant {
  return {
    id: card.id,
    name: card.name,
    bg: card.bg,
    bg2: card.bg2,
    bgImage: card.imageUrl ? { uri: card.imageUrl } : undefined,
    light: card.light,
  };
}

/** Kortets namn på användarens språk: "Skattjägare", "Månadens besökare oktober 2026", "Årets besökare 2026". */
export function rewardCardName(card: RewardCard, t: TFunction): string {
  if (card.kind === "treasures") return t("appearance.designs.skattjagare");
  if (card.kind === "visits_month" && card.period) {
    return t("appearance.designs.visitsMonth", { period: formatDate(`${card.period}-01T12:00:00`, "MMMM yyyy") });
  }
  if (card.kind === "visits_year" && card.period) return t("appearance.designs.visitsYear", { period: card.period });
  return card.name;
}

// Medan belöningskorten laddas: en neutral mörk yta i stället för en annan design
const LOADING_VARIANT: CardVariant = { id: "loading", name: "", bg: "#191918", bg2: "#111111", light: false };

/**
 * Kortvarianten för en vald design — en vanlig design eller ett belöningskort. Okänt id (eller
 * inget valt) ger första designen.
 */
export function useCardVariant(id?: string | null): CardVariant {
  const builtIn = CARD_VARIANTS.find((v) => v.id === id);
  const { data: cards } = useRewardCards();
  if (builtIn) return builtIn;
  if (!id) return CARD_VARIANTS[0];
  if (!cards) return LOADING_VARIANT;
  const card = cards.find((c) => c.id === id);
  return card ? rewardCardVariant(card) : CARD_VARIANTS[0];
}

