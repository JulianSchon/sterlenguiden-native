/**
 * Lagret som visar personalskärmen ovanpå hela appen medan ett erbjudande är aktivt.
 * Ligger i rotlayouten, så skärmen syns oavsett var i appen man är och överlever en omstart.
 *
 * Tiden räknas med serverns klocka (serverNow). När appen kommer tillbaka från bakgrunden läses
 * den aktiva aktiveringen om från servern, vilket också ställer om klockan — man kan alltså inte
 * gå ut, ändra telefonens klocka och komma tillbaka till en förlängd nedräkning.
 */
import { useEffect } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { ActiveOfferView } from "./ActiveOfferView";
import { ACTIVE_REDEMPTION_KEY, useActiveRedemption } from "@/hooks/useActiveRedemption";
import { ACTIVE_SECS } from "@/lib/offers";
import { serverNow } from "@/lib/serverClock";

export function ActiveOfferHost() {
  const queryClient = useQueryClient();
  const { data } = useActiveRedemption();

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") queryClient.invalidateQueries({ queryKey: ACTIVE_REDEMPTION_KEY });
    });
    return () => sub.remove();
  }, [queryClient]);

  if (!data || serverNow() >= data.activatedAt + ACTIVE_SECS * 1000) return null;

  return (
    <ActiveOfferView
      visible
      activatedAt={data.activatedAt}
      placeName={data.placeName}
      placeLogoUrl={data.placeLogoUrl}
      dealText={data.title}
      category={data.category}
      savingsLabel={data.savingsLabel}
      onClose={() => queryClient.setQueryData(ACTIVE_REDEMPTION_KEY, null)}
    />
  );
}
