/**
 * Foton till minnen: välja ur kamerarullen och förbereda inför uppladdning.
 */
import * as ImagePicker from "expo-image-picker";

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
 * Krymper ett foto till högst 1600 px på längsta sidan och sparar det som JPEG.
 * expo-image-manipulator läses in först här: en app-version byggd innan paketet
 * lades till saknar den inbyggda modulen, och då laddas originalfotot upp som det är
 * (fotot fungerar, men blir större). Fallbacken kan tas bort när alla kör en ny build.
 */
export async function preparePhoto(photo: PickedPhoto): Promise<string> {
  try {
    const { ImageManipulator, SaveFormat } = await import("expo-image-manipulator");
    let context = ImageManipulator.manipulate(photo.uri);
    if (Math.max(photo.width, photo.height) > MAX_EDGE) {
      context = context.resize(photo.width >= photo.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
    }
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
    return saved.uri;
  } catch {
    return photo.uri;
  }
}
