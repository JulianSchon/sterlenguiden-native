/**
 * Incheckning ("Jag är här!") — regler och hjälpfunktioner.
 *
 * Allt sker bara medan appen är öppen: platsen hämtas en gång när användaren
 * tittar på en platssida, ingen bakgrundsbevakning. Se minnesanteckningen om
 * Mitt Österlen för hela resonemanget (GPS för isolerade platser, QR-kod för
 * kluster — QR byggs i ett senare steg).
 */
import type { Visit } from "@/hooks/useVisits";

/** Inom så här långt kan man checka in (knappen är aktiv). */
export const CHECKIN_RADIUS_M = 100;
/** Inom så här långt syns knappen grå med avstånd; längre bort finns den inte. */
export const CHECKIN_NEAR_M = 500;
/** Spärr mellan två incheckningar på samma plats. Samma värde tvingas även av databasen. */
export const CHECKIN_COOLDOWN_H = 4;

/** Avstånd i meter mellan två koordinater (haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** "320 m" under en kilometer, annars "1,2 km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

/**
 * När spärren för den här platsen går ut, eller null om användaren inte
 * checkat in där de senaste timmarna.
 */
export function cooldownEnd(visits: Visit[], placeId: number, now = new Date()): Date | null {
  const windowMs = CHECKIN_COOLDOWN_H * 3600 * 1000;
  let latest = 0;
  for (const v of visits) {
    if (v.place_id !== placeId) continue;
    const t = new Date(v.visited_at).getTime();
    if (t > latest) latest = t;
  }
  if (!latest) return null;
  const end = latest + windowMs;
  return end > now.getTime() ? new Date(end) : null;
}

/** "14:46" */
export function formatClock(d: Date): string {
  return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}
