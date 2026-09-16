/**
 * Erbjudanden — regelmotor och värdeberäkning.
 *
 * Rena funktioner utan databasberoende. Porterad från webb-specen
 * (native-offers-spec.md §2) och måste bete sig exakt likadant där,
 * annars kan samma erbjudande lösas in olika många gånger på webb vs app.
 */

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
    interval === "once"    ? "Kan användas en gång" :
    interval === "daily"   ? "Kan användas en gång per dag" :
    interval === "weekly"  ? "Kan användas en gång per vecka" :
    interval === "monthly" ? "Kan användas en gång per månad" :
    limit                  ? `Kan användas ${limit} gånger` :
                             "Kan användas flera gånger";

  if (limit != null && usedCount >= limit) {
    return { used: true, canUse: false, usedCount, reason: "Du har redan använt detta erbjudande", ruleLabel };
  }

  const windowMs = INTERVAL_MS[interval];
  if (windowMs && mine[0]) {
    const nextAt = +new Date(mine[0].activated_at) + windowMs;
    if (Date.now() < nextAt) {
      const hours = Math.ceil((nextAt - Date.now()) / 3_600_000);
      const wait = hours >= 24 ? `${Math.ceil(hours / 24)} dagar` : `${hours} timmar`;
      return { used: true, canUse: false, usedCount, reason: `Kan användas igen om ${wait}`, ruleLabel };
    }
  }

  return { used: usedCount > 0, canUse: true, usedCount, reason: null, ruleLabel };
}

// ─── Värdeberäkning ───────────────────────────────────────────────────────────

const AMOUNT_RE  = /(\d[\d\s]*)\s*(kr|:-|sek)/;
const PERCENT_RE = /(\d{1,2})\s*%/;
const FREEBIE_RE = /2 för 1|två för en|gratis|fri entré|fri frakt/;

/**
 * Gissar vad ett erbjudande är värt i kronor. Används för "Spara upp till"-
 * siffran på förmånssidan, så det behöver vara rimligt — inte exakt.
 */
export function estimateOfferValue(offer: Offer): number {
  if (offer.savings_value && offer.savings_value > 0) return offer.savings_value;

  const text = [offer.savings_label, offer.title, offer.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const amount = text.match(AMOUNT_RE);
  if (amount) {
    const kr = parseInt(amount[1].replace(/\s/g, ""), 10);
    if (kr > 0) return Math.min(kr, 5000);
  }

  const percent = text.match(PERCENT_RE);
  if (percent) {
    const pct = parseInt(percent[1], 10);
    if (pct > 0) return Math.round((500 * pct) / 100);
  }

  if (FREEBIE_RE.test(text)) return 150;

  return 120;
}

export function formatKr(value: number): string {
  return `${value.toLocaleString("sv-SE")} kr`;
}

/** Guldpillen på erbjudandekortet */
export function offerSavingsLabel(offer: Offer): string {
  return offer.savings_label || `Spara ${formatKr(estimateOfferValue(offer))}`;
}

// ─── Filtrering ───────────────────────────────────────────────────────────────

/** Ett erbjudande som får visas: påslaget och inte utgånget */
export function isActiveOffer(offer: { is_active: boolean; expires_at: string | null }): boolean {
  if (!offer.is_active) return false;
  if (!offer.expires_at) return true;
  return new Date(offer.expires_at).getTime() >= Date.now();
}
