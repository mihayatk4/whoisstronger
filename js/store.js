/* Player progress. Lives in the browser (localStorage), no account needed. */
(function () {
  const W = window.WIS;
  const cfg = W.config;
  const E = W.engine;
  const KEY = "wis:v2";      // v2: new scoring (streak multipliers, sliders)
  const OLD_KEY = "wis:v1";
  let data = null;

  function load() {
    try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { data = null; }
    if (!data || data.v !== 2) {
      // keep settings (sound, records) from the old format; days were scored differently
      let old = null;
      try { old = JSON.parse(localStorage.getItem(OLD_KEY)); } catch (e) { /* ignore */ }
      data = { v: 2, settings: (old && old.settings) || { sound: true }, days: {} };
    }
    if (!data.settings) data.settings = { sound: true };
    if (!data.days) data.days = {};
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode: play without saving */ }
    try { window.dispatchEvent(new Event("wis:change")); } catch (e) { /* old browsers */ }
  }
  function blank() {
    return {
      // raw = sum of all round points (can dip below 0), score = raw but never below 0
      battle: { picks: [], done: false, raw: 0, score: 0, streak: 0, live: false },
      guess: { guesses: [], done: false, solved: false, points: 0, live: false },
      verdicts: {}
    };
  }
  const day = (key) => data.days[key] || blank();
  const ensure = (key) => data.days[key] || (data.days[key] = blank());

  /* pick (choice) = { type, a, b, pick, pts, mult, correct, contested, gap, streakAfter }
     pick (slider) = { type, a, b, guess, truth, e, pts }
     "live" marks a day finished on its own date (archive replays don't count
     towards the day streak). */
  function addPick(key, pick, totalRounds) {
    const b = ensure(key).battle;
    b.picks.push(pick);
    b.raw += pick.pts;
    b.score = Math.max(0, b.raw);
    if (pick.type === "choice") b.streak = pick.streakAfter;
    if (b.picks.length >= totalRounds) {
      b.done = true;
      b.live = key === E.todayKey();
    }
    save();
    return b;
  }

  function addGuess(key, id, correct) {
    const g = ensure(key).guess;
    g.guesses.push(id);
    if (correct) {
      g.solved = true;
      g.done = true;
      g.points = cfg.guessPoints[g.guesses.length - 1] || 0;
    } else if (g.guesses.length >= cfg.guessPoints.length) {
      g.done = true;
    }
    if (g.done) g.live = key === E.todayKey();
    save();
    return g;
  }

  function setVerdict(key, pair, value) {
    ensure(key).verdicts[pair] = value;
    save();
  }

  /* The day's score is the fights score (max 1000). Guess points are separate. */
  function dayTotal(key) {
    const d = day(key);
    return d.battle.done ? d.battle.score : 0;
  }

  /* Total fight points of every finished day: decides the global rank. */
  function totalPoints() {
    return Object.values(data.days).reduce((s, d) => s + (d.battle.done ? d.battle.score : 0), 0);
  }

  /* Day streak: a day counts when all its fights were played on that day.
     With streakFreeze, one missed day is forgiven, then the freeze recharges
     after 7 played days. */
  function streak() {
    const played = new Set(Object.keys(data.days).filter((k) => data.days[k].battle.done && data.days[k].battle.live).map(E.dayIndex));
    const today = E.dayIndex(E.todayKey());
    const run = (from, to, step, freezeLeft = true) => {
      // walks from "from" towards "to"; returns how many played days chain together
      let count = 0, freeze = !!cfg.streakFreeze && freezeLeft, since = 0;
      for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
        if (played.has(i)) {
          count++;
          if (++since >= 7) freeze = !!cfg.streakFreeze;
        } else if (freeze && played.has(i + step) && count > 0) {
          freeze = false; since = 0; // forgiven gap
        } else break;
      }
      return count;
    };
    let start = played.has(today) ? today : today - 1;
    let freezeLeft = true;
    // missed yesterday but played the day before: the freeze keeps the streak alive
    if (!played.has(start) && cfg.streakFreeze && played.has(start - 1)) { start -= 1; freezeLeft = false; }
    const current = run(start, 0, -1, freezeLeft);
    let best = current;
    Array.from(played).forEach((i) => { if (!played.has(i - 1)) best = Math.max(best, run(i, today, 1)); });
    return { current, best };
  }

  function summary() {
    let played = 0, battleDays = 0, battleSum = 0;
    const dist = new Array(cfg.guessPoints.length + 1).fill(0); // last slot = not solved
    Object.values(data.days).forEach((d) => {
      if (d.battle.done || d.guess.done) played++;
      if (d.battle.done) { battleDays++; battleSum += d.battle.score; }
      if (d.guess.done) dist[d.guess.solved ? d.guess.guesses.length - 1 : dist.length - 1]++;
    });
    return {
      played,
      avg: battleDays ? Math.round(battleSum / battleDays) : 0,
      total: totalPoints(),
      dist,
      streak: streak()
    };
  }

  load();
  W.store = {
    KEY, day, addPick, addGuess, setVerdict, dayTotal, totalPoints, streak, summary,
    get settings() { return data.settings; },
    setSound(on) { data.settings.sound = !!on; save(); },
    setSetting(key, value) { data.settings[key] = value; save(); }
  };
})();
