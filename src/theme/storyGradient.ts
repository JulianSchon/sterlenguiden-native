/**
 * Berättelsernas gradient — gult som kickar igång, orange som dominerar och poppar. Ringen runt
 * en osedd berättelse på Hem, och återanvänd där samma "nytt och levande"-känsla behövs (t.ex.
 * traktorerna kring Senaste utmärkelsen på Utmaningar).
 */
export const STORY_GRADIENT = {
  stops: [
    { offset: "0%",   color: "#FFF200" },   // starkt citrongult
    { offset: "35%",  color: "#FFB000" },   // guldorange – mjuk övergång
    { offset: "75%",  color: "#FF5000" },   // het orange som poppar
    { offset: "100%", color: "#FF8000" },   // levande orange avslutar
  ],
  x1: "0", y1: "1", x2: "1", y2: "0",
};
