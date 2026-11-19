/* Builds the game's character files from the table data/characters.csv.

   Run from the project folder:
     node tools/build-data.js

   Writes:
     js/data/characters.js      numbers: tier, stats, colours, picture
     js/locales/en.characters.js texts: name, description, powers, feats, hints

   Pictures: if the "img" cell is empty, the script looks for
   assets/characters/<id>.jpg / .jpeg / .png / .webp and uses it if found.
   Nothing is written if the table has errors. */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CSV = path.join(ROOT, "data", "characters.csv");
const OUT_DATA = path.join(ROOT, "js", "data", "characters.js");
const OUT_TEXT = path.join(ROOT, "js", "locales", "en.characters.js");
const IMG_DIR = path.join(ROOT, "assets", "characters");

const STATS = ["strike", "speed", "durability", "stamina", "skill", "intellect", "abilities"];
const REQUIRED = ["id", "name", "universe", "tier", "power", ...STATS, "color1", "color2", "description", "powers",
  "feat1", "feat1_source", "emoji", "weapon", "rival", "role", "power_source",
  "hint_association", "hint_ability", "hint_fact"];
// readable words in the table -> short keys in the game (labels live in js/locales)
const ROLES = { "hero": "hero", "villain": "villain", "anti-hero": "antihero", "antihero": "antihero" };
const SOURCES = {
  "alien": "alien", "god": "god", "trained human": "human", "superpowered": "powered",
  "inner energy": "energy", "tech": "tech", "magic": "magic", "monster": "monster"
};

// ---------- CSV parsing (handles quotes, commas and line breaks inside cells) ----------
function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], cell = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ---------- main ----------
const errors = [], warnings = [];
const table = parseCsv(fs.readFileSync(CSV, "utf8"));
const head = table[0].map((h) => h.trim().toLowerCase());
const missingCols = REQUIRED.filter((c) => !head.includes(c));
if (missingCols.length) {
  console.error("Missing columns in data/characters.csv: " + missingCols.join(", "));
  process.exit(1);
}

