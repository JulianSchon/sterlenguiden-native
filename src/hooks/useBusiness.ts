/**
 * Företagsportalens data: vilka platser jag sköter, platsen själv, personalen, erbjudanden,
 * evenemang, berättelser, statistiken och (för admin) förfrågningarna. Allt går genom databasens
 * egna funktioner (migration 046), som kollar att man sköter platsen.
 *
 * Sidorna sparar medan man skriver (usePlaceAutosave): ändringarna samlas och skickas en kort stund
 * efter att man slutat skriva, och direkt när man lämnar sidan.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "@/integrations/supabase/client";
import { normalizePlace, type Place } from "@/hooks/usePlaces";
import type { Tables } from "@/integrations/supabase/types";
import type { Event } from "@/hooks/useEvents";
import {
  businessError, rpc,
  type AdminRequest, type BusinessOffer, type BusinessOverview, type BusinessPlace, type BusinessStats,
  type BusinessStory, type ClaimInfo, type MemberRole, type Permission, type PlacePatch, type StoryLink, type Team,
} from "@/lib/business";

// ── Vad jag sköter ──────────────────────────────────────────────────────────

/** Mina platser, inbjudningar till mig, mina förfrågningar och (för admin) väntande förfrågningar */
export function useBusinessOverview() {
  return useQuery({
    queryKey: ["business", "overview"],
    staleTime: 30_000,
    queryFn: () => rpc<BusinessOverview>("business_overview"),
  });
}

/**
 * Platsen en Mitt företag-sida gäller (?place=…, annars den första man sköter), och om man
 * faktiskt sköter den (mine = null om inte).
 */
export function usePortalPlace() {
  const { place } = useLocalSearchParams<{ place?: string }>();
  const { data: overview, isLoading, error, refetch } = useBusinessOverview();
  const places = overview?.places ?? [];
  const placeId = Number(place) || places[0]?.id || 0;
  const mine = places.find((p) => p.id === placeId) ?? null;
  return { placeId, mine, places, loading: isLoading && !overview, error: overview ? null : error, refetch };
}

/** Platserna jag sköter (för att t.ex. inte kunna lösa in sina egna erbjudanden) */
export function useMyPlaceIds(): Set<number> {
  const { data } = useBusinessOverview();
  return useMemo(() => new Set((data?.places ?? []).map((p) => p.id)), [data]);
}

// ── Platsen ─────────────────────────────────────────────────────────────────

export function useBusinessPlace(placeId: number) {
  return useQuery({
    queryKey: ["business", "place", placeId],
    enabled: placeId > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("places").select("*").eq("id", placeId).single();
      if (error) throw error;
      return data as unknown as BusinessPlace;
    },
  });
}

/**
 * Sparar och lägger in det sparade direkt i appens listor (karta, sök, platssidan), så ändringen
 * syns överallt utan att alla platser behöver hämtas om.
 */
async function savePatch(queryClient: QueryClient, placeId: number, patch: PlacePatch): Promise<BusinessPlace> {
  const row = await rpc<BusinessPlace>("business_update_place", { p_place_id: placeId, p_patch: patch });
  queryClient.setQueryData<BusinessPlace>(["business", "place", placeId], (old) => (old ? { ...old, ...row } : row));
  const merge = (p: Place) => normalizePlace({ ...p, ...row } as unknown as Tables<"places">);
  queryClient.setQueryData<Place[]>(["places"], (old) => old?.map((p) => (p.id === placeId ? merge(p) : p)));
  queryClient.setQueryData<Place>(["place", placeId], (old) => (old ? merge(old) : old));
  if ("name" in patch || "logo_url" in patch || "image_url" in patch) {
    queryClient.invalidateQueries({ queryKey: ["business", "overview"] });
  }
  return row;
}

export function useUpdatePlace(placeId: number) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (patch: PlacePatch) => savePatch(queryClient, placeId, patch) });
}

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Sparar medan man skriver. `queue(patch)` samlar ändringar och skickar dem `delay` ms efter den
 * sista (direkt med `now`). En sak sparas i taget, i ordning. Ett nätfel sparas om med nästa
 * ändring; ett värde som inte går (fel telefon …) släpps, och felet visas.
 */
export function usePlaceAutosave(placeId: number, delay = 800) {
  const queryClient = useQueryClient();
  const pending = useRef<PlacePatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<boolean> | null>(null);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    while (running.current) await running.current;
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return true;
    pending.current = {};
    setState("saving");
    const job = savePatch(queryClient, placeId, patch).then(
      () => {
        setState(Object.keys(pending.current).length > 0 ? "saving" : "saved");
        setError(null);
        return true;
      },
      (e) => {
        const message = e instanceof Error ? e.message : "";
        if (!/invalid|too_long|too_many|not_member|not_owner/.test(message)) pending.current = { ...patch, ...pending.current };
        setState("error");
        setError(businessError(e));
        return false;
      },
    );
    running.current = job;
    const ok = await job;
    running.current = null;
    return ok;
  }, [queryClient, placeId]);

  const queue = useCallback((patch: PlacePatch, now = false) => {
    pending.current = { ...pending.current, ...patch };
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { flush(); }, now ? 0 : delay);
  }, [flush, delay]);

  // Lämnar man sidan sparas det som väntar direkt (efter det som redan är på väg)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return;
    pending.current = {};
    (running.current ?? Promise.resolve(true)).then(() => savePatch(queryClient, placeId, patch)).catch(() => {});
  }, [queryClient, placeId]);

  return { queue, flush, state, error };
}

