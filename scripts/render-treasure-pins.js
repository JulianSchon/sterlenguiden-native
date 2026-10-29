// Skatternas nålar på kartan som kryss, som på en riktig skattkarta: kör från en tillfällig mapp med
// @resvg/resvg-js@2.6.2 installerat,
//   node render-treasure-pins.js <appens sökväg>/assets/map-pins
// Ritar PNG (1x/2x/3x). Namnen ska stämma med TREASURE_PINS i src/components/map/MapPins.tsx.
//
// - Ej hittad: ett grått kryss — ljusgrått på den mörka kartan, mörkgrått på den ljusa.
// - Hittad: ett grönt kryss.
// - Vald: samma, 1,4 gånger större.
// Krysset är två lite ojämna penseldrag utan kant eller skugga, så det ser ritat PÅ kartan ut i
// stället för inklistrat ovanpå. Samma form som TreasurePin.tsx (STROKES där).
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const OUT = process.argv[2];
const W = 30, H = 30;
const STROKES = ["M7.5 7 Q15.5 14.2 22.8 23.2", "M22.6 7.2 Q14 15.6 7.2 22.8"];

const cross = (ink) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${STROKES.map((d) => `<path d="${d}" stroke="${ink}" stroke-opacity="0.9" stroke-width="3.8" stroke-linecap="round" fill="none"/>`).join("")}
</svg>`;

const INK = { dark: "#C9C9CE", light: "#3A3A3F", found: "#2FA864" };
const pins = {};
for (const theme of ["dark", "light"]) {
  pins[`pin-treasure-${theme}`] = { markup: cross(INK[theme]), scale: 1 };
  pins[`pin-treasure-selected-${theme}`] = { markup: cross(INK[theme]), scale: 1.4 };
}
pins["pin-treasure-found"] = { markup: cross(INK.found), scale: 1 };
pins["pin-treasure-found-selected"] = { markup: cross(INK.found), scale: 1.4 };

let n = 0;
for (const [name, { markup, scale }] of Object.entries(pins)) {
  for (const density of [1, 2, 3]) {
    const png = new Resvg(markup, { fitTo: { mode: "width", value: Math.round(W * scale * density) } }).render().asPng();
    fs.writeFileSync(path.join(OUT, `${name}${density === 1 ? "" : `@${density}x`}.png`), png);
    n++;
  }
}
console.log(`ritade ${n} bilder`);
