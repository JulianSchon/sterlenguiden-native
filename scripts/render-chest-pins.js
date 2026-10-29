// Skatternas nålar på kartan som skattkistor: kör från en tillfällig mapp med @resvg/resvg-js@2.6.2
// installerat,
//   node render-chest-pins.js <appens sökväg>
// Läser kistans lock och botten (assets/treasure/, samma bilder som i upplåsningen) och ritar PNG
// (1x/2x/3x) till assets/map-pins. Namnen ska stämma med TREASURE_PINS i src/components/map/MapPins.tsx.
//
// - Ej hittad: stängd kista med en svag lila glöd bakom (skatternas färg).
// - Hittad: locket är uppfällt på vänstra gångjärnet och guldljus väller ut ur springan.
// - Vald: samma, 1,4 gånger större.
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const APP = process.argv[2];
const OUT = path.join(APP, "assets/map-pins");
const data = (file) => `data:image/png;base64,${fs.readFileSync(path.join(APP, "assets/treasure", file)).toString("base64")}`;
const LID = data("chest-lid.png");
const BASE = data("chest-base.png");

// Rityta 44 x 44 punkter. Kistan (bildens x 20–580, y 100–500 av 600) ritas 38 breda med botten på
// y = 41; skuggan under ligger där, och det är där nålen sitter i kartan (ankaret). Luften ovanför
// är för det uppfällda locket på hittade kistor.
const W = 44, H = 44;
const FOOT = 41;
const S = 38 / 560;
const X0 = 3 - 20 * S;
const Y0 = FOOT - 500 * S;
const SEAM = Y0 + 289 * S;
const img = (href, extra = "") => `<image href="${href}" x="${X0}" y="${Y0}" width="${600 * S}" height="${600 * S}" ${extra}/>`;

const chest = (found) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.2"/></filter>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${found ? "#FDE68A" : "#A78BFA"}" stop-opacity="${found ? 0.95 : 0.7}"/>
      <stop offset="1" stop-color="${found ? "#FBBF24" : "#A78BFA"}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="22" cy="${FOOT}" rx="15" ry="2.4" fill="#000" fill-opacity="0.35" filter="url(#b)"/>
  <ellipse cx="22" cy="${found ? SEAM - 2 : FOOT - 13}" rx="22" ry="${found ? 14 : 16}" fill="url(#glow)"/>
  ${img(BASE)}
  ${found
    ? `<ellipse cx="22" cy="${SEAM}" rx="15" ry="2.6" fill="#FFF3C4" filter="url(#b)"/>
  <g transform="translate(0.6 -1.2) rotate(-13 4 ${SEAM})">${img(LID)}</g>`
    : img(LID)}
</svg>`;

const pins = {
  "pin-treasure": { markup: chest(false), scale: 1 },
  "pin-treasure-selected": { markup: chest(false), scale: 1.4 },
  "pin-treasure-found": { markup: chest(true), scale: 1 },
  "pin-treasure-found-selected": { markup: chest(true), scale: 1.4 },
};
let n = 0;
for (const [name, { markup, scale }] of Object.entries(pins)) {
  for (const density of [1, 2, 3]) {
    const png = new Resvg(markup, { fitTo: { mode: "width", value: Math.round(W * scale * density) } }).render().asPng();
    fs.writeFileSync(path.join(OUT, `${name}${density === 1 ? "" : `@${density}x`}.png`), png);
    n++;
  }
}
console.log(`ritade ${n} bilder; ankare y = ${(FOOT / H).toFixed(4)}`);