// ── "Är det här ditt företag?" ──────────────────────────────────────────────

export function useClaimInfo(placeId: number) {
  return useQuery({
    queryKey: ["business", "claim", placeId],
    enabled: placeId > 0,
    queryFn: () => rpc<ClaimInfo>("business_claim_info", { p_place_id: placeId }),
  });
}

export type ClaimResult = { ok: boolean; reason?: string; email?: string; seconds?: number; left?: number; kind?: string };

export const claimSendCode = (placeId: number) => rpc<ClaimResult>("business_claim_send_code", { p_place_id: placeId });
export const claimVerify = (placeId: number, code: string) => rpc<ClaimResult>("business_claim_verify", { p_place_id: placeId, p_code: code });
export const requestAccess = (placeId: number, roleTitle: string | null, phone: string | null, message: string | null) =>
  rpc<ClaimResult>("business_request_access", { p_place_id: placeId, p_role_title: roleTitle, p_phone: phone, p_message: message });
export const applyNewPlace = (p: { name: string; town: string; category: string | null; website: string | null; message: string | null }) =>
  rpc<ClaimResult>("business_apply_new_place", { p });
export const cancelRequest = (id: string) => rpc<void>("business_cancel_request", { p_id: id });
export const answerInvite = (id: string, accept: boolean) => rpc<ClaimResult & { place_id?: number }>("business_answer_invite", { p_id: id, p_accept: accept });
export const acceptTerms = (placeId: number) => rpc<void>("business_accept_terms", { p_place_id: placeId });

// ── Personalen ──────────────────────────────────────────────────────────────

export function useTeam(placeId: number) {
  return useQuery({
    queryKey: ["business", "team", placeId],
    enabled: placeId > 0,
    queryFn: () => rpc<Team>("business_team", { p_place_id: placeId }),
  });
}

/** Personalens knappar. Allt uppdaterar listan (och översikten) efteråt. */
export function useTeamActions(placeId: number) {
  const queryClient = useQueryClient();
  return useMemo(() => {
    const after = <T,>(p: Promise<T>) => p.finally(() => {
      queryClient.invalidateQueries({ queryKey: ["business", "team", placeId] });
      queryClient.invalidateQueries({ queryKey: ["business", "overview"] });
    });
    return {
      invite: (email: string, role: MemberRole, permissions: Permission[] | null) =>
        after(rpc<ClaimResult & { emailed?: boolean }>("business_invite", { p_place_id: placeId, p_email: email, p_role: role, p_permissions: permissions })),
      setPermissions: (userId: string, permissions: Permission[]) =>
        after(rpc<ClaimResult>("business_set_member_permissions", { p_place_id: placeId, p_user_id: userId, p_permissions: permissions })),
      cancelInvite: (id: string) => after(rpc<void>("business_cancel_invite", { p_id: id })),
      answerJoin: (id: string, accept: boolean) => after(rpc<ClaimResult>("business_answer_join", { p_id: id, p_accept: accept })),
      setRole: (userId: string, role: MemberRole) =>
        after(rpc<ClaimResult>("business_set_member_role", { p_place_id: placeId, p_user_id: userId, p_role: role })),
      remove: (userId: string) => after(rpc<ClaimResult>("business_remove_member", { p_place_id: placeId, p_user_id: userId })),
    };
  }, [queryClient, placeId]);
}

// ── Erbjudanden ─────────────────────────────────────────────────────────────

export function useBusinessOffers(placeId: number) {
  return useQuery({
    queryKey: ["business", "offers", placeId],
    enabled: placeId > 0,
    queryFn: () => rpc<BusinessOffer[]>("business_offers", { p_place_id: placeId }),
  });
}

export interface OfferDraft {
  title: string;
  description: string | null;
  savings_label: string | null;
  savings_value: number | null;
  category: string | null;
  redemption_interval: string;
  redemption_limit: number | null;
  expires_at: string | null;
  image_url: string | null;
}

export function useOfferActions(placeId: number) {
  const queryClient = useQueryClient();
  return useMemo(() => {
    const after = <T,>(p: Promise<T>) => p.finally(() => {
      queryClient.invalidateQueries({ queryKey: ["business", "offers", placeId] });
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    });
    return {
      save: (offer: OfferDraft, id?: string) =>
        after(rpc<string>("business_save_offer", { p_place_id: placeId, p_offer: offer, p_id: id ?? null })),
      act: (id: string, action: "pause" | "resume" | "end" | "delete") =>
        after(rpc<ClaimResult & { ended?: boolean }>("business_offer_action", { p_id: id, p_action: action })),
    };
  }, [queryClient, placeId]);
}

