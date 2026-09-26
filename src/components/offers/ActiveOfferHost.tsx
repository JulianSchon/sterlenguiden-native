/**
 * Lagret som visar personalskärmen ovanpå hela appen medan ett erbjudande är aktivt.
 * Ligger i rotlayouten, så skärmen syns oavsett var i appen man är och överlever en omstart.
 */
import { useQueryClient } from "@tanstack/react-query";
import { ActiveOfferView } from "./ActiveOfferView";
import { ACTIVE_REDEMPTION_KEY, useActiveRedemption } from "@/hooks/useActiveRedemption";
import { ACTIVE_SECS } from "@/lib/offers";

export function ActiveOfferHost() {
  const queryClient = useQueryClient();
  const { data } = useActiveRedemption();

  if (!data || Date.now() >= data.activatedAt + ACTIVE_SECS * 1000) return null;

  return (
    <ActiveOfferView
      visible
      activatedAt={data.activatedAt}
      placeName={data.placeName}
      placeLogoUrl={data.placeLogoUrl}
      dealText={data.title}
      onClose={() => queryClient.setQueryData(ACTIVE_REDEMPTION_KEY, null)}
    />
  );
}
