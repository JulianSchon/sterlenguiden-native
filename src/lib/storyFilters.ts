/**
 * Berättelsernas filter. Varje filter är en färgmatris (Skia). Bilden ritas om med filtret i
 * telefonen (Skia, utanför skärmen) och blir en vanlig bild igen — så hela berättelsen sedan kan
 * fotograferas som den syns, med text och klistermärken, när den publiceras.
 */
import { ImageFormat, Skia } from "@shopify/react-native-skia";

type Matrix = number[];

/** Två färgmatriser efter varandra (först b, sedan a) */
function concat(a: Matrix, b: Matrix): Matrix {
  const out: Matrix = new Array(20).fill(0);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      let v = col === 4 ? a[row * 5 + 4] : 0;
      for (let k = 0; k < 4; k++) v += a[row * 5 + k] * b[k * 5 + col];
      out[row * 5 + col] = v;
    }
  }
  return out;
}

function saturation(s: number): Matrix {
  const r = 0.2126 * (1 - s), g = 0.7152 * (1 - s), b = 0.0722 * (1 - s);
  return [
    r + s, g, b, 0, 0,
    r, g + s, b, 0, 0,
    r, g, b + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

function contrast(c: number): Matrix {
  const t = (1 - c) / 2;
  return [c, 0, 0, 0, t, 0, c, 0, 0, t, 0, 0, c, 0, t, 0, 0, 0, 1, 0];
}

function brightness(add: number): Matrix {
  return [1, 0, 0, 0, add, 0, 1, 0, 0, add, 0, 0, 1, 0, add, 0, 0, 0, 1, 0];
}

/** Färgskift: multiplicera kanalerna (r, g, b) */
function tint(r: number, g: number, b: number): Matrix {
  return [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0];
}

/** Lyfter de mörkaste partierna (blekt, filmlikt) */
function fade(amount: number): Matrix {
  const k = 1 - amount;
  return [k, 0, 0, 0, amount, 0, k, 0, 0, amount, 0, 0, k, 0, amount, 0, 0, 0, 1, 0];
}

interface StoryFilter { id: string; name: string; matrix: Matrix | null }

export const STORY_FILTERS: StoryFilter[] = [
  { id: "none", name: "Original", matrix: null },
  { id: "warm", name: "Varm", matrix: concat(tint(1.08, 1.02, 0.88), saturation(1.1)) },
  { id: "vivid", name: "Livfull", matrix: concat(contrast(1.12), saturation(1.35)) },
  { id: "osterlen", name: "Österlen", matrix: concat(fade(0.07), concat(tint(1.05, 1.01, 0.93), saturation(0.9))) },
  { id: "evening", name: "Kväll", matrix: concat(brightness(-0.03), concat(tint(0.92, 0.97, 1.1), contrast(1.08))) },
  { id: "bw", name: "Svartvit", matrix: concat(contrast(1.15), saturation(0)) },
];


/**
 * Ritar bilden med filtret och returnerar en ny bild (data-adress, JPEG). `maxEdge` håller den i
 * lagom storlek. null om Skia inte kunde läsa bilden.
 */
export async function renderFiltered(uri: string, matrix: Matrix | null, maxEdge = 1600): Promise<{ uri: string; width: number; height: number } | null> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) return null;
  const scale = Math.min(1, maxEdge / Math.max(image.width(), image.height()));
  const width = Math.round(image.width() * scale);
  const height = Math.round(image.height() * scale);
  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  if (matrix) paint.setColorFilter(Skia.ColorFilter.MakeMatrix(matrix));
  canvas.drawImageRect(
    image,
    Skia.XYWHRect(0, 0, image.width(), image.height()),
    Skia.XYWHRect(0, 0, width, height),
    paint,
  );
  surface.flush();
  const snapshot = surface.makeImageSnapshot().makeNonTextureImage();
  const base64 = snapshot.encodeToBase64(ImageFormat.JPEG, 90);
  return { uri: `data:image/jpeg;base64,${base64}`, width, height };
}
