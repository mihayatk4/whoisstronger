/* Makes the site icons and the share preview picture (Open Graph).

   Run once after changing the logo or the preview fighters:
     npm install --no-save sharp
     node tools/make-images.js

   Writes:
     assets/icons/icon.svg, favicon-32.png, apple-touch-icon.png (180),
     icon-192.png, icon-512.png, icon-maskable-512.png
     assets/og.jpg (1200 x 630, shown when the link is shared)          */
const fs = require("fs");
const path = require("path");
let sharp;
try { sharp = require(process.env.SHARP || "sharp"); } catch (e) {
  console.error("sharp is missing. Run: npm install --no-save sharp");
  process.exit(1);
}

const ROOT = path.join(__dirname, "..");
const ICONS = path.join(ROOT, "assets", "icons");
fs.mkdirSync(ICONS, { recursive: true });

const ROSE = "#ff6f8e", SKY = "#5cb2ff", BG = "#0a0b0d";
// fighters on the preview picture (ids from data/characters.csv)
const LEFT = process.env.OG_LEFT || "goku";
const RIGHT = process.env.OG_RIGHT || "superman";

/* The logo: two slanted halves, rose and sky, with a dark gap (like the VS badge). */
function iconSvg(size, pad) {
  const p = pad || 0, s = 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-p} ${-p} ${s + 2 * p} ${s + 2 * p}" width="${size}" height="${size}">
  <rect x="${-p}" y="${-p}" width="${s + 2 * p}" height="${s + 2 * p}" fill="${BG}" ${p ? "" : 'rx="14"'}/>
  <clipPath id="c"><rect width="64" height="64" rx="14"/></clipPath>
  <g clip-path="url(#c)">
    <path d="M0 0h34L22 64H0z" fill="${ROSE}"/>
    <path d="M64 0H40L28 64h36z" fill="${SKY}"/>
  </g>
</svg>`;
}

function imgData(id) {
  const dir = path.join(ROOT, "assets", "characters");
  const file = fs.readdirSync(dir).find((f) => f.replace(/\.[^.]+$/, "") === id);
  if (!file) throw new Error("No picture for " + id);
  return path.join(dir, file);
}

async function portrait(id, w, h, pos) {
  // crop to the face area (top part), rounded corners
  const img = sharp(imgData(id)).resize(w, h, { fit: "cover", position: pos || "north" });
  const mask = Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="36" fill="#fff"/></svg>`);
  return img.composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

async function og() {
  const W = 1200, H = 630, PW = 360, PH = 410, TOP = 132;
  const font = "'Segoe UI Black','Arial Black','Segoe UI',Arial,sans-serif";
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="l" cx="22%" cy="60%" r="55%"><stop offset="0" stop-color="${ROSE}" stop-opacity=".35"/><stop offset="1" stop-color="${ROSE}" stop-opacity="0"/></radialGradient>
    <radialGradient id="r" cx="78%" cy="60%" r="55%"><stop offset="0" stop-color="${SKY}" stop-opacity=".35"/><stop offset="1" stop-color="${SKY}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#l)"/>
  <rect width="${W}" height="${H}" fill="url(#r)"/>
  <text x="${W / 2}" y="92" text-anchor="middle" font-family="${font}" font-weight="900" font-size="74" fill="#ffffff">Who's Stronger?</text>
  <rect x="${110 - 6}" y="${TOP - 6}" width="${PW + 12}" height="${PH + 12}" rx="40" fill="none" stroke="${ROSE}" stroke-width="6"/>
  <rect x="${W - 110 - PW - 6}" y="${TOP - 6}" width="${PW + 12}" height="${PH + 12}" rx="40" fill="none" stroke="${SKY}" stroke-width="6"/>
  <text x="${W / 2}" y="330" text-anchor="middle" font-family="${font}" font-size="30" font-weight="800" fill="#c9ced8">5 fights</text>
  <text x="${W / 2}" y="368" text-anchor="middle" font-family="${font}" font-size="30" font-weight="800" fill="#c9ced8">every day</text>
  <text x="${W / 2}" y="606" text-anchor="middle" font-family="${font}" font-size="28" font-weight="800" fill="#8a91a0">whoisstrongest.com</text>
</svg>`);
  const vs = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150">
  <clipPath id="c"><circle cx="75" cy="75" r="70"/></clipPath>
  <g clip-path="url(#c)"><path d="M0 0h82L64 150H0z" fill="${ROSE}"/><path d="M150 0H92L74 150h76z" fill="${SKY}"/></g>
  <circle cx="75" cy="75" r="70" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="5"/>
  <text x="75" y="97" text-anchor="middle" font-family="${font}" font-size="60" font-weight="900" fill="#fff">VS</text>
</svg>`);
  const [pl, pr] = await Promise.all([portrait(LEFT, PW, PH), portrait(RIGHT, PW, PH)]);
  await sharp(bg)
    .composite([
      { input: pl, left: 110, top: TOP },
      { input: pr, left: W - 110 - PW, top: TOP },
      { input: vs, left: W / 2 - 75, top: 390 }
    ])
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(path.join(ROOT, "assets", "og.jpg"));
}

(async () => {
  fs.writeFileSync(path.join(ICONS, "icon.svg"), iconSvg(64));
  const png = (svg, size, name) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(ICONS, name));
  await png(iconSvg(512), 32, "favicon-32.png");
  await png(iconSvg(512, 6), 180, "apple-touch-icon.png");
  await png(iconSvg(512), 192, "icon-192.png");
  await png(iconSvg(512), 512, "icon-512.png");
  await png(iconSvg(512, 14), 512, "icon-maskable-512.png");
  await og();
  console.log("icons + og.jpg written");
})().catch((e) => { console.error(e.message); process.exit(1); });
