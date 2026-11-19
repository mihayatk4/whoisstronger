/* Makes character pictures smaller (faster first load on phones).

     npm install --no-save sharp
     node tools/optimize-images.js

   For each picture in assets/characters: shrinks it to at most 480 px wide
   and re-compresses it. The file is replaced only if it gets at least 15%
   smaller. The untouched original is kept in assets/originals/ (first run
   only), so nothing is lost. File names and formats stay the same.        */
const fs = require("fs");
const path = require("path");
let sharp;
try { sharp = require(process.env.SHARP || "sharp"); } catch (e) {
  console.error("sharp is missing. Run: npm install --no-save sharp");
  process.exit(1);
}

const DIR = path.join(__dirname, "..", "assets", "characters");
const KEEP = path.join(__dirname, "..", "assets", "originals");
fs.mkdirSync(KEEP, { recursive: true });

(async () => {
  let before = 0, after = 0, changed = 0;
  for (const f of fs.readdirSync(DIR).filter((n) => /\.(jpe?g|png)$/i.test(n))) {
    const file = path.join(DIR, f);
    const src = fs.readFileSync(file);
    before += src.length;
    let img = sharp(src).rotate().resize({ width: 480, withoutEnlargement: true });
    img = /\.png$/i.test(f)
      ? img.png({ palette: true, quality: 88, effort: 10, compressionLevel: 9 })
      : img.jpeg({ quality: 82, mozjpeg: true });
    const out = await img.toBuffer();
    if (out.length < src.length * 0.85) {
      const keep = path.join(KEEP, f);
      if (!fs.existsSync(keep)) fs.writeFileSync(keep, src);
      fs.writeFileSync(file, out);
      after += out.length; changed++;
    } else after += src.length;
  }
  const mb = (n) => (n / 1048576).toFixed(1) + " MB";
  console.log(`${changed} pictures made smaller: ${mb(before)} -> ${mb(after)}. Originals: assets/originals/`);
})().catch((e) => { console.error(e.message); process.exit(1); });
