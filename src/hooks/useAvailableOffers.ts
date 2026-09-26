import { useOffers } from "@/hooks/useOffers";
import { useOfferRedemptions } from "@/hooks/useOfferRedemptions";
import { offerEligibility } from "@/lib/offers";

/**
 * Erbjudandena användaren kan lösa in just nu (aktiva och inte redan använda).
 * Delas av Profil och Österlenpasset så att de alltid visar samma antal.
 */
export function useAvailableOffers() {
  const { data: offers = [] } = useOffers();
  const { data: redemptions = [] } = useOfferRedemptions();
  const available = offers.filter((o) => offerEligibility(o, redemptions).canUse);
  return { available };
}
