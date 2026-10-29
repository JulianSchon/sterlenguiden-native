/**
 * Öppnar en sida bara en gång, hur många gånger och hur snabbt man än trycker. Två snabba tryck
 * på samma plats lade annars två likadana sidor ovanpå varandra (tillbaka ledde då till samma
 * sida igen). Ett nytt tryck räknas först när den förra öppningen hunnit börja — 700 ms.
 */
import type { useRouter } from "expo-router";

type Router = ReturnType<typeof useRouter>;
type Href = Parameters<Router["push"]>[0];

let lastAt = 0;

export function pushOnce(router: Router, href: Href | string): void {
  const now = Date.now();
  if (now - lastAt < 700) return;
  lastAt = now;
  router.push(href as Href);
}
