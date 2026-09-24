/**
 * Foton till minnen: välja ur kamerarullen och förbereda inför uppladdning.
 */
import * as ImagePicker from "expo-image-picker";
import { requireOptionalNativeModule } from "expo";

export const MAX_MEMORY_PHOTOS = 12;
/** Längsta sidan efter krympning. Räcker gott för en telefonskärm och håller lagringen liten. */
const MAX_EDGE = 1600;

export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

/** Öppnar kamerarullen. Returnerar högst `limit` foton (tom lista om man avbryter). */
export async function pickPhotos(limit: number): Promise<PickedPhoto[]> {
  if (limit <= 0) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    orderedSelection: true,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, limit).map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
}

/**
 * Krymper ett foto till högst `maxEdge` px (standard 1600) på längsta sidan och sparar det som JPEG.
 *
 * En app-version byggd innan expo-image-manipulator lades till saknar den
 * inbyggda modulen. Att ens försöka läsa in paketet då ger en krasch som inte
 * går att fånga med try/catch, så vi kontrollerar först om modulen finns och
 * laddar annars upp originalfotot som det är (det fungerar, men blir större).
 * Kontrollen kan tas bort när alla kör ett bygge som innehåller modulen.
 */
export async function preparePhoto(photo: PickedPhoto, maxEdge = MAX_EDGE): Promise<string> {
  if (!requireOptionalNativeModule("ExpoImageManipulator")) return photo.uri;
  try {
    const { ImageManipulator, SaveFormat } = await import("expo-image-manipulator");
    let context = ImageManipulator.manipulate(photo.uri);
    if (Math.max(photo.width, photo.height) > maxEdge) {
      context = context.resize(photo.width >= photo.height ? { width: maxEdge } : { height: maxEdge });
    }
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
    return saved.uri;
  } catch {
    return photo.uri;
  }
}
