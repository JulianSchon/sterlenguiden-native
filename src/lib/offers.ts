/**
 * Erbjudanden — regelmotor och värdeberäkning.
 *
 * Rena funktioner utan databasberoende. Porterad från webb-specen
 * (native-offers-spec.md §2) och måste bete sig exakt likadant där,
 * annars kan samma erbjudande lösas in olika många gånger på webb vs app.
 */
import i18n from "i18next";

export type RedemptionInterval = "once" | "daily" | "weekly" | "monthly" | "unlimited";

export interface Offer {
  id: string;
  place_id: number;
  user_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  savings_label: string | null;
  savings_value: number | null;
  category: string | null;
  redemption_limit: number | null;
  redemption_interval: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  /** Inbakad plats-data från JOIN */
  place?: {
    name: string;
    logo_url: string | null;
    categories: string | null;
    nearest_town: string | null;
  } | null;
}

export interface RedemptionRow {
  offer_id: string;
  activated_at: string;
}

export interface Eligibility {
  /** Har använts minst en gång */
  used: boolean;
  /** Får aktiveras just nu */
  canUse: boolean;
  usedCount: number;
  /** Varför den är spärrad, t.ex. "Kan användas igen om 5 timmar" */
  reason: string | null;
  /** Regeln i klartext, visas alltid på kortet */
  ruleLabel: string;
}

const DAY_MS = 86_400_000;

const INTERVAL_MS: Partial<Record<RedemptionInterval, number>> = {
  daily: DAY_MS,
  weekly: 7 * DAY_MS,
  monthly: 30 * DAY_MS,
};

/** Hur länge den aktiva verifieringsvyn visas */
export const ACTIVE_SECS = 60;

// ─── Regelmotor ───────────────────────────────────────────────────────────────

export function offerEligibility(offer: Offer, rows: RedemptionRow[]): Eligibility {
  const mine = rows
    .filter((r) => r.offer_id === offer.id)
    .sort((a, b) => +new Date(b.activated_at) - +new Date(a.activated_at));

  const usedCount = mine.length;
  const interval = (offer.redemption_interval || "once") as RedemptionInterval;
  const limit = offer.redemption_limit ?? (interval === "once" ? 1 : null);

  const ruleLabel =
    interval === "once"    ? i18n.t("offers.rule.once") :
    interval === "daily"   ? i18n.t("offers.rule.daily") :
    interval === "weekly"  ? i18n.t("offers.rule.weekly") :
    interval === "monthly" ? i18n.t("offers.rule.monthly") :
    limit                  ? i18n.t("offers.rule.times", { n: limit }) :
                             i18n.t("offers.rule.many");

  if (limit != null && usedCount >= limit) {
    return { used: true, canUse: false, usedCount, reason: i18n.t("offers.reason.used"), ruleLabel };
  }

  const windowMs = INTERVAL_MS[interval];
  if (windowMs && mine[0]) {
    const nextAt = +new Date(mine[0].activated_at) + windowMs;
    if (Date.now() < nextAt) {
      const hours = Math.ceil((nextAt - Date.now()) / 3_600_000);
      const reason = hours >= 24
        ? i18n.t("offers.reason.againDays", { n: Math.ceil(hours / 24) })
        : i18n.t("offers.reason.againHours", { n: hours });
      return { used: true, canUse: false, usedCount, reason, ruleLabel };
    }
  }

  return { used: usedCount > 0, canUse: true, usedCount, reason: null, ruleLabel };
}

/** Guldpillen på erbjudandekortet: företagets egen formulering (t.ex. "20 % rabatt"), eller inget alls. */
export function offerSavingsLabel(offer: Offer): string | null {
  return offer.savings_label || null;
}

// ─── Filtrering ───────────────────────────────────────────────────────────────

/** Ett erbjudande som får visas: påslaget och inte utgånget */
export function isActiveOffer(offer: { is_active: boolean; expires_at: string | null }): boolean {
  if (!offer.is_active) return false;
  if (!offer.expires_at) return true;
  return new Date(offer.expires_at).getTime() >= Date.now();
}
