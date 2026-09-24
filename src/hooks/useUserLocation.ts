import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";

export type UserLocationState =
  | { status: "loading" }
  | { status: "denied" }
  | { status: "unavailable" } // platstjänster av, eller ingen position gick att få
  | { status: "ready"; lat: number; lng: number; accuracy: number | null };

/**
 * Hämtar användarens position EN gång (och igen vid refresh()) — inget
 * bevakas i bakgrunden. Ber om platsbehörighet "medan appen används" första
 * gången, och bara om `enabled` är sant, så vanliga platssidor utan
 * incheckning inte visar en behörighetsfråga i onödan.
 */
export function useUserLocation(enabled: boolean) {
  const [state, setState] = useState<UserLocationState>({ status: "loading" });

  const refresh = useCallback(async (): Promise<UserLocationState> => {
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== "granted" && perm.canAskAgain) {
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (perm.status !== "granted") {
        const next: UserLocationState = { status: "denied" };
        setState(next);
        return next;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next: UserLocationState = {
        status: "ready",
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
      };
      setState(next);
      return next;
    } catch {
      const next: UserLocationState = { status: "unavailable" };
      setState(next);
      return next;
    }
  }, []);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  return { location: state, refresh };
}
