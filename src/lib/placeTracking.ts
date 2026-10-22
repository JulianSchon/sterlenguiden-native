/**
 * Företagens statistik: när någon öppnar en platssida, trycker på telefon, hemsida, boka, Instagram,
 * Facebook eller e-post, eller tar fram en vägbeskrivning. Skickas i bakgrunden och märks aldrig —
 * går det inte (inget nät, databasen utan migration 046) händer ingenting.
 *
 * Databasen (track_place_event) räknar inte företagets egna visningar, räknar samma person som en
 * visning per halvtimme och ett dubbeltryck som ett klick. Företaget ser bara antal, aldrig vem.
 */
import type { NavigationState, PartialState } from "@react-navigation/native";
import { supabase } from "@/integrations/supabase/client";

type PlaceLink = "phone" | "website" | "book" | "instagram" | "facebook" | "email";

/** Var i appen man kom ifrån ("Så hittade de er" i statistiken) */
type PlaceSource =
  | "home" | "search" | "map" | "calendar" | "profile" | "category" | "lists" | "place" | "offers" | "story" | "friends"
  | "event" | "discover" | "news" | "checkin" | "other";

const SOURCES: PlaceSource[] = [
  "home", "search", "map", "calendar", "profile", "category", "lists", "place", "offers", "story", "friends",
  "event", "discover", "news", "checkin",
];

/** ?from=… från länken till platssidan (den som öppnade sidan vet bäst varifrån) */
export function sourceFromParam(from: string | undefined): PlaceSource | null {
  return from && (SOURCES as string[]).includes(from) ? (from as PlaceSource) : null;
}

function send(placeId: number, kind: "profile_view" | "link_click" | "navigation_click", link: PlaceLink | null, source: PlaceSource | null) {
  supabase.rpc("track_place_event", {
    p_place_id: placeId, p_kind: kind, p_link: link ?? undefined, p_source: source ?? undefined,
  }).then(() => {}, () => {});
}

export const trackPlaceView = (placeId: number, source: PlaceSource | null) => send(placeId, "profile_view", null, source);
export const trackPlaceLink = (placeId: number, link: PlaceLink) => send(placeId, "link_click", link, null);
export const trackDirections = (placeId: number) => send(placeId, "navigation_click", null, null);

const TAB_SOURCE: Record<string, PlaceSource> = {
  index: "home", explore: "search", map: "map", calendar: "calendar", profile: "profile",
};

type AnyState = NavigationState | PartialState<NavigationState> | undefined;

/** Sidan man kom från: den under platssidan i navigeringen (fliken om det var en av flikarna) */
export function placeSource(state: AnyState): PlaceSource {
  const routes = state?.routes ?? [];
  const index = state?.index ?? routes.length - 1;
  const prev = routes[index - 1];
  if (!prev) return "other";
  const name = prev.name;
  if (name === "(tabs)") {
    const tabs = prev.state as AnyState;
    const tab = tabs?.routes?.[tabs.index ?? 0]?.name;
    return (tab && TAB_SOURCE[tab]) || "home";
  }
  if (name.startsWith("place/")) return "place";
  if (name.startsWith("lists/") || name === "favorites") return "lists";
  if (name.startsWith("category/")) return "category";
  if (name === "offers") return "offers";
  if (name.startsWith("friend")) return "friends";
  if (name === "discover" || name.startsWith("news/")) return "home";
  return "other";
}
