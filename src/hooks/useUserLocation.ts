import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";

type UserLocationState =
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
/**
 * Användarens senast kända position — bara om platsbehörigheten redan finns. Frågar aldrig, så en
 * sida kan visa "12 km från dig" när det går utan att avbryta med en behörighetsfråga.
 */
export function useKnownLocation() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== "granted") return;
        const last = await Location.getLastKnownPositionAsync();
        if (alive && last) setPos({ lat: last.coords.latitude, lng: last.coords.longitude });
      } catch {
        // Ingen position — sidan klarar sig utan
      }
    })();
    return () => { alive = false; };
  }, []);
  return pos;
}

const FRESH_TIMEOUT_MS = 10_000;
const LAST_KNOWN_MAX_AGE_MS = 2 * 60_000;

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
      // Inomhus eller med svag signal kan en ny position dröja länge: efter en stund räcker den senast
      // kända, om den är färsk (servern räknar ändå avståndet själv vid incheckningen)
      const pos = (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), FRESH_TIMEOUT_MS)),
      ])) ?? (await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }));
      if (!pos) {
        const next: UserLocationState = { status: "unavailable" };
        setState(next);
        return next;
      }
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
