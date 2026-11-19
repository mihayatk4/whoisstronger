/* Game rules: dates, power formula, daily sets. No DOM code here. */
(function () {
  const W = window.WIS;
  const cfg = W.config;
  const STAT_KEYS = ["strike", "speed", "durability", "stamina", "skill", "intellect", "abilities"];
  const DAY_MS = 864e5;

  // ---------- texts ----------
  const locale = () => W.locales[cfg.locale] || W.locales.en;

  W.t = function (key, vars) {
    let s = locale().ui[key];
    if (s == null) s = W.locales.en.ui[key];
    if (s == null) return key;
    if (vars && typeof s === "string") {
      s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    }
    return s;
  };

  const byId = {};
  W.characters.forEach((c) => (byId[c.id] = c));
  W.char = (id) => byId[id];
  W.text = (id) => locale().characters[id] || W.locales.en.characters[id];
  W.tierName = (tier) => W.t("tierLabel", { tier: W.t("tiers")[tier] });

  // ---------- seeded random ----------
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function rngFrom(seedStr) {
    let a = xmur3(seedStr)();
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- dates (the day changes at local midnight) ----------
  const pad = (n) => String(n).padStart(2, "0");
  const keyOf = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const todayKey = () => keyOf(new Date());
  function keyToUTC(key) {
    const p = key.split("-").map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]);
  }
  const dayIndex = (key) => Math.round((keyToUTC(key) - keyToUTC(cfg.launchDate)) / DAY_MS);
  function keyFromIndex(i) {
    const d = new Date(keyToUTC(cfg.launchDate) + i * DAY_MS);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }
  function validKey(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    const i = dayIndex(key);
    return i >= 0 && i <= dayIndex(todayKey()) && keyFromIndex(i) === key;
  }
  function msToMidnight() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return next - now;
  }
  function formatDate(key) {
    const p = key.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(cfg.locale, { month: "short", day: "numeric" });
  }

  // ---------- power formula ----------
  function score(c) {
    let s = 0;
    STAT_KEYS.forEach((k) => (s += c.stats[k] * cfg.weights[k]));
    return s;
  }
  const pairKey = (idA, idB) => [idA, idB].sort().join("|");

  /* Hand-judged fights (data/matchups.csv) weigh weapons, abilities and
     counters, so their verdict beats raw power. Every other pair uses power. */
  const curated = {};
  (W.schedule || []).forEach((day) => day.forEach((f) => (curated[pairKey(f.a, f.b)] = f)));

  /* Win chance of a over b. Returns whole percents that always add up to 100. */
  function matchup(a, b) {
    // raw power (Elo on the rating); a hand-judged matchup overrides it
    let pA = 1 / (1 + Math.pow(10, -(a.power - b.power) / cfg.powerScale));
    pA = Math.min(1 - cfg.minChance, Math.max(cfg.minChance, pA));
    const basePctA = Math.round(pA * 100);
    const cur = curated[pairKey(a.id, b.id)];
    if (cur) pA = cur.w === a.id ? cur.pct / 100 : 1 - cur.pct / 100;
    const pctA = Math.round(pA * 100);
    const pctB = 100 - pctA;
    return {
      a: a.id, b: b.id, pA, pctA, pctB,
      even: pctA === pctB,
      favorite: pctA >= pctB ? a.id : b.id,
      underdog: pctA >= pctB ? b.id : a.id,
      favPct: Math.max(pctA, pctB),
      judged: !!cur,          // verdict from a hand-judged matchup
      basePctA                // what raw power alone says for a
    };
  }

  /* Normalised score: favorite = 100, underdog = its chance / favorite chance. */
  // ---------- scoring ----------
  const SC = cfg.scoring;
  const multAt = (streak) => SC.multipliers[Math.min(streak, SC.multipliers.length - 1)];

  /* A pick round. streak = right picks in a row before this one.
     Right pick: base x multiplier. Wrong: -(gap x multiplier) and the streak
     resets, except on contested pairs (gap <= contestedGap) where it stays. */
  function choiceResult(m, pickId, streak) {
    const gap = Math.abs(m.pctA - m.pctB);
    const contested = gap <= SC.contestedGap;
    const correct = m.even || pickId === m.favorite;
    const mult = multAt(streak);
    if (correct) return { correct, contested, gap, mult, pts: Math.round(SC.base * mult), streakAfter: streak + 1 };
    return { correct, contested, gap, mult, pts: -Math.round(gap * mult), streakAfter: contested ? streak : 0 };
  }

  /* A slider round. Off by up to `grace` = full points (a bullseye), then
     points = S x (1 - (e - grace) / (window - grace)) ^ curve, 0 from the window on. */
  function sliderPoints(e, max) {
    const grace = SC.sliderGrace || 0, curve = SC.sliderCurve || 3;
    if (e <= grace) return max;
    if (e >= SC.sliderWindow) return 0;
    return Math.round(max * Math.pow(1 - (e - grace) / (SC.sliderWindow - grace), curve));
  }

  /* Which rounds of a day are sliders: the count follows the weekday,
     the positions are random but the same for everyone. */
  function sliderPlan(index) {
    const key = keyFromIndex(index);
    const p = key.split("-").map(Number);
    const weekday = new Date(p[0], p[1] - 1, p[2]).getDay();
    const rounds = cfg.roundsPerDay;
    const count = Math.min(cfg.sliderWeek[weekday] || 0, rounds);
    const positions = shuffle([...Array(rounds).keys()], rngFrom("slider:" + index)).slice(0, count).sort((x, y) => x - y);
    return { count, positions, max: SC.sliderMax[count] || SC.sliderMax[1] };
  }

  /* green / amber / red feel of a finished round (pips, recap, share) */
  function moodOf(pick) {
    if (pick.type === "slider") return pick.e <= 2 ? "exact" : pick.e <= 10 ? "good" : pick.e <= 20 ? "mid" : "bad";
    return pick.correct ? "good" : pick.contested ? "mid" : "bad";
  }

  // ---------- global rank ----------
  function rankFor(total) {
    const list = cfg.ranks;
    let i = 0;
    while (i + 1 < list.length && total >= list[i + 1].at) i++;
    const cur = list[i], next = list[i + 1] || null;
    const progress = next ? (total - cur.at) / (next.at - cur.at) : 1;
    return { index: i, cur, next, total, progress: Math.max(0, Math.min(1, progress)) };
  }

  /* The hand-written matchup card for this fight, or null. */
  function card(m) {
    const c = (locale().cards || {})[pairKey(m.a, m.b)];
    return c && (c.w === m.favorite || m.even) ? c : null;
  }

  function explanation(m) {
    const fav = byId[m.favorite], dog = byId[m.underdog];
    const entry = (locale().matchups || {})[pairKey(m.a, m.b)];
    if (entry && (entry.w === m.favorite || m.even)) return entry.text;
    // Automatic fallback built from the biggest stat gaps
    const diffs = STAT_KEYS.map((k) => ({ k, d: (fav.stats[k] - dog.stats[k]) * cfg.weights[k] }));
    const up = diffs.slice().sort((x, y) => y.d - x.d);
    const down = diffs.slice().sort((x, y) => x.d - y.d);
    const low = (k) => W.t("stat." + k).toLowerCase();
    return W.t("auto.why", {
      w: W.text(fav.id).name, l: W.text(dog.id).name,
      s1: low(up[0].k), s2: low(up[1].k), s3: low(down[0].k)
    });
  }

  // ---------- daily set of fights ----------
  /* Each day is built from a seed, so every player gets the same fights.
     Days are generated in order because a day depends on the days before it
     (rest days for characters, no repeated pairs). */
  const dayCache = [];

  /* A daily fight needs a clear but not obvious favorite. */
  function interesting(a, b) {
    const f = matchup(a, b).favPct;
    return f >= cfg.dailyMinFav && f <= cfg.dailyMaxFav;
  }

  function tryBuild(pool, recent, rnd, need) {
    const order = shuffle(pool, rnd);
    const used = new Set();
    const pairs = [];
    for (const a of order) {
      if (pairs.length === need) break;
      if (used.has(a.id)) continue;
      const cands = order.filter(
        (b) => b !== a && !used.has(b.id) &&
          Math.abs(a.tier - b.tier) <= cfg.maxTierGap &&
          interesting(a, b) &&
          !recent.has(pairKey(a.id, b.id))
      );
      used.add(a.id);
      if (!cands.length) {
        const left = order.length - used.size;
        if (left < 2 * (need - pairs.length)) return null;
        continue;
      }
      const b = cands[Math.floor(rnd() * cands.length)];
      used.add(b.id);
      pairs.push([a, b]);
    }
    return pairs.length === need ? pairs : null;
  }

  function genDay(i) {
    const chars = W.characters;
    const need = Math.min(cfg.roundsPerDay, Math.floor(chars.length / 2));
    const cooldown = Math.max(0, Math.min(cfg.maxCooldownDays, Math.floor(chars.length / (need * 2)) - 1));

    const resting = new Set();
    for (let d = Math.max(0, i - cooldown); d < i; d++) {
      dayCache[d].pairs.forEach((p) => { resting.add(p.a); resting.add(p.b); });
    }
    const pool = chars.filter((c) => !resting.has(c.id));

    let built = null, rnd = null;
    for (let win = Math.min(cfg.pairMemoryDays, i); win >= 0 && !built; win--) {
      const recent = new Set();
      for (let d = i - win; d < i; d++) dayCache[d].pairs.forEach((p) => recent.add(pairKey(p.a, p.b)));
      for (let attempt = 0; attempt < 200 && !built; attempt++) {
        rnd = rngFrom("fights:" + i + ":" + win + ":" + attempt);
        built = tryBuild(pool, recent, rnd, need);
      }
    }
    if (!built) {
      // Safety net: should not happen with a sane roster. Pair anyone with anyone.
      rnd = rngFrom("fights-fallback:" + i);
      const order = shuffle(chars, rnd);
      built = [];
      for (let k = 0; k + 1 < order.length && built.length < need; k += 2) built.push([order[k], order[k + 1]]);
    }

    // Easy fights first, the closest one (the "boss") last.
    const withGap = built.map((p) => ({ p, gap: Math.abs(matchup(p[0], p[1]).pA - 0.5) }));
    withGap.sort((x, y) => y.gap - x.gap);
    const pairs = withGap.map(({ p }) => (rnd() < 0.5 ? { a: p[0].id, b: p[1].id } : { a: p[1].id, b: p[0].id }));
    return { pairs };
  }

  /* Curated days come from data/matchups.csv; every other day is generated. */
  function curatedDay(i) {
    const list = W.schedule || [];
    const k = i - dayIndex(cfg.scheduleStart || cfg.launchDate);
    if (k < 0 || k >= list.length) return null;
    return { pairs: list[k].map((f) => ({ a: f.a, b: f.b })), curated: true };
  }

  function battleDay(index) {
    for (let i = dayCache.length; i <= index; i++) dayCache[i] = curatedDay(i) || genDay(i);
    return dayCache[index];
  }

  // ---------- daily hidden character ----------
  /* Only well-known characters ("guessable" in the table) are hidden fighters. */
  const guessPool = (() => {
    const ids = W.characters.filter((c) => c.guess).map((c) => c.id);
    return ids.length ? ids : W.characters.map((c) => c.id);
  })();
  function blockOrder(block) {
    const order = shuffle(guessPool, rngFrom("guess:" + block));
    if (block > 0 && order.length > 1) {
      const prev = blockOrder(block - 1);
      if (order[0] === prev[prev.length - 1]) [order[0], order[1]] = [order[1], order[0]];
    }
    return order;
  }
  const orderCache = {};
  function guessTarget(index) {
    const n = guessPool.length;
    const block = Math.floor(index / n);
    if (!orderCache[block]) orderCache[block] = blockOrder(block);
    return orderCache[block][index % n];
  }

  /* Hints from vague to exact. Universe, group and tier are not hints:
     every wrong guess already compares them (see compare). */
  function hints(id) {
    const h = W.text(id).hints;
    return ["association", "emoji", "ability", "weapon", "rival", "fact"]
      .map((kind) => ({ kind, text: h[kind] || "" }))
      .slice(0, cfg.guessPoints.length);
  }

  /* How a wrong guess compares with the hidden fighter. */
  function compare(guessId, targetId) {
    const g = byId[guessId], tg = byId[targetId];
    const G = W.text(guessId), T = W.text(targetId);
    return [
      { key: "universe", value: G.universe, ok: G.universe === T.universe },
      { key: "tier", value: W.t("tiers")[g.tier], ok: g.tier === tg.tier, dir: tg.tier > g.tier ? "up" : tg.tier < g.tier ? "down" : "" },
      { key: "role", value: W.t("role." + g.role), ok: g.role === tg.role },
      { key: "source", value: W.t("source." + g.source), ok: g.source === tg.source }
    ];
  }

  // ---------- share squares ----------
  const SQUARE = { exact: "🎯", good: "🟩", mid: "🟨", bad: "🟥" };
  function battleSquares(battle, total) {
    let s = "";
    for (let i = 0; i < total; i++) {
      const p = battle.picks[i];
      if (!p) { s += "⬜"; continue; }
      if (p.type === "slider") s += p.e <= 2 ? "🎯" : p.e <= 10 ? "🟩" : p.e <= 20 ? "🟧" : "⬛";
      else s += SQUARE[moodOf(p)];
    }
    return s;
  }
  function guessSquares(guess) {
    const max = cfg.guessPoints.length;
    const wrong = guess.solved ? guess.guesses.length - 1 : guess.guesses.length;
    let s = "🟥".repeat(Math.min(wrong, max));
    if (guess.solved) s += "🟩";
    const used = wrong + (guess.solved ? 1 : 0);
    return s + "⬜".repeat(Math.max(0, max - used));
  }

  const maxBattle = () => SC.multipliers.slice(0, cfg.roundsPerDay).reduce((s, m) => s + SC.base * m, 0);
  const maxGuess = () => cfg.guessPoints[0];

  W.engine = {
    STAT_KEYS, rngFrom, shuffle,
    todayKey, dayIndex, keyFromIndex, validKey, msToMidnight, formatDate,
    score, matchup, explanation, card, pairKey,
    multAt, choiceResult, sliderPoints, sliderPlan, moodOf, rankFor,
    battleDay, guessTarget, hints, compare,
    battleSquares, guessSquares, maxBattle, maxGuess,
    maxTotal: () => maxBattle() + maxGuess()
  };
})();
