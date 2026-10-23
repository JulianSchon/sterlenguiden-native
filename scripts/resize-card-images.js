// Kortens bakgrundsbilder i rätt storlek: kör från en tillfällig mapp med sharp@0.33.5 installerat,
//   node resize-card-images.js <stor-bild.png> <id> <appens sökväg>/assets/cards
// Ger card-<id>.jpg, card-<id>@2x.jpg och card-<id>@3x.jpg (420, 840 och 1260 punkter breda).
// Ett kort visas som mest ungefär 400 punkter brett, så större bilder gör bara appen tyngre. Korten
// har inga genomskinliga delar, därför JPG: en tjugondel av PNG-storleken utan synlig skillnad.
const path = require("path");
const sharp = require("sharp");

const [src, id, out] = process.argv.slice(2);
if (!src || !id || !out) {
  console.error("node resize-card-images.js <stor-bild.png> <id> <assets/cards>");
  process.exit(1);
}
(async () => {
  for (const [suffix, width] of [["", 420], ["@2x", 840], ["@3x", 1260]]) {
    const file = path.join(out, `card-${id}${suffix}.jpg`);
    await sharp(src).resize({ width, kernel: "lanczos3" }).jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: "4:4:4" }).toFile(file);
    console.log(file);
  }
})();
