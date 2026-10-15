/**
 * Kartans klumpar och listans numrerade nålar som färdiga bilder, ritade i appen med Skia: exakta
 * siffror och appens tema (klumparna svarta i mörkt läge, vita i ljust). Google ritar dem sen
 * själv som vanliga ikoner, precis som de andra nålarna — inget behöver fångas från skärmen medan
 * kartan rör sig. Det är så de stora kartapparna gör.
 *
 * Varje bild ritas en gång och sparas (samma siffra i samma tema ritas aldrig om).
 */
import { PixelRatio, Platform } from "react-native";
import {
  BlurStyle, ImageFormat, PaintStyle, Skia, type SkCanvas, type SkTypeface,
} from "@shopify/react-native-skia";

/** En ikon som kartan kan visa (Marker icon/image) */
export type MapIcon = { uri: string };

const SCALE = PixelRatio.get();
const cache = new Map<string, MapIcon | null>();

/** Ritar en bild i punkter (skärmens skärpa) och ger den som PNG */
function render(w: number, h: number, draw: (canvas: SkCanvas) => void): MapIcon | null {
  const surface = Skia.Surface.Make(Math.ceil(w * SCALE), Math.ceil(h * SCALE));
  if (!surface) return null;
  try {
    const canvas = surface.getCanvas();
    canvas.scale(SCALE, SCALE);
    draw(canvas);
    surface.flush();
    const image = surface.makeImageSnapshot();
    const b64 = image.encodeToBase64(ImageFormat.PNG, 100);
    image.dispose();
    return b64 ? { uri: `data:image/png;base64,${b64}` } : null;
  } finally {
    surface.dispose();
  }
}

/** Telefonens eget feta typsnitt — om appens typsnitt (Inter) av någon anledning inte gick att ladda */
let systemFace: SkTypeface | null | undefined;
export function systemBoldTypeface(): SkTypeface | null {
  if (systemFace === undefined) {
    try {
      systemFace = Skia.FontMgr.System().matchFamilyStyle(
        Platform.OS === "ios" ? "Helvetica Neue" : "sans-serif",
        { weight: 700, width: 5, slant: 0 },
      );
    } catch {
      systemFace = null;
    }
  }
  return systemFace;
}

function paint(color: string, opts: { stroke?: number; blur?: number } = {}) {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  if (opts.stroke) {
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(opts.stroke);
  }
  if (opts.blur) p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, opts.blur, true));
  return p;
}

/** Text centrerad på (cx, cy) efter hur siffrorna faktiskt ser ut */
function centeredText(canvas: SkCanvas, text: string, cx: number, cy: number, size: number, color: string, typeface: SkTypeface) {
  const font = Skia.Font(typeface, size);
  const ink = font.measureText(text);
  canvas.drawText(text, cx - (ink.x + ink.width / 2), cy - (ink.y + ink.height / 2), paint(color), font);
}

// ── Klumpar ──────────────────────────────────────────────────────────────────

/** Klumpens storlek växer lite med antalet */
const clusterDiameter = (count: number) => (count < 10 ? 36 : count < 25 ? 38 : count < 50 ? 40 : count < 100 ? 44 : 48);
/** Luft runt klumpen för skuggan */
const CLUSTER_MARGIN = 6;

export function clusterIcon(count: number, dark: boolean, typeface: SkTypeface): MapIcon | null {
  const key = `c${count}${dark ? "d" : "l"}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const d = clusterDiameter(count);
  const box = d + CLUSTER_MARGIN * 2;
  const c = box / 2;
  const r = d / 2;
  const label = String(count);
  const icon = render(box, box, (canvas) => {
    canvas.drawCircle(c, c + 1.5, r - 1, paint(dark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.22)", { blur: 2.5 }));
    canvas.drawCircle(c, c, r, paint(dark ? "#111113" : "#FFFFFF"));
    canvas.drawCircle(c, c, r - 0.75, paint(dark ? "rgba(255,255,255,0.92)" : "rgba(17,17,19,0.88)", { stroke: 1.5 }));
    centeredText(canvas, label, c, c, label.length > 2 ? 12.5 : 13.5, dark ? "#FFFFFF" : "#111113", typeface);
  });
  cache.set(key, icon);
  return icon;
}

// ── Listans numrerade nålar ──────────────────────────────────────────────────

// Samma nål som kategorinålarna (scripts/render-map-pins.js): 24 x 32 i en yta på 32 x 42
const PIN = "M12 0C5.373 0 0 5.373 0 12c0 8.5 12 20 12 20S24 20.5 24 12C24 5.373 18.627 0 12 0z";
const NUM_W = 32;
const NUM_H = 42;
/** Spetsen: samma ankare som kategorinålarna */
export const NUMBER_ANCHOR = { x: 0.5, y: (3 + 32) / NUM_H };

export function numberPinIcon(n: number, selected: boolean, typeface: SkTypeface): MapIcon | null {
  const key = `n${n}${selected ? "s" : ""}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const k = selected ? 1.3 : 1;
  const path = Skia.Path.MakeFromSVGString(PIN);
  if (!path) return null;
  const label = String(n);
  const icon = render(NUM_W * k, NUM_H * k, (canvas) => {
    canvas.scale(k, k);
    canvas.drawOval(Skia.XYWHRect(16 - 4.6, 35.4 - 1.5, 9.2, 3), paint("rgba(0,0,0,0.45)", { blur: 1.1 }));
    canvas.translate(4, 3);
    canvas.drawPath(path, paint("#C5A059"));
    canvas.drawPath(path, paint("rgba(255,255,255,0.92)", { stroke: 1.5 }));
    centeredText(canvas, label, 12, 11.6, n > 9 ? 9.5 : 11, "#121212", typeface);
  });
  cache.set(key, icon);
  return icon;
}

// ── Tärningens prick ─────────────────────────────────────────────────────────

/** Den lysande guldpricken som hoppar mellan platserna medan tärningen blandar */
export function shuffleDotIcon(): MapIcon | null {
  const hit = cache.get("shuffle");
  if (hit !== undefined) return hit;
  const box = 30;
  const c = box / 2;
  const icon = render(box, box, (canvas) => {
    canvas.drawCircle(c, c, 9, paint("rgba(217,164,65,0.55)", { blur: 4 }));
    canvas.drawCircle(c, c, 6, paint("#D9A441"));
    canvas.drawCircle(c, c, 6, paint("rgba(255,255,255,0.95)", { stroke: 1.5 }));
  });
  cache.set("shuffle", icon);
  return icon;
}
