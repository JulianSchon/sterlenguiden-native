import AsyncStorage from "@react-native-async-storage/async-storage";
import { MutationCache, QueryClient, type Query } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { isNetworkError, notifyOffline } from "@/lib/network";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /** Sidan visar själv ett meddelande när det misslyckas (då visas inte "Du är utan nät" också) */
      ownError?: boolean;
      /** Sker i bakgrunden utan att man tryckt på något: inget meddelande */
      background?: boolean;
    };
  }
}

export const queryClient = new QueryClient({
  // Något man gjorde gick inte att spara för att nätet saknas: säg det, i stället för att det tyst
  // inte blev av (hjärtan och svep sparas i stället senare, se lib/outbox)
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (isNetworkError(error) && !mutation.meta?.ownError && !mutation.meta?.background) notifyOffline();
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      // Ligger kvar ett dygn även när ingen sida visar den, så den kan sparas i telefonen (se nedan)
      gcTime: 1000 * 60 * 60 * 24,
      retry: 2,
    },
  },
});

/**
 * Datan sparas i telefonen mellan starterna: appen visar det senast kända direkt (platser, profil,
 * favoriter …) och hämtar nytt i bakgrunden, i stället för att börja om från tomt varje gång. Det
 * gör också att appen visar något utan nät. Rensas när man loggar ut (app/_layout.tsx).
 */
export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "query-cache:v3",
  throttleTime: 2000,
  // Som JSON, men Map och Set (t.ex. hittade skatter) överlever: vanlig JSON gör dem till tomma {}
  serialize: (data) => JSON.stringify(data, (_, v) =>
    v instanceof Map ? { __map: [...v] } : v instanceof Set ? { __set: [...v] } : v),
  deserialize: (text) => JSON.parse(text, (_, v) =>
    v && typeof v === "object" ? ("__map" in v ? new Map(v.__map) : "__set" in v ? new Set(v.__set) : v) : v),
});

/** Hur gammal sparad data får vara för att visas vid start */
export const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24 * 7;

// Det som visas när appen startar. Inte det som styr engångsögonblick (paketen med nya kort,
// listinbjudningarna): sparat och gammalt kunde de visas en gång till. Inte heller företagsportalen.
const PERSISTED = new Set([
  "places", "events", "news", "offers", "service-points", "collectibles", "place-towns", "pass-products",
  "reward-cards", "business-stories", "profile", "favorites", "visits", "lists", "memories", "app-days",
  "achievements", "collected", "offer-redemptions", "discovery_likes", "discovery_dismissals",
  "avatar-url", "card-photo-url", "friends", "leaderboard",
]);

export function shouldPersistQuery(query: Query): boolean {
  if (query.state.status !== "success") return false;
  const [root, sub] = query.queryKey;
  if (root === "lists" && sub === "pending-invites") return false;
  // Platsväljarens sökresultat: ett nytt för varje ord man skriver
  if (root === "places" && sub === "search") return false;
  return PERSISTED.has(String(root));
}

const APP_STARTED_AT = Date.now();

/**
 * Har datan hämtats sedan appen startade (eller är den sparade färsk nog att inte hämtas om)? Det
 * som räknar om något är NYTT (troféer, ringar) väntar på det — sparad data från förra gången kan
 * annars uppdateras i olika takt och få något som redan firats att se nytt ut.
 */
export function isFreshSinceStart(q: { isSuccess: boolean; isStale: boolean; dataUpdatedAt: number }): boolean {
  return q.isSuccess && (q.dataUpdatedAt >= APP_STARTED_AT || !q.isStale);
}
