/* Compares our power tiers with VS Battles Wiki (vsbattles.fandom.com).

   Run from the project folder:
     node tools/check-vsbw.js

   For every character it reads the wiki page of the version we rate
   (anime: peak anime/manga; Marvel, DC, The Boys, Invincible: the film or
   series version when there is one), takes the highest tier on that page,
   converts it to our 6 tiers and writes data/vsbw-report.csv + a summary.

   The wiki is a fan project with its own disputes. Use the report as a
   second opinion, not as the truth. Text on the wiki is CC-BY-SA. */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const API = "https://vsbattles.fandom.com/api.php";
const OUT = path.join(ROOT, "data", "vsbw-report.csv");

// our id -> wiki page of the version we rate
const PAGE = {
  goku: "Son Goku (DBS Anime)", vegeta: "Vegeta (DBS Anime)", gohan: "Son Gohan (DBS Manga)", frieza: "Frieza (DBS Manga)",
  beerus: "Beerus (Anime)", jiren: "Jiren (Anime)", broly: "Broly (Toei)", piccolo: "Piccolo (DBS Anime)",
  cell: "Cell (Manga)", kidbuu: "Majin Buu (Dragon Ball Z)",
  saitama: "Saitama", garou: "Garou", tatsumaki: "Tatsumaki (Tornado of Terror)", boros: "Lord Boros",
  naruto: "Naruto Uzumaki (New Era)", sasuke: "Sasuke Uchiha (New Era)", madara: "Madara Uchiha",
  itachi: "Itachi Uchiha", kakashi: "Kakashi Hatake",
  luffy: "Monkey D. Luffy (Emperor)", zoro: "Roronoa Zoro (Post-Timeskip)", kaido: "Kaidou (One Piece)",
  shanks: "Shanks", whitebeard: "Edward Newgate (Whitebeard)",
  gojo: "Satoru Gojo", sukuna: "Ryomen Sukuna", yuji: "Yuji Itadori",
  tanjiro: "Tanjiro Kamado", rengoku: "Kyojuro Rengoku", muzan: "Muzan Kibutsuji",
  allmight: "Toshinori Yagi (All Might)", deku: "Izuku Midoriya (Deku) (Final Act)", bakugo: "Katsuki Bakugo (Dynamight) (Final Act)",
  levi: "Levi Ackerman", eren: "Eren Yeager", killua: "Killua Zoldyck", meruem: "Meruem", netero: "Isaac Netero",
  ichigo: "Ichigo Kurosaki (Post-Timeskip)", aizen: "Sosuke Aizen", denji: "Denji (Chainsaw Man)", mob: "Shigeo Kageyama",
  jotaro: "Jotaro Kujo", dio: "Dio Brando", jinwoo: "Sung Jin-Woo (Novel)",
  superman: "Superman (DC Extended Universe)", batman: "Batman (DC Extended Universe)", wonderwoman: "Wonder Woman (DC Extended Universe)",
  flash: "Flash (DC Extended Universe)", aquaman: "Aquaman (DC Extended Universe)", cyborg: "Cyborg (DC Extended Universe)",
  shazam: "Shazam (DC Extended Universe)", darkseid: "Darkseid (DC Extended Universe)", doomsday: "Doomsday (DC Extended Universe)",
  blackadam: "Black Adam (DC Extended Universe)", joker: "The Joker (The Dark Knight Trilogy)", lexluthor: "Lex Luthor (DC Universe)",
  greenlantern: "Green Lantern (Hal Jordan) (DC Universe)", martianmanhunter: "Martian Manhunter (Post-Crisis)",
  drmanhattan: "Doctor Manhattan (Watchmen)",
  thor: "Thor (Marvel Cinematic Universe)", hulk: "Hulk (Marvel Cinematic Universe)", ironman: "Iron Man (Marvel Cinematic Universe)",
  captainamerica: "Captain America (Marvel Cinematic Universe)", spiderman: "Spider-Man (Marvel Cinematic Universe)",
  wolverine: "Wolverine (Deadpool & Wolverine)", blackpanther: "Black Panther (Marvel Cinematic Universe)",
  doctorstrange: "Doctor Strange (Marvel Cinematic Universe)", scarletwitch: "Scarlet Witch (Marvel Cinematic Universe)",
  captainmarvel: "Captain Marvel (Marvel Cinematic Universe)", thanos: "Thanos (Marvel Cinematic Universe)",
  galactus: "Galactus (Marvel Comics)", silversurfer: "Silver Surfer (Marvel Comics)",
  blackwidow: "Black Widow (Marvel Cinematic Universe)", deadpool: "Deadpool (FOX)", magneto: "Magneto (FOX: Post-Retcon)",
  phoenix: "Jean Grey (FOX: Post-Retcon)", venom: "Venom (Sony)", loki: "Loki (Marvel Cinematic Universe)",
  ghostrider: "Ghost Rider (Marvel Cinematic Universe)", sentry: "The Sentry (Marvel Cinematic Universe)",
  doctordoom: "Doctor Doom", storm: "Storm (Marvel Comics)", daredevil: "Daredevil (Marvel Cinematic Universe)",
  hela: "Hela (Marvel Cinematic Universe)",
  omniman: "Omni-Man (TV Series)", invincible: "Invincible (TV Series)", atomeve: "Atom Eve (TV Series)",
  battlebeast: "Battle Beast (TV Series)", thragg: "Thragg (Comics)",
  homelander: "Homelander (TV Series)", soldierboy: "Soldier Boy (TV Series)", butcher: "Billy Butcher (TV Series)",
  starlight: "Starlight (TV Series)", queenmaeve: "Queen Maeve (TV Series)",
  darthvader: "Darth Vader", yoda: "Yoda", voldemort: "Voldemort (Movies)", godzilla: "Godzilla (MonsterVerse)", johnwick: "John Wick"
};

