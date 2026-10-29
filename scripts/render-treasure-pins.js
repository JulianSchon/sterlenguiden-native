// Skatternas nålar på kartan som kryss, som på en riktig skattkarta: kör från en tillfällig mapp med
// @resvg/resvg-js@2.6.2 installerat,
//   node render-treasure-pins.js <appens sökväg>/assets/map-pins
// Ritar PNG (1x/2x/3x). Namnen ska stämma med TREASURE_PINS i src/components/map/MapPins.tsx.
//
// - Ej hittad: ett mörkgrått kryss, X marks the spot.
// - Hittad: ett grönt kryss.
// - Vald: samma, 1,4 gånger större.
// Krysset är två lite ojämna penseldrag med en ljus kant runt, så det syns på både mörk och ljus karta.
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const OUT = process.argv[2];
const W = 30, H = 30;
// Två drag som böjer lite, som ritade för hand
const STROKES = ["M7.5 7 Q15.5 14.2 22.8 23.2", "M22.6 7.2 Q14 15.6 7.2 22.8"];

const cross = (ink) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1"/></filter></defs>
  <g transform="translate(0.6 1.2)" opacity="0.35" filter="url(#b)">
    ${STROKES.map((d) => `<path d="${d}" stroke="#000" stroke-width="7" stroke-linecap="round" fill="none"/>`).join("")}
  </g>
  ${STROKES.map((d) => `<path d="${d}" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="7.6" stroke-linecap="round" fill="none"/>`).join("")}
  ${STROKES.map((d) => `<path d="${d}" stroke="${ink}" stroke-width="4.6" stroke-linecap="round" fill="none"/>`).join("")}
</svg>`;

const pins = {
  "pin-treasure": { markup: cross("#2B2B2E"), scale: 1 },
  "pin-treasure-selected": { markup: cross("#2B2B2E"), scale: 1.4 },
  "pin-treasure-found": { markup: cross("#22A45D"), scale: 1 },
  "pin-treasure-found-selected": { markup: cross("#22A45D"), scale: 1.4 },
};
let n = 0;
for (const [name, { markup, scale }] of Object.entries(pins)) {
  for (const density of [1, 2, 3]) {
    const png = new Resvg(markup, { fitTo: { mode: "width", value: Math.round(W * scale * density) } }).render().asPng();
    fs.writeFileSync(path.join(OUT, `${name}${density === 1 ? "" : `@${density}x`}.png`), png);
    n++;
  }
}
console.log(`ritade ${n} bilder`);
