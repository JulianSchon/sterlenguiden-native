// Kartans nålar som bilder: kör från en tillfällig mapp med @resvg/resvg-js@2.6.2 installerat,
//   node render-map-pins.js <appens sökväg>/assets/map-pins
// Färgerna ska stämma med PIN_COLORS i src/components/map/MapPins.tsx.
// Ritar kartans nålar som PNG (1x/2x/3x) till assets/map-pins i appen.
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

// Nålens form (24 x 32), samma som skattnålen
const PIN = "M12 0C5.373 0 0 5.373 0 12c0 8.5 12 20 12 20S24 20.5 24 12C24 5.373 18.627 0 12 0z";
const STAR = "12,5.8 13.5,9.2 17.2,9.6 14.4,12.1 15.2,15.8 12,13.9 8.8,15.8 9.6,12.1 6.8,9.6 10.5,9.2";
// Ritytan runt nålen (plats för kant och skugga): 32 x 42 punkter, nålen börjar på (4, 3)
const W = 32, H = 42;

function svg({ fill, center, centerColor }) {
  const mark = center === "star"
    ? `<polygon points="${STAR}" fill="${centerColor}"/>`
    : `<circle cx="12" cy="11.6" r="4.3" fill="${centerColor}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.1"/></filter></defs>
  <ellipse cx="16" cy="35.4" rx="4.6" ry="1.5" fill="#000" fill-opacity="0.45" filter="url(#b)"/>
  <g transform="translate(4 3)">
    <path d="${PIN}" fill="${fill}" stroke="#FFFFFF" stroke-opacity="0.92" stroke-width="1.5"/>
    ${mark}
  </g>
</svg>`;
}

// Kategoriernas färger på kartan: samma djupa toner som i appen, lite ljusare så de syns mot svart
const PINS = {
  "mat-dryck": { fill: "#A3214B" },
  "hotell-bb": { fill: "#4C44C9" },
  "cafe-bageri": { fill: "#C2A468" },
  "butiker": { fill: "#D9582A" },
  "natur-upplevelser": { fill: "#16794A" },
  "aktiviteter": { fill: "#11708F" },
  "sevardheter": { fill: "#7A2BB8" },
  "hantverk-service": { fill: "#7D8796" },
  "other": { fill: "#8E8E93" },
  "service": { fill: "#E9E5DB", centerColor: "#2A2A2A" },
  "treasure": { fill: "#A78BFA", center: "star", centerColor: "#FFFFFF" },
  "treasure-found": { fill: "#5B21B6", center: "star", centerColor: "#FDE68A" },
};

const SIZES = { "": 1, "-selected": 1.4 };
let n = 0;
for (const [name, p] of Object.entries(PINS)) {
  const markup = svg({ fill: p.fill, center: p.center ?? "dot", centerColor: p.centerColor ?? "#FFFFFF" });
  for (const [suffix, scale] of Object.entries(SIZES)) {
    for (const density of [1, 2, 3]) {
      const png = new Resvg(markup, { fitTo: { mode: "width", value: Math.round(W * scale * density) } }).render().asPng();
      const file = `pin-${name}${suffix}${density === 1 ? "" : `@${density}x`}.png`;
      fs.writeFileSync(path.join(OUT, file), png);
      n++;
    }
  }
}
console.log(`ritade ${n} bilder; ankare y = ${((3 + 32) / H).toFixed(4)}`);