// ── Evenemang ───────────────────────────────────────────────────────────────

export type PlaceEvent = Event & { series_id?: string | null };

export function usePlaceEvents(placeId: number) {
  return useQuery({
    queryKey: ["business", "events", placeId],
    enabled: placeId > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").eq("place_id", placeId).order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PlaceEvent[];
    },
  });
}

export interface EventDraft {
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  time: string | null;
  location: string | null;
  image_url: string | null;
  main_category: string | null;
  tickets_required: boolean;
  booking_required: boolean;
  ticket_url: string | null;
  is_indoor: boolean;
  has_food_drink: boolean;
  has_parking: boolean;
}

export function useEventActions(placeId: number) {
  const queryClient = useQueryClient();
  return useMemo(() => {
    const after = <T,>(p: Promise<T>) => p.finally(() => {
      queryClient.invalidateQueries({ queryKey: ["business", "events", placeId] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    });
    return {
      save: (event: EventDraft, opts: { dates?: string[]; id?: number; scope?: "one" | "series" } = {}) =>
        after(rpc<{ ids: number[]; series_id: string | null }>("business_save_event", {
          p_place_id: placeId, p_event: event, p_dates: opts.dates ?? null, p_id: opts.id ?? null, p_scope: opts.scope ?? "one",
        })),
      remove: (id: number, scope: "one" | "series" = "one") =>
        after(rpc<number>("business_delete_event", { p_id: id, p_scope: scope })),
    };
  }, [queryClient, placeId]);
}

// ── Berättelser ─────────────────────────────────────────────────────────────

export function usePlaceStories(placeId: number) {
  return useQuery({
    queryKey: ["business", "stories", placeId],
    enabled: placeId > 0,
    queryFn: () => rpc<BusinessStory[]>("business_stories_overview", { p_place_id: placeId }),
  });
}

export function useStoryActions(placeId: number) {
  const queryClient = useQueryClient();
  return useMemo(() => {
    const after = <T,>(p: Promise<T>) => p.finally(() => {
      queryClient.invalidateQueries({ queryKey: ["business", "stories", placeId] });
      queryClient.invalidateQueries({ queryKey: ["business-stories"] });
    });
    return {
      post: (imageUrl: string, caption: string | null, link: StoryLink | null) =>
        after(rpc<string>("business_post_story", { p_place_id: placeId, p_image_url: imageUrl, p_caption: caption, p_link: link })),
      remove: (id: string) => after(rpc<void>("business_delete_story", { p_id: id })),
    };
  }, [queryClient, placeId]);
}

// ── Statistiken ─────────────────────────────────────────────────────────────

export function useBusinessStats(placeId: number, days: 7 | 30 | 365) {
  return useQuery({
    queryKey: ["business", "stats", placeId, days],
    enabled: placeId > 0,
    staleTime: 60_000,
    queryFn: () => rpc<BusinessStats>("business_stats", { p_place_id: placeId, p_days: days }),
  });
}

// ── Admin ───────────────────────────────────────────────────────────────────

export function useAdminRequests() {
  return useQuery({
    queryKey: ["business", "admin"],
    queryFn: () => rpc<AdminRequest[]>("admin_requests"),
  });
}

/** Ett tips från "Saknas ditt smultronställe?" (tabellen place_suggestions) */
export interface AdminSuggestion {
  id: string;
  name: string;
  category: string | null;
  location: string | null;
  description: string | null;
  link: string | null;
  is_owner: boolean | null;
  created_at: string;
  handled_at: string | null;
  user_name: string | null;
  user_email: string | null;
}

export function useAdminSuggestions() {
  return useQuery({
    queryKey: ["business", "admin", "suggestions"],
    queryFn: () => rpc<AdminSuggestion[]>("admin_suggestions"),
  });
}

export function useMarkSuggestion() {
  const queryClient = useQueryClient();
  return useCallback(async (id: string, done: boolean) => {
    try {
      await rpc<void>("admin_mark_suggestion", { p_id: id, p_done: done });
    } finally {
      queryClient.invalidateQueries({ queryKey: ["business", "admin", "suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["business", "overview"] });
    }
  }, [queryClient]);
}

export function useDecideRequest() {
  const queryClient = useQueryClient();
  return useCallback(async (id: string, approve: boolean) => {
    try {
      return await rpc<ClaimResult & { place_id?: number }>("admin_decide_request", { p_id: id, p_approve: approve });
    } finally {
      queryClient.invalidateQueries({ queryKey: ["business", "admin"] });
      queryClient.invalidateQueries({ queryKey: ["business", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["places"] });
    }
  }, [queryClient]);
}
