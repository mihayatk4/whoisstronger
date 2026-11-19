/* Downloads character pictures from AniList for anime characters and notes
   where each picture came from.

   Run from the project folder:
     node tools/fetch-anilist.js                 anime characters without a picture
     node tools/fetch-anilist.js --dry           only show what would be picked
     node tools/fetch-anilist.js --only=gojo,dio just these ids
     node tools/fetch-anilist.js --force         replace pictures that already exist

   For every picture it fills these columns in data/characters.csv:
     img         file name in assets/characters/
     img_source  AniList page of the character
     img_date    date of download (YYYY-MM-DD)
   Then run  node tools/build-data.js  to update the game.

   Pictures on AniList are official artwork owned by their rights holders.
   Check the AniList API terms and the image rights before a public launch.
   Needs Node 18+ (built-in fetch). */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CSV = path.join(ROOT, "data", "characters.csv");
const IMG_DIR = path.join(ROOT, "assets", "characters");
const API = "https://graphql.anilist.co";
const PAUSE_MS = 2200; // AniList allows about 30 requests per minute

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const FORCE = args.includes("--force");
const ONLY = (args.find((a) => a.startsWith("--only=")) || "").replace("--only=", "").split(",").filter(Boolean);

/* AniList names differ from the short names used in the game. */
const SEARCH = {
  goku: "Goku Son", gohan: "Gohan Son", frieza: "Frieza", kidbuu: "Majin Buu", beerus: "Beerus",
  naruto: "Naruto Uzumaki", sasuke: "Sasuke Uchiha", madara: "Madara Uchiha", itachi: "Itachi Uchiha", kakashi: "Kakashi Hatake",
  luffy: "Monkey D. Luffy", zoro: "Roronoa Zoro", kaido: "Kaidou", whitebeard: "Edward Newgate",
  gojo: "Satoru Gojou", sukuna: "Ryoumen Sukuna", yuji: "Yuuji Itadori",
  tanjiro: "Tanjirou Kamado", rengoku: "Kyoujurou Rengoku", muzan: "Muzan Kibutsuji",
  allmight: "All Might", deku: "Izuku Midoriya", bakugo: "Katsuki Bakugou",
  levi: "Levi", eren: "Eren Yeager", killua: "Killua Zoldyck", netero: "Isaac Netero",
  ichigo: "Ichigo Kurosaki", aizen: "Sousuke Aizen", mob: "Shigeo Kageyama",
  jotaro: "Joutarou Kuujou", dio: "DIO", jinwoo: "Jin-Woo Sung"
};
/* Words that must appear in one of the character's series titles, so we
   don't grab a different character with the same name. */
const SERIES = {
  "Dragon Ball": ["dragon ball"], "Naruto": ["naruto", "boruto"], "One Piece": ["one piece"],
  "Jujutsu Kaisen": ["jujutsu"], "One Punch Man": ["one punch", "one-punch", "onepunch"],
  "Demon Slayer": ["kimetsu", "demon slayer"], "My Hero Academia": ["boku no hero", "my hero"],
  "Attack on Titan": ["shingeki", "attack on titan"], "Hunter x Hunter": ["hunter"],
  "Bleach": ["bleach"], "Chainsaw Man": ["chainsaw"], "Mob Psycho 100": ["mob psycho"],
  "JoJo's Bizarre Adventure": ["jojo"], "Solo Leveling": ["solo leveling", "ore dake level"]
};

const QUERY = `query ($search: String) {
  Page(perPage: 8) {
    characters(search: $search, sort: [SEARCH_MATCH, FAVOURITES_DESC]) {
      id name { full } siteUrl favourites image { large }
      media(perPage: 6) { nodes { title { romaji english } } }
    }
  }
}`;

// ---------- CSV (same rules as tools/build-data.js) ----------
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
const today = () => new Date().toISOString().slice(0, 10);

async function ask(search) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { search } })
    });
    if (res.status === 429) { // too many requests: wait as long as AniList says
      const wait = Number(res.headers.get("retry-after") || 60);
      console.log(`  rate limited, waiting ${wait}s`);
      await sleep(wait * 1000 + 500);
      continue;
    }
    if (!res.ok) throw new Error(`AniList answered ${res.status}`);
    const json = await res.json();
    return (json.data && json.data.Page && json.data.Page.characters) || [];
  }
  throw new Error("AniList keeps refusing (rate limit)");
}

function pick(found, universe) {
  const words = SERIES[universe] || [];
  const inSeries = (c) => c.media.nodes.some((m) =>
    [m.title.romaji, m.title.english].filter(Boolean).some((t) => words.some((w) => t.toLowerCase().includes(w))));
  const ok = found.filter((c) => c.image && c.image.large && !/default\.jpg$/.test(c.image.large));
  return ok.find(inSeries) || null;
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`picture download failed (${res.status})`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

(async function main() {
  const rows = parseCsv(fs.readFileSync(CSV, "utf8"));
  let head = rows[0];
  for (const [col, after] of [["img_source", "img_pos"], ["img_date", "img_source"]]) {
    if (!head.includes(col)) {
      const at = head.indexOf(after) + 1;
      head = [...head.slice(0, at), col, ...head.slice(at)];
      rows.slice(1).forEach((r, i) => rows[i + 1].splice(at, 0, ""));
    }
  }
  rows[0] = head;
  const col = (name) => head.indexOf(name);

  const todo = rows.slice(1).filter((r) => {
    const id = r[col("id")];
    if (ONLY.length) return ONLY.includes(id);
    if (r[col("group")] !== "Anime") return false;
    const hasFile = r[col("img")] && fs.existsSync(path.join(IMG_DIR, r[col("img")]));
    const autoFile = ["jpg", "jpeg", "png", "webp"].some((e) => fs.existsSync(path.join(IMG_DIR, `${id}.${e}`)));
    return FORCE || !(hasFile || autoFile);
  });

  console.log(`${todo.length} character(s) to look up${DRY ? " (dry run, nothing is saved)" : ""}\n`);
  const done = [], missed = [];
  for (const r of todo) {
    const id = r[col("id")], name = r[col("name")], universe = r[col("universe")];
    const search = SEARCH[id] || name;
    try {
      const found = await ask(search);
      const c = pick(found, universe);
      if (!c) {
        missed.push(`${id} (searched "${search}", nothing from ${universe})`);
        console.log(`✗ ${id}: no match in ${universe}`);
      } else {
        const ext = (c.image.large.match(/\.(jpe?g|png|webp)(\?|$)/i) || [, "jpg"])[1].toLowerCase().replace("jpeg", "jpg");
        const file = `${id}.${ext}`;
        console.log(`✓ ${id}: ${c.name.full} → ${file}  (${c.siteUrl})`);
        if (!DRY) {
          await download(c.image.large, path.join(IMG_DIR, file));
          r[col("img")] = file;
          r[col("img_source")] = c.siteUrl;
          r[col("img_date")] = today();
          // save after every picture, so a stop halfway keeps the progress
          fs.writeFileSync(CSV, "﻿" + rows.map((x) => x.map(esc).join(",")).join("\r\n") + "\r\n", "utf8");
        }
        done.push(id);
      }
    } catch (e) {
      missed.push(`${id} (${e.message})`);
      console.log(`✗ ${id}: ${e.message}`);
    }
    await sleep(PAUSE_MS);
  }

  console.log(`\n${done.length} found, ${missed.length} missed.`);
  if (missed.length) console.log("Missed:\n  " + missed.join("\n  "));
  if (!DRY && done.length) console.log("\nNow run:  node tools/build-data.js");
})().catch((e) => { console.error(e); process.exit(1); });
