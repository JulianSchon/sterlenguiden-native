/**
 * Källan till en bild från nätet (expo-image). De privata bilderna (profilbilder, kortfoton) visas
 * med tillfälliga länkar som byts varje dygn. Utan egen nyckel trodde telefonen att det var en ny
 * bild och laddade ner den igen. Nyckeln är adressen utan den tillfälliga delen, så bilden känns
 * igen och visas direkt från telefonen. Varje uppladdning får ett nytt filnamn, så en ny bild får
 * alltid en ny nyckel.
 */
export function imageSource(uri: string): { uri: string; cacheKey?: string } {
  return uri.includes("/storage/v1/object/sign/") ? { uri, cacheKey: uri.split("?")[0] } : { uri };
}