const chars = [], texts = {}, seen = new Set();
table.slice(1).forEach((cells, i) => {
  const line = i + 2;
  const r = {};
  head.forEach((h, k) => (r[h] = (cells[k] || "").trim()));
  const where = `row ${line} (${r.id || r.name || "no id"})`;

  for (const c of REQUIRED) if (!r[c]) errors.push(`${where}: "${c}" is empty`);
  if (r.id && !/^[a-z0-9]+$/.test(r.id)) errors.push(`${where}: id must be lowercase letters and digits only`);
  if (seen.has(r.id)) errors.push(`${where}: id "${r.id}" is used twice`);
  seen.add(r.id);

  const tier = Number(r.tier);
  if (!(Number.isInteger(tier) && tier >= 1 && tier <= 6)) errors.push(`${where}: tier must be 1-6`);
  // power rating decides who wins: each tier owns a band of 150 points
  const power = Number(r.power);
  if (!(Number.isFinite(power) && power >= 1 && power <= 1000)) errors.push(`${where}: power must be 1-1000`);
  const band = [0, [100, 249], [250, 399], [400, 549], [550, 699], [700, 849], [850, 1000]][tier];
  if (band && power && (power < band[0] || power > band[1])) {
    warnings.push(`${where}: power ${power} is outside the ${band[0]}-${band[1]} band of tier ${tier}`);
  }
  const stats = {};
  for (const s of STATS) {
    const v = Number(r[s]);
    if (!(Number.isFinite(v) && v >= 1 && v <= 100)) errors.push(`${where}: ${s} must be a number 1-100`);
    stats[s] = Math.round(v);
  }
  for (const c of ["color1", "color2"]) {
    if (r[c] && !/^#[0-9a-fA-F]{6}$/.test(r[c])) errors.push(`${where}: ${c} must look like #ff8800`);
  }

  // picture: explicit file name, or auto-detect by id
  let img = r.img || "";
  if (img && !fs.existsSync(path.join(IMG_DIR, img))) {
    warnings.push(`${where}: picture "${img}" not found in assets/characters, the drawn emblem will be shown`);
  }
  if (!img) {
    const found = ["jpg", "jpeg", "png", "webp"].map((e) => `${r.id}.${e}`).find((f) => fs.existsSync(path.join(IMG_DIR, f)));
    if (found) img = found;
  }

  const role = ROLES[(r.role || "").toLowerCase()];
  const source = SOURCES[(r.power_source || "").toLowerCase()];
  if (r.role && !role) errors.push(`${where}: role must be Hero, Villain or Anti-hero`);
  if (r.power_source && !source) errors.push(`${where}: power_source must be one of: Alien, God, Trained human, Superpowered, Inner energy, Tech, Magic, Monster`);

  const entry = { id: r.id, tier, power: Math.round(power), group: r.group || "Other", role, source };
  if (/^(yes|y|1|true)$/i.test(r.guessable || "")) entry.guess = true;
  const diff = (r.difficulty || "medium").toLowerCase();
  if (!["easy", "medium", "hard"].includes(diff)) errors.push(`${where}: difficulty must be easy, medium or hard`);
  entry.diff = diff;
  if (img) entry.img = img;
  if (r.img_pos) entry.pos = r.img_pos;
  entry.colors = [r.color1, r.color2];
  entry.stats = stats;
  chars.push(entry);

  const feats = [1, 2, 3]
    .filter((n) => r["feat" + n])
    .map((n) => ({ text: r["feat" + n], source: r["feat" + n + "_source"] || "" }));
  feats.forEach((f, k) => { if (!f.source) warnings.push(`${where}: feat ${k + 1} has no source`); });

  texts[r.id] = {
    name: r.name,
    universe: r.universe,
    desc: r.description,
    abilities: r.powers.split(";").map((s) => s.trim()).filter(Boolean),
    feats,
    hints: {
      association: r.hint_association, emoji: r.emoji, ability: r.hint_ability,
      weapon: r.weapon, rival: r.rival, fact: r.hint_fact
    }
  };
});

// names must be unique too, otherwise the guess autocomplete gets confusing
const names = {};
Object.entries(texts).forEach(([id, tx]) => {
  const k = tx.name.toLowerCase();
  if (names[k]) errors.push(`name "${tx.name}" is used by both ${names[k]} and ${id}`);
  names[k] = id;
});

warnings.forEach((w) => console.warn("warning: " + w));
if (errors.length) {
  errors.forEach((e) => console.error("error: " + e));
  console.error(`\n${errors.length} error(s). Nothing was written. Fix the table and run again.`);
  process.exit(1);
}

const stamp = "/* GENERATED by tools/build-data.js from data/characters.csv. Do not edit by hand:\n   change the table and run  node tools/build-data.js  */\n";
const dataJs = stamp +
  "window.WIS = window.WIS || {};\n\n" +
  "/* tier: 1 Street, 2 City, 3 Country, 4 Planet, 5 Star, 6 Universe. stats: 1-100 */\n" +
  "WIS.characters = [\n" + chars.map((c) => "  " + JSON.stringify(c)).join(",\n") + "\n];\n";
const textJs = stamp +
  "window.WIS = window.WIS || {};\nWIS.locales = WIS.locales || {};\nWIS.locales.en = WIS.locales.en || {};\n\n" +
  "WIS.locales.en.characters = " + JSON.stringify(texts, null, 2) + ";\n";

fs.writeFileSync(OUT_DATA, dataJs, "utf8");
fs.writeFileSync(OUT_TEXT, textJs, "utf8");

// summary
const byTier = {}, byGroup = {};
chars.forEach((c) => {
  byTier[c.tier] = (byTier[c.tier] || 0) + 1;
  byGroup[c.group] = (byGroup[c.group] || 0) + 1;
});
const tierNames = ["", "Street", "City", "Country", "Planet", "Star", "Universe"];
console.log(`\nBuilt ${chars.length} characters (${chars.filter((c) => c.img).length} with pictures, ${chars.filter((c) => c.guess).length} guessable).`);
if (chars.filter((c) => c.guess).length < 7) console.warn("warning: fewer than 7 guessable characters - the daily answer will repeat often");
console.log("By tier:  " + [1, 2, 3, 4, 5, 6].map((t) => `${tierNames[t]} ${byTier[t] || 0}`).join(", "));
console.log("By group: " + Object.entries(byGroup).map(([g, n]) => `${g} ${n}`).join(", "));
const thin = [1, 2, 3, 4, 5, 6].filter((t) => (byTier[t] || 0) + (byTier[t - 1] || 0) + (byTier[t + 1] || 0) < 6);
if (thin.length) console.warn("warning: few opponents around tier(s) " + thin.join(", ") + " - daily fights may repeat");

// =====================================================================
// Curated daily fights: data/matchups.csv
//   one row = one fight; "day" 1 = config.scheduleStart; the last fight
//   of each day is the boss fight.
// =====================================================================
const M_CSV = path.join(ROOT, "data", "matchups.csv");
const OUT_SCHED = path.join(ROOT, "js", "data", "schedule.js");
const OUT_CARDS = path.join(ROOT, "js", "locales", "en.schedule.js");
const M_REQUIRED = ["day", "a", "b", "winner", "pct", "factor1", "start", "turning_point", "finish", "underdog_path"];

// game settings (power scale, daily range) from js/config.js
const CFG = (() => {
  const win = {};
  new Function("window", "var WIS = window.WIS = {}; " + fs.readFileSync(path.join(ROOT, "js", "config.js"), "utf8") + "; return WIS;")(win);
  return win.WIS.config;
})();

if (fs.existsSync(M_CSV)) {
  const mErr = [], mWarn = [], mInfo = [];
  const mt = parseCsv(fs.readFileSync(M_CSV, "utf8"));
  const mh = mt[0].map((h) => h.trim().toLowerCase());
  const miss = M_REQUIRED.filter((c) => !mh.includes(c));
  if (miss.length) { console.error("Missing columns in data/matchups.csv: " + miss.join(", ")); process.exit(1); }

  const byId = {};
  chars.forEach((c) => (byId[c.id] = c));
  const days = {}, cards = {}, pairSeen = {};
  mt.slice(1).forEach((cells, i) => {
    const r = {};
    mh.forEach((h, k) => (r[h] = (cells[k] || "").trim()));
    const where = `matchups row ${i + 2} (${r.a} vs ${r.b})`;
    for (const c of M_REQUIRED) if (!r[c]) mErr.push(`${where}: "${c}" is empty`);
    const day = Number(r.day), pct = Number(r.pct);
    if (!(Number.isInteger(day) && day >= 1)) mErr.push(`${where}: day must be 1, 2, 3...`);
    for (const id of [r.a, r.b]) if (id && !byId[id]) mErr.push(`${where}: unknown character id "${id}"`);
    if (r.a && r.a === r.b) mErr.push(`${where}: a character can't fight itself`);
    if (r.winner && r.winner !== r.a && r.winner !== r.b) mErr.push(`${where}: winner must be "${r.a}" or "${r.b}"`);
    if (!(Number.isFinite(pct) && pct >= 50 && pct <= 99)) mErr.push(`${where}: pct must be 50-99 (the winner's chance)`);
    const key = [r.a, r.b].sort().join("|");
    if (pairSeen[key]) mErr.push(`${where}: this pair is already used on day ${pairSeen[key]}`);
    pairSeen[key] = day;
    if (byId[r.a] && byId[r.b] && Math.abs(byId[r.a].tier - byId[r.b].tier) > 1) {
      mWarn.push(`${where}: tiers ${byId[r.a].tier} and ${byId[r.b].tier} are more than one apart`);
    }
    // the hand-judged verdict is what the game shows; compare it with raw power
    if (pct && (pct < CFG.dailyMinFav || pct > CFG.dailyMaxFav)) mWarn.push(`${where}: favorite's chance ${pct}% is outside ${CFG.dailyMinFav}-${CFG.dailyMaxFav}%`);
    if (byId[r.a] && byId[r.b] && r.winner) {
      const pA = 1 / (1 + Math.pow(10, -(byId[r.a].power - byId[r.b].power) / CFG.powerScale));
      const w = pA >= 0.5 ? r.a : r.b, fav = Math.round(Math.max(pA, 1 - pA) * 100);
      if (w !== r.winner) mInfo.push(`${r.a} vs ${r.b}: abilities flip it — raw power says ${w} ${fav}%, the matchup says ${r.winner} ${pct}%`);
      else if (Math.abs(fav - pct) >= 15) mInfo.push(`${r.a} vs ${r.b}: raw power ${fav}%, matchup ${pct}%`);
    }
    (days[day] = days[day] || []).push({ a: r.a, b: r.b, w: r.winner, pct: Math.round(pct) });
    cards[key] = {
      w: r.winner,
      factors: [r.factor1, r.factor2, r.factor3].filter(Boolean),
      start: r.start, turn: r.turning_point, finish: r.finish, path: r.underdog_path
    };
  });

  const dayNums = Object.keys(days).map(Number).sort((x, y) => x - y);
  const last = dayNums.length ? dayNums[dayNums.length - 1] : 0;
  for (let d = 1; d <= last; d++) {
    if (!days[d]) mErr.push(`day ${d} has no fights (days must go 1, 2, 3 without gaps)`);
    else if (days[d].length !== 5) mWarn.push(`day ${d} has ${days[d].length} fights instead of 5`);
  }
  // a character should rest a few days between appearances
  const lastDay = {};
  for (let d = 1; d <= last; d++) {
    (days[d] || []).forEach((f) => [f.a, f.b].forEach((id) => {
      if (lastDay[id] != null && d - lastDay[id] < 3) mWarn.push(`day ${d}: ${id} already fought on day ${lastDay[id]}`);
      lastDay[id] = d;
    }));
  }

  mWarn.forEach((w) => console.warn("warning: " + w));
  if (mInfo.length) console.log("Matchups that differ from raw power:\n  " + mInfo.join("\n  "));
  if (mErr.length) {
    mErr.forEach((e) => console.error("error: " + e));
    console.error(`\n${mErr.length} error(s) in matchups. Schedule was not written.`);
    process.exit(1);
  }
  const schedule = [];
  for (let d = 1; d <= last; d++) schedule.push(days[d]);
  fs.writeFileSync(OUT_SCHED, stamp.replace("data/characters.csv", "data/matchups.csv") +
    "window.WIS = window.WIS || {};\n\n" +
    "/* Curated daily fights. Day 1 = config.scheduleStart. Last fight of a day = boss.\n" +
    "   w = winner, pct = winner's chance. */\n" +
    "WIS.schedule = [\n" + schedule.map((d, i) => `  /* day ${i + 1} */ ` + JSON.stringify(d)).join(",\n") + "\n];\n", "utf8");
  fs.writeFileSync(OUT_CARDS, stamp.replace("data/characters.csv", "data/matchups.csv") +
    "window.WIS = window.WIS || {};\nWIS.locales = WIS.locales || {};\nWIS.locales.en = WIS.locales.en || {};\n\n" +
    "/* Matchup cards, key = two ids in alphabetical order joined by \"|\". */\n" +
    "WIS.locales.en.cards = " + JSON.stringify(cards, null, 2) + ";\n", "utf8");
  console.log(`Built schedule: ${schedule.length} curated day(s), ${Object.keys(cards).length} matchup cards.`);
}