/* Wiki tier code -> a number to sort by (bigger = stronger). */
function tierValue(code) {
  const m = /^(Low |High )?(\d{1,2})(?:-([A-C]))?$/.exec(code.trim());
  if (!m) return null;
  const num = Number(m[2]);
  const letter = m[3] ? { C: 0, B: 1, A: 2 }[m[3]] : 1;
  const mod = m[1] === "High " ? 0.5 : m[1] === "Low " ? -0.5 : 0;
  return (11 - num) * 3 + letter + mod;
}
/* Wiki tier number -> our 6 tiers:
   9-10 Street | 8, 7-C City | 7-B, 7-A, 6 Country | 5 Planet | 4 Star | 3 and above Universe */
function ourTier(code) {
  const m = /^(Low |High )?(\d{1,2})(?:-([A-C]))?$/.exec(code.trim());
  if (!m) return null;
  const n = Number(m[2]), l = m[3];
  if (n >= 9) return 1;
  if (n === 8 || (n === 7 && l === "C")) return 2;
  if (n === 7 || n === 6) return 3;
  if (n === 5) return 4;
  if (n === 4) return 5;
  return 6;
}

async function wikitext(title) {
  const u = API + "?" + new URLSearchParams({ format: "json", formatversion: "2", action: "query", prop: "revisions", rvprop: "content", rvslots: "main", redirects: "1", titles: title });
  const res = await fetch(u, { headers: { "user-agent": "character-tier-check/1.0" } });
  if (!res.ok) throw new Error("wiki answered " + res.status);
  const j = await res.json();
  const p = j.query && j.query.pages && j.query.pages[0];
  if (!p || p.missing || !p.revisions) throw new Error("page not found");
  return p.revisions[0].slots.main.content;
}

/* The "Tier:" line of a profile, and the highest tier code in it. */
function readTier(text) {
  const i = text.search(/\[\[Tiering System\|Tier\]\]|'''Tier'''/);
  if (i < 0) return null;
  const line = text.slice(i, text.indexOf("\n", i) > 0 ? text.indexOf("\n", i) : i + 400).replace(/<[^>]+>/g, "");
  const codes = [...line.matchAll(/\{\{\s*((?:Low |High )?\d{1,2}(?:-[A-C])?)\s*\}\}/g)].map((m) => m[1]);
  if (!codes.length) return { line: line.slice(0, 160), best: null };
  const best = codes.reduce((a, b) => (tierValue(b) > tierValue(a) ? b : a));
  return { line: line.replace(/\{\{|\}\}|'''|\[\[[^|\]]*\||\]\]/g, "").slice(0, 160), best };
}

(async function main() {
  global.window = global;
  for (const f of ["js/data/characters.js", "js/locales/en.js", "js/locales/en.characters.js"]) eval(fs.readFileSync(path.join(ROOT, f), "utf8"));
  const W = global.WIS;
  const rows = [["id", "name", "our_tier", "wiki_page", "wiki_best", "wiki_as_our_tier", "difference", "wiki_tier_line"]];
  const T = ["", "Street", "City", "Country", "Planet", "Star", "Universe"];
  let same = 0, off1 = 0, off2 = 0, missing = 0;
  for (const c of W.characters) {
    const name = W.locales.en.characters[c.id].name;
    const page = PAGE[c.id];
    let best = "", mapped = "", diff = "", line = "";
    try {
      if (!page) throw new Error("no page set");
      const info = readTier(await wikitext(page));
      if (!info || !info.best) throw new Error("tier not found on page");
      best = info.best; line = info.line;
      mapped = ourTier(best);
      diff = mapped - c.tier;
      if (diff === 0) same++; else if (Math.abs(diff) === 1) off1++; else off2++;
    } catch (e) { line = e.message; missing++; }
    rows.push([c.id, name, T[c.tier], page || "", best, mapped ? T[mapped] : "", diff === "" ? "" : (diff > 0 ? "+" : "") + diff, line]);
    console.log(`${c.id.padEnd(16)} ours ${T[c.tier].padEnd(8)} wiki ${String(best).padEnd(9)} → ${mapped ? T[mapped].padEnd(8) : "?".padEnd(8)} ${diff === "" ? "(" + line + ")" : diff === 0 ? "ok" : "DIFF " + diff}`);
    await new Promise((r) => setTimeout(r, 600));
  }
  const esc = (v) => { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  fs.writeFileSync(OUT, "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n", "utf8");
  console.log(`\nSame tier: ${same}, one tier apart: ${off1}, two or more apart: ${off2}, no data: ${missing}`);
  console.log("Report: data/vsbw-report.csv");
})().catch((e) => { console.error(e); process.exit(1); });
