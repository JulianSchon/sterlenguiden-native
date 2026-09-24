/**
 * Samlarobjekt (stickers) — regler. Precis som incheckning gäller allt bara
 * medan appen är öppen: inget i bakgrunden, inga notiser.
 */

/** Inom så här långt kan man låsa upp en sticker. Samma värde tvingas av funktionen collect_sticker i databasen. */
export const STICKER_RADIUS_M = 75;
/** Inom så här långt visas tipset "Det finns ett samlarobjekt nära dig". */
export const STICKER_NEARBY_M = 300;
