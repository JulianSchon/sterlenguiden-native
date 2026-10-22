/** Tal på användarens språk: decimalkomma på svenska och tyska, punkt på engelska */
import { currentLanguage } from "./index";

export function decimal(value: number, digits = 1): string {
  const text = value.toFixed(digits);
  return currentLanguage() === "en" ? text : text.replace(".", ",");
}
