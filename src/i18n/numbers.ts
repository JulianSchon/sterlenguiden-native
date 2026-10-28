/** Tal på användarens språk: decimalkomma på svenska och tyska, punkt på engelska */
import { currentLanguage } from "./index";

export function decimal(value: number, digits = 1): string {
  const text = value.toFixed(digits);
  return currentLanguage() === "en" ? text : text.replace(".", ",");
}

const NUMBER_LOCALE = { sv: "sv-SE", en: "en-GB", de: "de-DE" } as const;

/** Heltal med mellanrum, komma eller punkt mellan tusentalen, efter användarens språk */
export function whole(value: number): string {
  return value.toLocaleString(NUMBER_LOCALE[currentLanguage()]);
}
