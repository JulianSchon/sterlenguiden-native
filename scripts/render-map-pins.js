// Kartans nålar som bilder: kör från en tillfällig mapp med @resvg/resvg-js@2.6.2 installerat,
//   node render-map-pins.js <appens sökväg>/assets/map-pins
// Ritar PNG (1x/2x/3x) till assets/map-pins i appen. Namnen ska stämma med IMAGES i
// src/components/map/MapPins.tsx.
//
// - Platser: svart nål i mörkt läge, vit i ljust (som klumparna), med kategorins färg som prick.
// - Service: samma nål med typens ikon i guld (Lucide-ikonerna Toilet, Plug, Store, HeartPulse, ToyBrick).
// - Skatter: svarta med lila glöd i kanten och en lysande stjärna (hittade: guldstjärna), större när de är valda.
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

// Nålens form (24 x 32) i en rityta på 32 x 42 punkter: nålen börjar på (4, 3), resten är plats
// för kanten och skuggan. Spetsen hamnar 83 % ner (PIN_ANCHOR).
const PIN = "M12 0C5.373 0 0 5.373 0 12c0 8.5 12 20 12 20S24 20.5 24 12C24 5.373 18.627 0 12 0z";
const STAR = "12,5.8 13.5,9.2 17.2,9.6 14.4,12.1 15.2,15.8 12,13.9 8.8,15.8 9.6,12.1 6.8,9.6 10.5,9.2";
const W = 32, H = 42;

const THEMES = {
  dark: { body: "#111113", edge: "#FFFFFF", edgeOpacity: 0.92, icon: "#D9B46A", other: "#FFFFFF" },
  light: { body: "#FFFFFF", edge: "#111113", edgeOpacity: 0.85, icon: "#8A6A2E", other: "#111113" },
};

// Prickens färg per kategori: djupa toner på den vita nålen, ljusare på den svarta (annars syns
// de mörka färgerna inte mot svart)
const CATEGORIES = {
  "mat-dryck": { dark: "#C23A5E", light: "#881337" },
  "hotell-bb": { dark: "#3F7BEA", light: "#1E3A8A" },
  "cafe-bageri": { dark: "#D4BE86", light: "#B39A5C" },
  "butiker": { dark: "#EA6A35", light: "#C2410C" },
  "natur-upplevelser": { dark: "#2BA36A", light: "#064E3B" },
  "aktiviteter": { dark: "#2499C2", light: "#0C4A6E" },
  "sevardheter": { dark: "#A55BE0", light: "#581C87" },
  "hantverk-service": { dark: "#A7AFBC", light: "#6B7280" },
  "other": { dark: null, light: null },
};

// Lucide (ISC-licens), 24 x 24, ritas som linjer
const ICONS = {
  toalett: [
    "M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.598a.5.5 0 0 0-.424.765l1.544 2.47a.5.5 0 0 1-.424.765H5.402a.5.5 0 0 1-.424-.765L7 18",
    "M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8",
  ],
  laddning: [
    "M12 22v-5", "M15 8V2", "M9 8V2",
    "M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z",
  ],
  automat: [
    "M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5",
    "M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244",
    "M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05",
  ],
  vard: [
    "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5",
    "M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27",
  ],
  // ToyBrick (byggklossen) för lekplatser
  lekplats: [
    "M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z",
    "M10 8V5c0-.6-.4-1-1-1H6a1 1 0 0 0-1 1v3",
    "M19 8V5c0-.6-.4-1-1-1h-3a1 1 0 0 0-1 1v3",
  ],
};

const shadow = `<defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.1"/></filter></defs>
  <ellipse cx="16" cy="35.4" rx="4.6" ry="1.5" fill="#000" fill-opacity="0.45" filter="url(#b)"/>`;

function svg(fill, edge, edgeOpacity, mark) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${shadow}
  <g transform="translate(4 3)">
    <path d="${PIN}" fill="${fill}" stroke="${edge}" stroke-opacity="${edgeOpacity}" stroke-width="1.5"/>
    ${mark}
  </g>
</svg>`;
}

/** Ikonen i nålens huvud: 11 punkter stor, centrerad på (12, 11.6) */
function iconMark(paths, color) {
  const k = 11 / 24;
  return `<g transform="translate(${12 - 12 * k} ${11.6 - 12 * k}) scale(${k})" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    ${paths.map((d) => `<path d="${d}"/>`).join("\n    ")}
  </g>`;
}

const pins = {};
for (const [theme, t] of Object.entries(THEMES)) {
  for (const [cat, colors] of Object.entries(CATEGORIES)) {
    const dot = colors[theme] ?? t.other;
    pins[`pin-${cat}-${theme}`] = { markup: svg(t.body, t.edge, t.edgeOpacity, `<circle cx="12" cy="11.6" r="5" fill="${dot}"/>`), scale: 1 };
  }
  // Servicenålarna är lite större: i serviceläget är de det enda som syns
  for (const [key, paths] of Object.entries(ICONS)) {
    pins[`pin-svc-${key}-${theme}`] = { markup: svg(t.body, t.edge, t.edgeOpacity, iconMark(paths, t.icon)), scale: 1.15 };
  }
}
// Skatterna: svart nål med lila glöd i kanten och en stjärna som lyser lite (hittad: guldstjärna)
const treasure = (star, starGlow) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${shadow}
  <defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.1"/></filter></defs>
  <g transform="translate(4 3)">
    <path d="${PIN}" fill="none" stroke="#A78BFA" stroke-width="2.8" stroke-opacity="0.95" filter="url(#g)"/>
    <path d="${PIN}" fill="#111113" stroke="#A78BFA" stroke-width="1.4"/>
    <polygon points="${STAR}" fill="${starGlow}" filter="url(#g)"/>
    <polygon points="${STAR}" fill="${star}"/>
  </g>
</svg>`;
pins["pin-treasure"] = { markup: treasure("#F3EEFF", "#C4B5FD"), scale: 1 };
pins["pin-treasure-selected"] = { markup: treasure("#F3EEFF", "#C4B5FD"), scale: 1.4 };
pins["pin-treasure-found"] = { markup: treasure("#FDE68A", "#FBBF24"), scale: 1 };
pins["pin-treasure-found-selected"] = { markup: treasure("#FDE68A", "#FBBF24"), scale: 1.4 };

let n = 0;
for (const [name, { markup, scale }] of Object.entries(pins)) {
  for (const density of [1, 2, 3]) {
    const png = new Resvg(markup, { fitTo: { mode: "width", value: Math.round(W * scale * density) } }).render().asPng();
    fs.writeFileSync(path.join(OUT, `${name}${density === 1 ? "" : `@${density}x`}.png`), png);
    n++;
  }
}
console.log(`ritade ${n} bilder; ankare y = ${((3 + 32) / H).toFixed(4)}`);
