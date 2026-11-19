/* Downloads pictures for Marvel, DC and a few movie characters from the open
   superhero database (github.com/akabab/superhero-api) and notes the source.

   Run from the project folder:
     node tools/fetch-superheroes.js                 characters from the list without a picture
     node tools/fetch-superheroes.js --dry           only show what would be downloaded
     node tools/fetch-superheroes.js --only=batman   just these ids
     node tools/fetch-superheroes.js --force         replace pictures that already exist

   Fills img / img_source / img_date in data/characters.csv, like
   tools/fetch-anilist.js. Then run  node tools/build-data.js

   The matches are listed by hand below (no guessing), because the database
   has several heroes with the same name (two Batmans, four Flashes...).
   The pictures are comic art owned by Marvel, DC and others: check the rights
   before a public launch. Needs Node 18+. */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CSV = path.join(ROOT, "data", "characters.csv");
const IMG_DIR = path.join(ROOT, "assets", "characters");
const BASE = "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/lg/";

// our id -> database picture (slug). Add a line here to cover a new character.
const MAP = {
  captainamerica: "149-captain-america", spiderman: "620-spider-man", wolverine: "717-wolverine",
  blackpanther: "106-black-panther", doctorstrange: "226-doctor-strange", scarletwitch: "579-scarlet-witch",
  captainmarvel: "157-captain-marvel",   // Carol Danvers
  thanos: "655-thanos", galactus: "273-galactus", silversurfer: "598-silver-surfer",
  blackwidow: "107-black-widow", deadpool: "213-deadpool", magneto: "423-magneto",
  phoenix: "517-phoenix", venom: "687-venom", loki: "414-loki", ghostrider: "280-ghost-rider",
  sentry: "583-sentry", doctordoom: "222-doctor-doom", storm: "638-storm", daredevil: "201-daredevil",
  hela: "321-hela",
  batman: "70-batman",                   // Bruce Wayne (69 is Terry McGinnis)
  wonderwoman: "720-wonder-woman",
  flash: "265-flash-ii",                 // Barry Allen
  aquaman: "38-aquaman",
  greenlantern: "306-hal-jordan",
  cyborg: "194-cyborg", martianmanhunter: "432-martian-manhunter",
  shazam: "156-captain-marvel",          // Billy Batson, Shazam's old name in DC
  darkseid: "204-darkseid", joker: "370-joker", lexluthor: "405-lex-luthor", doomsday: "230-doomsday",
  blackadam: "95-black-adam", drmanhattan: "233-dr-manhattan",
  darthvader: "208-darth-vader", yoda: "729-yoda", godzilla: "287-godzilla"
};

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const FORCE = args.includes("--force");
const ONLY = (args.find((a) => a.startsWith("--only=")) || "").replace("--only=", "").split(",").filter(Boolean);

function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async function main() {
  const rows = parseCsv(fs.readFileSync(CSV, "utf8"));
  const head = rows[0];
  for (const c of ["img", "img_source", "img_date"]) {
    if (!head.includes(c)) throw new Error(`column "${c}" is missing; run tools/fetch-anilist.js once or add it`);
  }
  const col = (n) => head.indexOf(n);
  const hasPicture = (r) => {
    const id = r[col("id")];
    return (r[col("img")] && fs.existsSync(path.join(IMG_DIR, r[col("img")]))) ||
      ["jpg", "jpeg", "png", "webp"].some((e) => fs.existsSync(path.join(IMG_DIR, `${id}.${e}`)));
  };
  const todo = rows.slice(1).filter((r) => {
    const id = r[col("id")];
    if (!MAP[id]) return false;
    if (ONLY.length) return ONLY.includes(id);
    return FORCE || !hasPicture(r);
  });

  console.log(`${todo.length} character(s) to download${DRY ? " (dry run, nothing is saved)" : ""}\n`);
  const done = [], missed = [];
  for (const r of todo) {
    const id = r[col("id")], url = BASE + MAP[id] + ".jpg";
    try {
      if (!DRY) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`download failed (${res.status})`);
        fs.writeFileSync(path.join(IMG_DIR, `${id}.jpg`), Buffer.from(await res.arrayBuffer()));
        r[col("img")] = `${id}.jpg`;
        r[col("img_source")] = url;
        r[col("img_date")] = new Date().toISOString().slice(0, 10);
        fs.writeFileSync(CSV, "﻿" + rows.map((x) => x.map(esc).join(",")).join("\r\n") + "\r\n", "utf8");
      }
      console.log(`✓ ${id} ← ${MAP[id]}`);
      done.push(id);
    } catch (e) {
      console.log(`✗ ${id}: ${e.message}`);
      missed.push(id);
    }
    await sleep(300);
  }
  const uncovered = rows.slice(1).filter((r) => !hasPicture(r) && !MAP[r[col("id")]]).map((r) => r[col("id")]);
  console.log(`\n${done.length} done, ${missed.length} failed.`);
  if (uncovered.length) console.log(`Not in the database (find these by hand): ${uncovered.join(", ")}`);
  if (!DRY && done.length) console.log("\nNow run:  node tools/build-data.js");
})().catch((e) => { console.error(e); process.exit(1); });
